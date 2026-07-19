import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ARBITRUM_BLOCKSCOUT_URL } from "@/lib/chains";

// Server-side proxy to Arbitrum's Blockscout v2 API. Fetching from the server
// avoids browser CORS limits and keeps the Explorer working in SSR. CRUZ is
// single-chain (Arbitrum One), so unlike a multi-chain explorer there's no
// chainId param here — just the path within /api/v2, validated against a
// known resource namespace so this can't be used to fetch arbitrary URLs.

// JSON-serializable value type (TanStack Start validates server-fn returns are
// serializable, so the proxied Blockscout payload can't be typed as `unknown`).
type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

const ALLOWED =
  /^\/(stats|main-page|blocks|transactions|tokens|addresses|search|smart-contracts)(\/|\?|$)/;

const input = z.object({ path: z.string().min(1).max(512) });

export const getExplorerData = createServerFn({ method: "GET" })
  .inputValidator(input)
  .handler(async ({ data }) => {
    const { path } = data;
    // ALLOWED only checks the path's prefix, so a value like
    // "/blocks/../../../admin/secret" still matches it while resolving to a
    // completely different path once the URL is constructed below (the
    // fetch/URL parser normalizes ".." segments). Reject any dot-dot segment
    // outright as a same-host path-traversal check — the host itself is
    // always the fixed ARBITRUM_BLOCKSCOUT_URL below, never caller-controlled.
    if (path.includes("..") || !ALLOWED.test(path)) {
      return { ok: false as const, status: 400, error: "Unsupported explorer path" };
    }
    const url = `${ARBITRUM_BLOCKSCOUT_URL}/api/v2${path}`;
    try {
      const resp = await fetch(url, { headers: { accept: "application/json" } });
      if (!resp.ok) {
        return {
          ok: false as const,
          status: resp.status,
          error: `Explorer returned ${resp.status}`,
        };
      }
      const json = (await resp.json()) as JsonValue;
      return { ok: true as const, status: 200, data: json };
    } catch (e) {
      return {
        ok: false as const,
        status: 502,
        error: e instanceof Error ? e.message : "Explorer unreachable",
      };
    }
  });
