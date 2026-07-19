import { verifyMessage } from "viem";
import { redis } from "./redis.server";

// SIWE-style spending authorization. The design goal (see the billing plan):
// a wallet consents ONCE to let CRUZ auto-debit its prepaid balance per
// request, instead of signing every prompt — and can revoke that at any time
// with the balance preserved. The authorization record in Redis
// (bill:auth:{addr}) IS the session: a stateless JWT couldn't be revoked
// without a server-side denylist anyway, so the record is the source of
// truth and the token handed to the client is just an opaque bearer whose
// SHA-256 hash is what's stored (the raw token never touches Redis).

function keys(addr: string) {
  const a = addr.toLowerCase();
  return { nonce: `bill:nonce:${a}`, auth: `bill:auth:${a}` };
}

const NONCE_TTL_SECONDS = 300;

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Builds the exact human-readable message the wallet signs. The nonce binds
 *  it to one server-issued challenge (single-use, short-lived); the consent
 *  sentence is explicit so the wallet UI shows the user precisely what they're
 *  agreeing to. */
export function buildAuthMessage(address: string, nonce: string): string {
  return [
    "CRUZ AI Builder — spending authorization",
    "",
    "I authorize CRUZ to automatically debit my prepaid CRUZ balance to pay",
    "for AI Builder generations I request, until I revoke this authorization.",
    "This does not move any funds by itself and can be revoked at any time;",
    "my remaining balance is always preserved.",
    "",
    `Wallet: ${address.toLowerCase()}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}

/** Issues a fresh single-use nonce and returns the message to sign. */
export async function issueNonce(address: string): Promise<{ nonce: string; message: string }> {
  const nonce = randomHex(16);
  await redis(["SET", keys(address).nonce, nonce, "EX", String(NONCE_TTL_SECONDS)]);
  return { nonce, message: buildAuthMessage(address, nonce) };
}

export interface AuthorizeResult {
  ok: boolean;
  token?: string;
  message?: string;
}

/** Verifies the signature against the stored nonce and, on success, records
 *  the authorization + returns an opaque bearer token (only its hash is
 *  persisted). Consumes the nonce so a signature can't be replayed. */
export async function authorizeSpending(
  address: `0x${string}`,
  signature: `0x${string}`,
  autoPay: boolean,
): Promise<AuthorizeResult> {
  const k = keys(address);
  const nonce = await redis<string | null>(["GET", k.nonce]);
  if (!nonce) return { ok: false, message: "Authorization challenge expired. Try again." };

  const message = buildAuthMessage(address, nonce);
  let valid = false;
  try {
    valid = await verifyMessage({ address, message, signature });
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, message: "Signature did not match the connected wallet." };

  const token = randomHex(32);
  const tokenHash = await sha256Hex(token);
  await redis([
    "HSET",
    k.auth,
    "tokenHash",
    tokenHash,
    "authorizedAt",
    String(Date.now()),
    "autoPay",
    autoPay ? "1" : "0",
    "revoked",
    "0",
  ]);
  await redis(["DEL", k.nonce]); // single-use
  return { ok: true, token };
}

/** Marks the authorization revoked. Balance is untouched; a paid reserve is
 *  blocked from here on, and the user can re-authorize (fresh nonce/sign) to
 *  resume with the same balance. Requires the caller's current token so a
 *  third party can't revoke someone else's authorization. */
export async function revokeSpending(
  address: `0x${string}`,
  token: string,
): Promise<{ ok: boolean; message?: string }> {
  const k = keys(address);
  if (!(await verifyToken(address, token))) {
    return { ok: false, message: "Not authorized to revoke." };
  }
  await redis(["HSET", k.auth, "revoked", "1"]);
  return { ok: true };
}

/** True iff `token` matches the stored authorization hash and it isn't
 *  revoked. Used to gate every paid action (the reserve Lua also checks the
 *  hash, but this is the cheap pre-check for server fns). */
export async function verifyToken(address: string, token: string | null): Promise<boolean> {
  if (!token) return false;
  const k = keys(address);
  const [storedHash, revoked] = await redis<Array<string | null>>([
    "HMGET",
    k.auth,
    "tokenHash",
    "revoked",
  ]);
  if (!storedHash || revoked === "1") return false;
  return (await sha256Hex(token)) === storedHash;
}

/** The token hash to pass into the reserve Lua script (which compares it to
 *  the stored hash atomically). Empty string when unauthenticated — the Lua
 *  treats that as "not authorized". */
export async function tokenHashFor(token: string | null): Promise<string> {
  return token ? sha256Hex(token) : "";
}
