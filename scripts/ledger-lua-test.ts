// Ledger Lua verification — exercises the EXACT scripts from ledger.server.ts
// against a real Redis (started locally), driving them the same way the TS
// wrappers do (identical KEYS/ARGV ordering). Run: bun run scripts/ledger-lua-test.ts
import { execFileSync, spawn } from "node:child_process";
import {
  RESERVE_OR_FREE_SCRIPT,
  SETTLE_SCRIPT,
  RELEASE_SCRIPT,
  REAP_SCRIPT,
} from "../src/lib/billing/ledger.server";

const PORT = 6399;
const A = "0xabc"; // one test address; keys derive from it
const K = {
  ledger: `bill:ledger:${A}`,
  freeCount: `bill:free:count:${A}`,
  freeGids: `bill:free:gids:${A}`,
  seenGids: `bill:seen:${A}`,
  holds: `bill:holds:${A}`,
  settled: `bill:settled:${A}`,
  auth: `bill:auth:${A}`,
  history: `bill:history:${A}`,
};
const HOLD_TTL = 600_000;

function cli(...args: string[]): string {
  return execFileSync("redis-cli", ["-p", String(PORT), ...args], { encoding: "utf8" }).trim();
}
function evalScript(script: string, keys: string[], argv: (string | number)[]): unknown {
  const out = execFileSync(
    "redis-cli",
    ["-p", String(PORT), "EVAL", script, String(keys.length), ...keys, ...argv.map(String)],
    { encoding: "utf8" },
  ).trim();
  try {
    return JSON.parse(out);
  } catch {
    return out;
  }
}
const reserve = (gid: string, call: string, est: number, tokenHash: string, now = Date.now()) =>
  evalScript(
    RESERVE_OR_FREE_SCRIPT,
    [K.ledger, K.freeCount, K.freeGids, K.seenGids, K.holds, K.settled, K.auth],
    [gid, call, est, now, /*freeLimit*/ 2, HOLD_TTL, tokenHash],
  ) as { mode: string; reason?: string };
const settle = (gid: string, call: string, final: number) =>
  evalScript(
    SETTLE_SCRIPT,
    [K.ledger, K.holds, K.settled, K.history, K.freeGids],
    [gid, call, final, JSON.stringify({ t: "usage" }), 199],
  ) as { balanceCents: number };
const release = (gid: string, call: string) =>
  evalScript(RELEASE_SCRIPT, [K.ledger, K.holds, K.settled], [gid, call]);
const reap = (now: number) => evalScript(REAP_SCRIPT, [K.ledger, K.holds], [now]);

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    console.log(`  ✗ ${name} ${detail}`);
    failures++;
  }
}
const bal = () => Number(cli("HGET", K.ledger, "balanceCents") || "0");
const held = () => Number(cli("HGET", K.ledger, "heldCents") || "0");
const spent = () => Number(cli("HGET", K.ledger, "totalSpentCents") || "0");
const prompts = () => Number(cli("HGET", K.ledger, "promptsUsed") || "0");

const server = spawn("redis-server", ["--port", String(PORT), "--save", "", "--appendonly", "no"], {
  stdio: "ignore",
});
await new Promise((r) => setTimeout(r, 800));

try {
  cli("FLUSHALL");

  // Free & paid both now require a verified session token (proves address
  // ownership). Authorize the test wallet once up front.
  cli("HSET", K.auth, "tokenHash", "HASH", "revoked", "0");

  console.log("\n[A] Free tier (limit 2), free is per-gid across turns, requires a valid token");
  check("gid1 turn0 → free", reserve("g1", "c1", 100, "HASH").mode === "free");
  check("gid1 turn1 → free (same gid)", reserve("g1", "c2", 100, "HASH").mode === "free");
  check("gid2 → free (2nd free slot)", reserve("g2", "c3", 100, "HASH").mode === "free");
  const g3 = reserve("g3", "c4", 100, "HASH");
  check(
    "gid3 → blocked needs-funding (free exhausted, balance 0)",
    g3.mode === "blocked" && g3.reason === "needs-funding",
    JSON.stringify(g3),
  );
  const noTok = reserve("g4", "c5", 100, "");
  check(
    "no token → blocked not-authorized (can't farm/grief via bare address)",
    noTok.mode === "blocked" && noTok.reason === "not-authorized",
    JSON.stringify(noTok),
  );
  check(
    "promptsUsed counted once per gid = 3 (unauthorized attempt not counted)",
    prompts() === 3,
    `got ${prompts()}`,
  );
  check("free turns never touched balance", bal() === 0 && held() === 0);

  console.log("\n[B] Paid: authorize + fund, reserve holds, settle reconciles");
  cli("HSET", K.auth, "tokenHash", "HASH", "revoked", "0");
  cli("HSET", K.ledger, "balanceCents", "1000");
  const p = reserve("gp", "cp", 100, "HASH");
  check("paid reserve ok", p.mode === "paid", JSON.stringify(p));
  check(
    "balance 1000→900, held 100",
    bal() === 900 && held() === 100,
    `bal=${bal()} held=${held()}`,
  );
  const s = settle("gp", "cp", 30);
  check("settle final 30 → balance 900+(100-30)=970", s.balanceCents === 970, JSON.stringify(s));
  check("held released to 0", held() === 0);
  check("totalSpent = 30", spent() === 30, `got ${spent()}`);

  console.log("\n[C] Settle idempotency (no double charge on retry)");
  const s2 = settle("gp", "cp", 30);
  check("repeat settle is no-op, balance unchanged 970", s2.balanceCents === 970 && spent() === 30);

  console.log("\n[D] No-negative + atomic check-and-deduct (can't overspend past zero)");
  cli("DEL", K.ledger);
  cli("HSET", K.ledger, "balanceCents", "100");
  const a1 = reserve("gx", "ca", 80, "HASH");
  const a2 = reserve("gy", "cb", 80, "HASH");
  check("first 80 reserve → paid", a1.mode === "paid");
  check(
    "second 80 reserve → blocked needs-funding (only 20 left)",
    a2.mode === "blocked" && a2.reason === "needs-funding",
    JSON.stringify(a2),
  );
  check("balance never negative", bal() >= 0 && bal() === 20, `bal=${bal()}`);

  console.log("\n[E] Expired-hold reaping on next reserve");
  cli("DEL", K.ledger, K.holds, K.seenGids, K.freeGids, K.freeCount, K.settled);
  cli("HSET", K.ledger, "balanceCents", "100");
  cli("SET", K.freeCount, "2"); // force paid path
  const now0 = 1_000_000;
  reserve("gh", "ch", 50, "HASH", now0); // holds 50, expiresAt now0+TTL
  check(
    "after hold: balance 50, held 50",
    bal() === 50 && held() === 50,
    `bal=${bal()} held=${held()}`,
  );
  // Next reserve far in the future → the earlier hold is expired and reaped first.
  reserve("gh2", "ch2", 10, "HASH", now0 + HOLD_TTL + 1);
  check(
    "expired hold reaped: prior 50 returned before new reserve",
    // 100 - 10(new hold) = 90 after reap of the 50; held = 10 (old reaped, new held)
    bal() === 90 && held() === 10,
    `bal=${bal()} held=${held()}`,
  );

  console.log("\n[F] Revoked authorization blocks paid reserve");
  cli("DEL", K.ledger, K.holds, K.seenGids, K.freeGids, K.settled);
  cli("SET", K.freeCount, "2");
  cli("HSET", K.ledger, "balanceCents", "1000");
  cli("HSET", K.auth, "revoked", "1");
  const rv = reserve("gr", "cr", 50, "HASH");
  check(
    "revoked → blocked revoked",
    rv.mode === "blocked" && rv.reason === "revoked",
    JSON.stringify(rv),
  );
  check("revoked reserve didn't touch balance", bal() === 1000);
  cli("HSET", K.auth, "revoked", "0");

  console.log("\n[G] Wrong/absent token can't spend");
  const wt = reserve("gw", "cw", 50, "WRONGHASH");
  check(
    "mismatched token → blocked not-authorized",
    wt.mode === "blocked" && wt.reason === "not-authorized",
  );
  check("balance untouched", bal() === 1000);

  console.log("\n[H] Release restores a hold (aborted call, no charge)");
  cli("DEL", K.ledger, K.holds, K.seenGids, K.freeGids, K.settled);
  cli("SET", K.freeCount, "2");
  cli("HSET", K.ledger, "balanceCents", "500");
  reserve("grel", "crel", 70, "HASH");
  check("held 70 after reserve", bal() === 430 && held() === 70);
  release("grel", "crel");
  check(
    "release restores balance to 500, held 0",
    bal() === 500 && held() === 0,
    `bal=${bal()} held=${held()}`,
  );
  const sAfterRelease = settle("grel", "crel", 999);
  check(
    "settle after release is no-op (already in settled set)",
    sAfterRelease.balanceCents === 500 && spent() === 0,
  );

  console.log("\n[I] Reap-on-read returns an expired hold to spendable balance");
  cli("DEL", K.ledger, K.holds, K.seenGids, K.freeGids, K.settled);
  cli("SET", K.freeCount, "2");
  cli("HSET", K.ledger, "balanceCents", "300");
  const nowI = 5_000_000;
  reserve("gi", "ci", 120, "HASH", nowI); // holds 120, expiresAt nowI+TTL
  check("held 120 after reserve", bal() === 180 && held() === 120, `bal=${bal()} held=${held()}`);
  reap(nowI + 100); // not yet expired
  check("reap before expiry is a no-op", bal() === 180 && held() === 120);
  reap(nowI + HOLD_TTL + 1); // now expired
  check(
    "reap after expiry returns 120 to balance",
    bal() === 300 && held() === 0,
    `bal=${bal()} held=${held()}`,
  );

  console.log("\n[J] Dedup sets carry a TTL (bounded growth)");
  // Exercise a paid reserve+settle so both sets exist and are written with EXPIRE.
  cli("DEL", K.ledger, K.holds, K.seenGids, K.freeGids, K.settled);
  cli("SET", K.freeCount, "2");
  cli("HSET", K.ledger, "balanceCents", "500");
  reserve("gj", "cj", 40, "HASH");
  settle("gj", "cj", 20);
  const seenTtl = Number(cli("TTL", K.seenGids));
  const settledTtl = Number(cli("TTL", K.settled));
  check("seenGids has a positive TTL", seenTtl > 0, `ttl=${seenTtl}`);
  check("settled has a positive TTL", settledTtl > 0, `ttl=${settledTtl}`);
} finally {
  server.kill("SIGKILL");
}

console.log(
  failures === 0 ? "\nALL LEDGER LUA TESTS PASSED ✅" : `\n${failures} TEST(S) FAILED ❌`,
);
process.exit(failures === 0 ? 0 : 1);
