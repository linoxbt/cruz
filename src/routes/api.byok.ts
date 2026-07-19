import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rateLimit.server";

// Forwards a bring-your-own-key AI Builder request server-side. Exists
// purely to route around CORS: native OpenAI's REST API has no CORS support
// for browser-origin requests at all (unlike Anthropic, which added an
// explicit `anthropic-dangerous-direct-browser-access` opt-in specifically
// for this use case) — a bare client-side fetch() to api.openai.com fails at
// the CORS preflight stage with nothing more specific than "Failed to
// fetch". Routing every BYOK provider through one server-side hop sidesteps
// this entirely and uniformly (server-to-server has no browser-origin
// restriction), instead of depending on which providers happen to allow
// direct browser access.
//
// The key lives in the request headers the caller supplies (never a server
// env var) and is forwarded as-is — not persisted, not logged — same trust
// model as the direct-fetch path this replaces, just routed through one
// extra hop. Restricted to a fixed allowlist of known provider hosts so this
// can't be used as an open server-side fetch proxy.

const PER_IP_LIMIT = 30;
const WINDOW_MS = 5 * 60 * 1000;

const ALLOWED_HOSTS = new Set([
  "api.openai.com",
  "openrouter.ai",
  "api.anthropic.com",
  "router-api.0g.ai",
]);

const bodySchema = z.object({
  endpoint: z.string().url(),
  headers: z.record(z.string(), z.string()),
  body: z.string(),
});

export const Route = createFileRoute("/api/byok")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = clientKeyFromRequest(request);
        if (!checkRateLimit(`byok:ip:${ip}`, PER_IP_LIMIT, WINDOW_MS)) {
          return Response.json(
            { error: { message: "Rate limit exceeded. Try again shortly." } },
            { status: 429 },
          );
        }

        const raw = await request.json().catch(() => null);
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) {
          return Response.json({ error: { message: "Invalid request body." } }, { status: 400 });
        }
        const { endpoint, headers, body } = parsed.data;

        let url: URL;
        try {
          url = new URL(endpoint);
        } catch {
          return Response.json({ error: { message: "Invalid endpoint URL." } }, { status: 400 });
        }
        if (!ALLOWED_HOSTS.has(url.hostname)) {
          return Response.json(
            { error: { message: "Unsupported provider endpoint." } },
            { status: 400 },
          );
        }

        let upstream: Response;
        try {
          upstream = await fetch(endpoint, {
            method: "POST",
            headers,
            body,
            signal: request.signal,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Upstream request failed";
          return Response.json({ error: { message } }, { status: 502 });
        }

        if (!upstream.ok || !upstream.body) {
          const text = await upstream.text().catch(() => "");
          return new Response(text || JSON.stringify({ error: { message: "Upstream error" } }), {
            status: upstream.status || 502,
            headers: { "content-type": "application/json" },
          });
        }

        return new Response(upstream.body, {
          status: 200,
          headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-cache, no-transform",
          },
        });
      },
    },
  },
});
