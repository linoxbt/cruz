import { billingConfig } from "./config.server";

// Plain-fetch Upstash Redis REST client — no SDK, matching this repo's
// existing house style (every *.functions.ts file talks to its upstream
// over bare `fetch`, never a vendor SDK). Upstash's REST API accepts any
// raw Redis command as a JSON array of strings/numbers POSTed to the base
// URL, returning `{ result }` on success or `{ error }` on failure.
export class RedisError extends Error {}

type Cmd = Array<string | number>;

function auth(): { url: string; token: string } {
  const { upstash } = billingConfig();
  if (!upstash.url || !upstash.token) {
    throw new RedisError("Billing storage is not configured (UPSTASH_REDIS_REST_URL/TOKEN unset).");
  }
  return upstash;
}

/** One raw Redis command, e.g. redis(["HGET", "bill:ledger:0x..", "balanceCents"]). */
export async function redis<T = unknown>(cmd: Cmd): Promise<T> {
  const { url, token } = auth();
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const json = (await res.json().catch(() => null)) as { result?: T; error?: string } | null;
  if (!res.ok || !json || json.error) {
    throw new RedisError(json?.error || `Redis command failed (HTTP ${res.status}).`);
  }
  return json.result as T;
}

/** Multiple commands sent as one round trip; NOT atomic (use redisEval for
 *  that) — just a batching convenience for independent reads. */
export async function redisPipeline<T = unknown>(cmds: Cmd[]): Promise<T[]> {
  if (cmds.length === 0) return [];
  const { url, token } = auth();
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(cmds),
  });
  const json = (await res.json().catch(() => null)) as Array<{ result?: T; error?: string }> | null;
  if (!res.ok || !json) throw new RedisError(`Redis pipeline failed (HTTP ${res.status}).`);
  return json.map((entry, i) => {
    if (entry.error) throw new RedisError(`Redis pipeline command ${i} failed: ${entry.error}`);
    return entry.result as T;
  });
}

/** Runs a Lua script atomically (single-threaded Redis guarantees no
 *  interleaving with any other command while it runs) — this is the ONLY
 *  mechanism in this module that provides real atomicity; plain redis()/
 *  redisPipeline() calls can always race against a concurrent request. */
export async function redisEval<T = unknown>(
  script: string,
  keys: string[],
  args: Array<string | number>,
): Promise<T> {
  return redis<T>(["EVAL", script, String(keys.length), ...keys, ...args]);
}
