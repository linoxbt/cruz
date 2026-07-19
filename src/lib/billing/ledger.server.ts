import { redis, redisEval } from "./redis.server";
import { billingConfig } from "./config.server";
import type { HistoryEntry } from "./types";

// All amounts are integer USD-cents. Every mutating operation that must be
// race-free runs as a single Lua EVAL — Redis executes each script to
// completion before processing any other command, which is what makes
// "check balance, then deduct" safe against two concurrent requests from the
// same wallet (the actual race a plain GET-then-SET pair would lose).

function keys(addr: string) {
  const a = addr.toLowerCase();
  return {
    ledger: `bill:ledger:${a}`,
    freeCount: `bill:free:count:${a}`,
    freeGids: `bill:free:gids:${a}`,
    seenGids: `bill:seen:${a}`,
    holds: `bill:holds:${a}`,
    settled: `bill:settled:${a}`,
    auth: `bill:auth:${a}`,
    history: `bill:history:${a}`,
  };
}

const HISTORY_CAP = 199; // LTRIM 0 199 -> 200 entries kept

function historyEntry(type: HistoryEntry["type"], amountCents: number, detail?: string): string {
  const entry: HistoryEntry = {
    id: crypto.randomUUID(),
    type,
    amountCents,
    ts: Date.now(),
    detail,
  };
  return JSON.stringify(entry);
}

// Reaps any hold whose TTL has passed back into balance (crash/never-settled
// safety net — no background job needed, this runs inline on the next
// reserve call for that address) before doing anything else. cjson is part
// of Redis's built-in Lua environment (no `require`, standard on Upstash).
const RESERVE_OR_FREE_SCRIPT = `
local ledger, freeCount, freeGids, seenGids, holds, settled, auth = KEYS[1], KEYS[2], KEYS[3], KEYS[4], KEYS[5], KEYS[6], KEYS[7]
local gid, turn, est, now, freeLimit, holdTtl, callerTokenHash = ARGV[1], ARGV[2], tonumber(ARGV[3]), tonumber(ARGV[4]), tonumber(ARGV[5]), tonumber(ARGV[6]), ARGV[7]

-- 1. Lazily reap expired holds back into balance.
local heldFields = redis.call('HGETALL', holds)
for i = 1, #heldFields, 2 do
  local field, raw = heldFields[i], heldFields[i + 1]
  local ok, decoded = pcall(cjson.decode, raw)
  if ok and decoded.expiresAt and decoded.expiresAt < now then
    redis.call('HINCRBY', ledger, 'balanceCents', decoded.estCents)
    redis.call('HINCRBY', ledger, 'heldCents', -decoded.estCents)
    redis.call('HDEL', holds, field)
  end
end

-- 2. Count this generation toward promptsUsed exactly once, regardless of
--    free/paid outcome or how many turns it eventually takes.
if redis.call('SADD', seenGids, gid) == 1 then
  redis.call('HINCRBY', ledger, 'promptsUsed', 1)
end

-- 3. Free-tier path: once a gid is marked free, every turn of it is free.
if redis.call('SISMEMBER', freeGids, gid) == 1 then
  return cjson.encode({ mode = 'free' })
end
local used = tonumber(redis.call('GET', freeCount)) or 0
if used < freeLimit then
  redis.call('SADD', freeGids, gid)
  redis.call('INCR', freeCount)
  return cjson.encode({ mode = 'free' })
end

-- 4. Paid path: requires a live, non-revoked authorization matching the
--    caller's token, then an atomic balance check + hold.
local tokenHash = redis.call('HGET', auth, 'tokenHash')
local revoked = redis.call('HGET', auth, 'revoked')
if not tokenHash or tokenHash == '' then
  return cjson.encode({ mode = 'blocked', reason = 'not-authorized' })
end
if revoked == '1' then
  return cjson.encode({ mode = 'blocked', reason = 'revoked' })
end
if callerTokenHash == '' or callerTokenHash ~= tokenHash then
  return cjson.encode({ mode = 'blocked', reason = 'not-authorized' })
end
local balance = tonumber(redis.call('HGET', ledger, 'balanceCents')) or 0
if balance < est then
  return cjson.encode({ mode = 'blocked', reason = 'needs-funding' })
end
redis.call('HINCRBY', ledger, 'balanceCents', -est)
redis.call('HINCRBY', ledger, 'heldCents', est)
redis.call('HSET', holds, gid .. ':' .. turn, cjson.encode({ estCents = est, expiresAt = now + holdTtl }))
return cjson.encode({ mode = 'paid' })
`;

const SETTLE_SCRIPT = `
local ledger, holds, settled, history, freeGids = KEYS[1], KEYS[2], KEYS[3], KEYS[4], KEYS[5]
local gid, turn, finalCents, historyJson, cap = ARGV[1], ARGV[2], tonumber(ARGV[3]), ARGV[4], tonumber(ARGV[5])
local settleKey = gid .. ':' .. turn

if redis.call('SISMEMBER', settled, settleKey) == 1 then
  local bal = tonumber(redis.call('HGET', ledger, 'balanceCents')) or 0
  return cjson.encode({ balanceCents = bal })
end
redis.call('SADD', settled, settleKey)

-- Free turns (the gid claimed a free slot) never touch balance — record
-- history only. Determined from freeGids server-side, never trusted from the
-- caller, so a free turn can't be charged and a paid turn can't be skipped.
if redis.call('SISMEMBER', freeGids, gid) == 1 then
  redis.call('LPUSH', history, historyJson)
  redis.call('LTRIM', history, 0, cap)
  local bal = tonumber(redis.call('HGET', ledger, 'balanceCents')) or 0
  return cjson.encode({ balanceCents = bal })
end

-- Paid turn: reconcile the hold against the real measured cost.
local raw = redis.call('HGET', holds, settleKey)
if raw then
  local ok, decoded = pcall(cjson.decode, raw)
  local est = ok and decoded.estCents or finalCents
  redis.call('HDEL', holds, settleKey)
  redis.call('HINCRBY', ledger, 'heldCents', -est)
  redis.call('HINCRBY', ledger, 'balanceCents', est - finalCents)
else
  -- Hold already reaped by TTL (balance was fully refunded then) — the real
  -- measured cost still needs charging now.
  redis.call('HINCRBY', ledger, 'balanceCents', -finalCents)
end
local bal = tonumber(redis.call('HGET', ledger, 'balanceCents')) or 0
if bal < 0 then
  redis.call('HSET', ledger, 'balanceCents', 0)
  bal = 0
end
redis.call('HINCRBY', ledger, 'totalSpentCents', finalCents)
redis.call('LPUSH', history, historyJson)
redis.call('LTRIM', history, 0, cap)
return cjson.encode({ balanceCents = bal })
`;

const RELEASE_SCRIPT = `
local ledger, holds, settled = KEYS[1], KEYS[2], KEYS[3]
local gid, turn = ARGV[1], ARGV[2]
local settleKey = gid .. ':' .. turn
if redis.call('SISMEMBER', settled, settleKey) == 1 then
  return 'noop'
end
local raw = redis.call('HGET', holds, settleKey)
if raw then
  local ok, decoded = pcall(cjson.decode, raw)
  if ok then
    redis.call('HINCRBY', ledger, 'balanceCents', decoded.estCents)
    redis.call('HINCRBY', ledger, 'heldCents', -decoded.estCents)
  end
  redis.call('HDEL', holds, settleKey)
end
redis.call('SADD', settled, settleKey)
return 'released'
`;

export interface ReserveOutcome {
  mode: "free" | "paid" | "blocked";
  reason?: "not-authorized" | "revoked" | "needs-funding";
}

export async function reserveOrFree(
  address: string,
  gid: string,
  callId: string,
  estCents: number,
  callerTokenHash: string,
): Promise<ReserveOutcome> {
  const k = keys(address);
  const cfg = billingConfig();
  const now = Date.now();
  const HOLD_TTL_MS = 10 * 60 * 1000; // generous: covers slow generations, still bounded
  const raw = await redisEval<string>(
    RESERVE_OR_FREE_SCRIPT,
    [k.ledger, k.freeCount, k.freeGids, k.seenGids, k.holds, k.settled, k.auth],
    [gid, callId, estCents, now, cfg.freePrompts, HOLD_TTL_MS, callerTokenHash],
  );
  return JSON.parse(raw) as ReserveOutcome;
}

export async function settle(
  address: string,
  gid: string,
  callId: string,
  finalCents: number,
  detail?: string,
): Promise<{ balanceCents: number }> {
  const k = keys(address);
  const raw = await redisEval<string>(
    SETTLE_SCRIPT,
    [k.ledger, k.holds, k.settled, k.history, k.freeGids],
    [
      gid,
      callId,
      Math.max(0, Math.round(finalCents)),
      historyEntry("usage", finalCents, detail),
      HISTORY_CAP,
    ],
  );
  return JSON.parse(raw) as { balanceCents: number };
}

export async function releaseHold(address: string, gid: string, callId: string): Promise<void> {
  const k = keys(address);
  await redisEval<string>(RELEASE_SCRIPT, [k.ledger, k.holds, k.settled], [gid, callId]);
}

export async function credit(
  address: string,
  amountCents: number,
  detail: string,
): Promise<{ balanceCents: number }> {
  const k = keys(address);
  await redis(["HINCRBY", k.ledger, "balanceCents", String(Math.round(amountCents))]);
  await redis(["LPUSH", k.history, historyEntry("funding", amountCents, detail)]);
  await redis(["LTRIM", k.history, "0", String(HISTORY_CAP)]);
  const bal = await redis<string | null>(["HGET", k.ledger, "balanceCents"]);
  return { balanceCents: Number(bal) || 0 };
}

export interface AccountSnapshot {
  balanceCents: number;
  heldCents: number;
  totalSpentCents: number;
  promptsUsed: number;
  freeUsed: number;
  freeLimit: number;
  authorized: boolean;
  revoked: boolean;
  autoPay: boolean;
  lowBalanceThresholdCents: number;
  recentTransactions: HistoryEntry[];
}

export async function readAccount(address: string): Promise<AccountSnapshot> {
  const k = keys(address);
  const cfg = billingConfig();
  const [ledgerFields, freeUsedRaw, authFields, historyRaw] = await Promise.all([
    redis<Array<string | null>>([
      "HMGET",
      k.ledger,
      "balanceCents",
      "heldCents",
      "totalSpentCents",
      "promptsUsed",
    ]),
    redis<string | null>(["GET", k.freeCount]),
    redis<Array<string | null>>([
      "HMGET",
      k.auth,
      "tokenHash",
      "revoked",
      "autoPay",
      "lowBalanceThresholdCents",
    ]),
    redis<string[]>(["LRANGE", k.history, "0", "19"]),
  ]);
  const [balanceCents, heldCents, totalSpentCents, promptsUsed] = ledgerFields.map(
    (v) => Number(v) || 0,
  );
  const [tokenHash, revokedRaw, autoPayRaw, thresholdRaw] = authFields;
  return {
    balanceCents,
    heldCents,
    totalSpentCents,
    promptsUsed,
    freeUsed: Number(freeUsedRaw) || 0,
    freeLimit: cfg.freePrompts,
    authorized: !!tokenHash,
    revoked: revokedRaw === "1",
    autoPay: autoPayRaw === "1",
    lowBalanceThresholdCents: Number(thresholdRaw) || cfg.lowBalanceThresholdCents,
    recentTransactions: (historyRaw ?? []).map((s) => JSON.parse(s) as HistoryEntry),
  };
}
