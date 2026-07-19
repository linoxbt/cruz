// Web3 SDKs (Magic, Particle, viem/wagmi) rarely throw a plain `Error` — they
// usually attach the real cause on `.message`, `.reason`, `.details`, or a
// nested `.data.message`/`.cause.message`/`.error.message`. Falling straight
// back to a generic string (e.g. "Execution failed" / "system error") throws
// that detail away. Walk the common shapes before giving up, and log the full
// object to the console so the raw provider payload is always inspectable.
export function describeWeb3Error(e: unknown, fallback = "Something went wrong."): string {
  try {
    console.error("[cruz] web3 error:", e);
  } catch {
    /* console may be unavailable */
  }
  if (e && typeof e === "object") {
    const obj = e as Record<string, unknown>;
    const nested = (k: string) => (obj[k] as Record<string, unknown> | undefined)?.message;
    const candidates = [
      obj.shortMessage,
      obj.reason,
      obj.details,
      obj.message,
      nested("data"),
      nested("cause"),
      nested("error"),
      nested("response"),
    ];
    for (const c of candidates) {
      if (typeof c === "string" && c.trim() && c.trim().toLowerCase() !== "system error") return c;
    }
    // If the only thing on offer is a bare "system error", keep it but add a
    // hint — it's almost always an upstream routing/funds/config condition.
    for (const c of candidates) {
      if (typeof c === "string" && c.trim()) {
        return `${c} (upstream provider error — check the browser console for the full payload; common causes: insufficient balance/gas on the source chain, or the account isn't set up for this action yet).`;
      }
    }
  }
  if (e instanceof Error && e.message) return e.message;
  return `${fallback} See the browser console for details.`;
}
