import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rateLimit.server";
import { isBillingConfigured } from "@/lib/billing/config.server";
import { getBillingProvider } from "@/lib/billing/index.server";
import { computeCostFromStream, estimateCostCents } from "@/lib/billing/cost.server";
import type { BillingCtx } from "@/lib/billing/types";

// Server-side AI proxy for the AI Builder. When the deployment sets a
// server-only key (NO VITE_ prefix, so it never enters the client bundle),
// the browser calls THIS route instead of the provider directly, and the key
// never reaches the browser at all — a stronger guarantee than the
// bring-your-own-key path, which stores the key in the browser's localStorage.
//
// POST { system, messages }  → streams the provider's SSE response back
//                              verbatim, tagged with x-ai-provider so the
//                              client knows which delta format to parse.
// GET                        → { configured, provider } so the client can tell
//                              whether the proxy is usable before trying it.
//
// Enable on the client with VITE_AI_PROXY=true (public, just a flag). Without
// a server key, POST returns 501 and GET reports configured:false so the UI
// can disable the option instead of letting a request silently fail.
//
// Rate-limited (see rateLimit.server.ts): this route holds a shared,
// operator-funded provider key with no per-user auth, so an unlimited proxy
// would let anyone burn that key's entire budget.
const PER_IP_LIMIT = 20;
const GLOBAL_LIMIT = 300;
const WINDOW_MS = 5 * 60 * 1000;

type Provider = "anthropic" | "0g" | "openai";

interface ServerConfig {
  provider: Provider;
  anthropic: { endpoint: string; key: string; model: string };
  zg: { endpoint: string; key: string; model: string };
  openai: { endpoint: string; key: string; model: string };
}

// Server-only env — no VITE_ prefix on purpose, so Vite never inlines these
// into the client bundle.
function serverConfig(): ServerConfig {
  const e = process.env;
  const openrouterKey = e.OPENROUTER_API_KEY || "";
  const openaiEndpoint =
    e.OPENAI_ENDPOINT ||
    e.AI_ENDPOINT ||
    (openrouterKey ? "https://openrouter.ai/api/v1/chat/completions" : "");
  const openaiKey = e.OPENAI_API_KEY || e.AI_API_KEY || openrouterKey;
  const openaiModel =
    e.OPENAI_MODEL || e.AI_MODEL || (openrouterKey ? "openai/gpt-4o-mini" : "gpt-4o-mini");

  const provider: Provider =
    (e.AI_PROVIDER as Provider) ||
    (e.ZG_API_KEY ? "0g" : e.ANTHROPIC_API_KEY ? "anthropic" : openaiKey ? "openai" : "anthropic");

  return {
    provider,
    anthropic: {
      endpoint: e.ANTHROPIC_ENDPOINT || "https://api.anthropic.com",
      key: e.ANTHROPIC_API_KEY || "",
      model: e.ANTHROPIC_MODEL || "claude-opus-4-8",
    },
    zg: {
      endpoint: e.ZG_ENDPOINT || "https://router-api.0g.ai",
      key: e.ZG_API_KEY || "",
      model: e.ZG_MODEL || "claude-opus-4-8",
    },
    openai: { endpoint: openaiEndpoint, key: openaiKey, model: openaiModel },
  };
}

function isConfigured(c: ServerConfig): boolean {
  if (c.provider === "anthropic") return !!c.anthropic.key;
  if (c.provider === "0g") return !!c.zg.key;
  return !!c.openai.endpoint && !!c.openai.key;
}

// Cap on ONE provider call's reply length, not the overall turn — the
// client (src/lib/ai.ts) automatically continues past a length-limited
// cutoff with further calls when needed, so this stays moderate rather than
// the provider's real ceiling (confirmed live to accept up to at least
// 128000) to avoid a single request risking a platform function timeout.
const MAX_TOKENS = 16000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const chatBodySchema = z.object({
  system: z.string().optional(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
  // Optional billing context (CRUZ-Default path only). Present only when the
  // client is a wallet-connected AI Builder session and billing is enabled;
  // absent for BYOK, the Solidity AI chat, or any unconfigured deployment —
  // in which case this route behaves exactly as it did before billing.
  billing: z
    .object({
      address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      token: z.string().nullable().optional(),
      gid: z.string().min(1),
    })
    .optional(),
});

async function upstreamRequest(
  c: ServerConfig,
  system: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  signal: AbortSignal,
) {
  if (c.provider === "anthropic" || c.provider === "0g") {
    const cfg = c.provider === "0g" ? c.zg : c.anthropic;
    // 0G's router (router-api.0g.ai) 500s "upstream_error" on ANY request
    // with a top-level `system` field — confirmed directly against the live
    // endpoint. Folding it into the messages array as a synthetic opening
    // exchange works around it. Native api.anthropic.com doesn't need this
    // and keeps sending the real `system` field, which is more faithful to
    // how Claude actually weighs system instructions.
    const use0gWorkaround = c.provider === "0g";
    const anthropicMessages =
      use0gWorkaround && system
        ? [
            { role: "user" as const, content: system },
            { role: "assistant" as const, content: "Understood." },
            ...messages,
          ]
        : messages;

    const body = JSON.stringify({
      model: cfg.model,
      max_tokens: MAX_TOKENS,
      ...(use0gWorkaround ? {} : { system }),
      messages: anthropicMessages,
      stream: true,
    });
    const headers = {
      "content-type": "application/json",
      "x-api-key": cfg.key,
      "anthropic-version": "2023-06-01",
    };

    // Some provider nodes (0G's router included) have exactly one backing
    // node per model, so transient 404/500s are expected — retry up to 3
    // total attempts with a short backoff before surfacing the failure. Only
    // retry statuses that can plausibly succeed on a retry (routing hiccups,
    // rate limits, upstream 5xx) — a 400/401/403 means the request or key is
    // bad and will fail identically every time.
    const RETRYABLE = new Set([404, 408, 409, 429, 500, 502, 503, 504]);
    let res: Response | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(`${cfg.endpoint}/v1/messages`, { method: "POST", headers, body, signal });
      if (res.ok || !RETRYABLE.has(res.status)) break;
      if (attempt < 2) await sleep(600 * (attempt + 1));
    }
    return res as Response;
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${c.openai.key}`,
  };
  if (c.openai.endpoint.includes("openrouter")) {
    headers["HTTP-Referer"] = "https://cruz.dev";
    headers["X-Title"] = "CRUZ";
  }
  return fetch(c.openai.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: c.openai.model,
      messages: [{ role: "system", content: system }, ...messages],
      temperature: 0.2,
      max_tokens: MAX_TOKENS,
      stream: true,
    }),
    signal,
  });
}

export const Route = createFileRoute("/api/ai")({
  server: {
    handlers: {
      GET: () => {
        const c = serverConfig();
        // Deliberately minimal: an anonymous caller only learns whether SOME
        // provider is configured, not which key/value — that's reconnaissance
        // for the abuse this route rate-limits against.
        return Response.json({ configured: isConfigured(c) });
      },

      POST: async ({ request }) => {
        const ip = clientKeyFromRequest(request);
        if (
          !checkRateLimit(`ai:ip:${ip}`, PER_IP_LIMIT, WINDOW_MS) ||
          !checkRateLimit("ai:global", GLOBAL_LIMIT, WINDOW_MS)
        ) {
          return Response.json(
            { error: { message: "Rate limit exceeded. Try again shortly." } },
            { status: 429 },
          );
        }

        const c = serverConfig();
        if (!isConfigured(c)) {
          return Response.json(
            { error: { message: "Server AI proxy is not configured." } },
            { status: 501 },
          );
        }

        const rawBody = await request.json().catch(() => null);
        const parsed = chatBodySchema.safeParse(rawBody);
        if (!parsed.success) {
          return Response.json({ error: { message: "Invalid request body." } }, { status: 400 });
        }
        const { system = "", messages, billing } = parsed.data;

        // Billing gate (CRUZ-Default path only, and only when configured):
        // atomically reserve for THIS upstream call before spending the
        // operator key. gid controls free-slot allocation across the whole
        // generation; callId is unique per call and is the charge unit. When
        // billing is off or no context was sent, this whole block is skipped
        // and the route behaves exactly as before.
        const billingActive = !!billing && isBillingConfigured();
        const provider = billingActive ? getBillingProvider() : null;
        const ctx: BillingCtx | null = billing
          ? { address: billing.address as `0x${string}`, token: billing.token ?? null }
          : null;
        const callId =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const providerFmt: "anthropic" | "openai" =
          c.provider === "openai" ? "openai" : "anthropic";

        if (provider && ctx && billing) {
          const contextChars = system.length + messages.reduce((n, m) => n + m.content.length, 0);
          const estCents = estimateCostCents(contextChars);
          const reserved = await provider.reserve(ctx, billing.gid, callId, estCents);
          if (!reserved.ok) {
            return Response.json(
              { error: { message: reserved.message, reason: reserved.reason } },
              { status: 402 },
            );
          }
        }

        let upstream: Response;
        try {
          upstream = await upstreamRequest(c, system, messages, request.signal);
        } catch (err) {
          // Reserved but never spent — release the hold so the user isn't
          // charged for a call that never reached the provider.
          if (provider && ctx && billing)
            await provider.release(ctx, billing.gid, callId).catch(() => {});
          const message = err instanceof Error ? err.message : "Upstream request failed";
          return Response.json({ error: { message } }, { status: 502 });
        }

        if (!upstream.ok || !upstream.body) {
          if (provider && ctx && billing)
            await provider.release(ctx, billing.gid, callId).catch(() => {});
          const text = await upstream.text().catch(() => "");
          return new Response(text || JSON.stringify({ error: { message: "Upstream error" } }), {
            status: upstream.status || 502,
            headers: { "content-type": "application/json" },
          });
        }

        // No billing: stream straight through, untouched (original behavior).
        if (!provider || !ctx || !billing) {
          return new Response(upstream.body, {
            status: 200,
            headers: {
              "content-type": "text/event-stream; charset=utf-8",
              "cache-control": "no-cache, no-transform",
              "x-ai-provider": providerFmt,
            },
          });
        }

        // Billing: tee the stream — one branch to the client byte-for-byte
        // unchanged, the other consumed server-side to compute the exact cost
        // and settle when the stream closes. If the client aborts before
        // usable usage arrives, settle records whatever (likely ~0) cost was
        // measured, so undelivered work isn't overcharged.
        const [toClient, toMeter] = upstream.body.tee();
        (async () => {
          try {
            const { costCents } = await computeCostFromStream(toMeter, providerFmt);
            await provider.settle(ctx, billing.gid, callId, costCents);
          } catch {
            // Metering failed — release the hold rather than charge a guess.
            await provider.release(ctx, billing.gid, callId).catch(() => {});
          }
        })();

        return new Response(toClient, {
          status: 200,
          headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-cache, no-transform",
            "x-ai-provider": providerFmt,
          },
        });
      },
    },
  },
});
