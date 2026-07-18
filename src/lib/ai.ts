// Generic streaming AI client for the AI Builder.
//
// Three modes, resolved from ai-settings.ts:
//   • server proxy — POST /api/ai; the key lives server-side (set VITE_AI_PROXY
//     plus a server-only key). Nothing sensitive reaches the browser.
//   • "anthropic"  — Claude via the native Messages API (api.anthropic.com).
//   • "openai"     — any OpenAI-compatible /chat/completions endpoint (also
//                    covers OpenRouter).
//
// The two direct modes are bring-your-own-key: the user pastes a key in the
// AI Builder's settings panel, stored in this browser only — same trust
// model as the Scaffolder's GitHub/Vercel tokens.

import {
  getAiSettings,
  isAiConfigured,
  activeKey,
  AI_PROVIDERS,
  resolveEndpoint,
  type AiSettings,
} from "@/lib/ai-settings";

export { isAiConfigured };
export type { AiProvider } from "@/lib/ai-settings";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Cap on the assistant's reply length per turn. Responses stream, so this is
// a length bound, not a timeout one.
const MAX_TOKENS = 8192;
const ANTHROPIC_VERSION = "2023-06-01";

interface ChatOptions {
  system: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
}

interface StreamOptions extends ChatOptions {
  // Called with each text chunk as it arrives.
  onDelta: (chunk: string) => void;
}

// Streams the active provider's reply, invoking onDelta per chunk and
// returning the full text once the stream ends. Prefer this over chat() for
// UI surfaces that want to render progressively.
export async function chatStream({
  system,
  messages,
  signal,
  onDelta,
}: StreamOptions): Promise<string> {
  const s = getAiSettings();
  if (!isAiConfigured()) {
    throw new Error(
      s.proxy
        ? "AI isn't configured on the server."
        : "AI isn't configured. Pick a provider and model, paste your API key, and save in the AI Builder's settings.",
    );
  }
  if (s.proxy) return streamProxy({ system, messages, signal, onDelta });
  return resolveEndpoint(s).kind === "anthropic"
    ? streamAnthropic({ system, messages, signal, onDelta })
    : streamOpenAI({ system, messages, signal, onDelta });
}

// Non-streaming convenience: accumulate the stream and return the full text.
export async function chat(opts: ChatOptions): Promise<string> {
  let out = "";
  await chatStream({ ...opts, onDelta: (c) => (out += c) });
  return out;
}

// --- Anthropic (native Messages API) ---------------------------------------

async function streamAnthropic({
  system,
  messages,
  signal,
  onDelta,
}: StreamOptions): Promise<string> {
  const s = getAiSettings();
  const { endpoint } = resolveEndpoint(s);
  // 0G's router (router-api.0g.ai) is Anthropic-Messages-API-shaped but 500s
  // "upstream_error" on any request carrying a top-level `system` field —
  // folding it into the messages array as a synthetic opening exchange works
  // around it. Native api.anthropic.com doesn't need this and keeps using
  // the real `system` field, which is confirmed correct there.
  const is0g = s.provider === "0g";
  const anthropicMessages =
    is0g && system
      ? [
          { role: "user" as const, content: system },
          { role: "assistant" as const, content: "Understood." },
          ...messages,
        ]
      : messages;
  const resp = await fetch(`${endpoint}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": activeKey(s),
      "anthropic-version": ANTHROPIC_VERSION,
      // Required for calls that originate from a browser.
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: s.model,
      max_tokens: MAX_TOKENS,
      ...(is0g ? {} : { system }),
      messages: anthropicMessages,
      stream: true,
    }),
    signal,
  });

  if (!resp.ok || !resp.body) throw await providerError(resp, "Anthropic");
  return consumeStream(resp.body, "anthropic", onDelta);
}

// --- Server proxy (/api/ai) ------------------------------------------------

async function streamProxy({ system, messages, signal, onDelta }: StreamOptions): Promise<string> {
  const resp = await fetch("/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ system, messages }),
    signal,
  });
  if (!resp.ok || !resp.body) throw await providerError(resp, "AI proxy");
  // The proxy tags the stream with the upstream format ("anthropic" | "openai").
  const fmt = resp.headers.get("x-ai-provider") === "anthropic" ? "anthropic" : "openai";
  return consumeStream(resp.body, fmt, onDelta);
}

// --- OpenAI-compatible (/chat/completions) ---------------------------------

async function streamOpenAI({ system, messages, signal, onDelta }: StreamOptions): Promise<string> {
  const s = getAiSettings();
  const { endpoint } = resolveEndpoint(s);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${activeKey(s)}`,
  };
  // OpenRouter recommends these attribution headers (optional, harmless elsewhere).
  if (endpoint.includes("openrouter")) {
    headers["HTTP-Referer"] = "https://cruz.dev";
    headers["X-Title"] = "CRUZ";
  }
  const resp = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: s.model,
      messages: [{ role: "system", content: system }, ...messages],
      temperature: 0.2,
      stream: true,
    }),
    signal,
  });

  if (!resp.ok || !resp.body) throw await providerError(resp, AI_PROVIDERS[s.provider].label);
  return consumeStream(resp.body, "openai", onDelta);
}

// Reads a provider's SSE stream, emitting text deltas. Shared by the direct
// Anthropic/OpenAI paths and the server proxy (which forwards either format).
async function consumeStream(
  body: ReadableStream<Uint8Array>,
  format: "anthropic" | "openai",
  onDelta: (chunk: string) => void,
): Promise<string> {
  let out = "";
  for await (const data of sseData(body)) {
    if (format === "openai") {
      if (data === "[DONE]") break;
      let chunk: { choices?: Array<{ delta?: { content?: string } }> };
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        out += delta;
        onDelta(delta);
      }
    } else {
      let evt: {
        type?: string;
        delta?: { type?: string; text?: string };
        error?: { message?: string };
      };
      try {
        evt = JSON.parse(data);
      } catch {
        continue;
      }
      if (evt.type === "error") throw new Error(evt.error?.message || "Anthropic stream error.");
      if (
        evt.type === "content_block_delta" &&
        evt.delta?.type === "text_delta" &&
        evt.delta.text
      ) {
        out += evt.delta.text;
        onDelta(evt.delta.text);
      }
    }
  }
  if (!out) throw new Error("AI returned an empty response.");
  return out;
}

// Parse a fetch body as Server-Sent Events, yielding the payload after each
// `data:` prefix. Both providers stream newline-delimited `data:` lines.
async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, "");
        buffer = buffer.slice(nl + 1);
        if (line.startsWith("data:")) yield line.slice(5).trim();
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function providerError(resp: Response, label: string): Promise<Error> {
  const text = await resp.text().catch(() => "");
  // Anthropic/OpenAI both nest a human message under error.message.
  let detail = text.slice(0, 240);
  try {
    const j = JSON.parse(text) as { error?: { message?: string } };
    if (j.error?.message) detail = j.error.message;
  } catch {
    /* keep raw text */
  }
  return new Error(`${label} request failed (${resp.status}). ${detail}`);
}

export type { AiSettings };
