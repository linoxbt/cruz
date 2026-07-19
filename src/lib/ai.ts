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
// AI Builder's settings panel, stored in this browser only, same trust
// model as the Scaffolder's GitHub token. The actual request still goes
// through one server-side hop (POST /api/byok, see forwardByok() below) —
// not because the key needs to touch our server for any credential reason,
// but because native OpenAI's API has no CORS support for direct
// browser-origin requests at all, and this keeps every provider's request
// path uniform instead of depending on which ones happen to allow it.

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

// Cap on ONE provider call's reply length. Responses stream, so this is a
// length bound, not a timeout one. Deliberately moderate (not the provider's
// real ceiling, confirmed live to accept up to at least 128000) rather than
// very large: a single request that runs long risks tripping a platform
// function timeout (Netlify/Vercel serverless) before it ever finishes.
// Anything that needs more room than this keeps going via the automatic
// continuation loop below instead of one giant call.
const MAX_TOKENS = 16000;
// How many times a single logical turn will auto-continue past a
// length-limited cutoff before giving up and returning whatever's been
// produced so far. Chosen so a genuinely large multi-file response (the
// original chronic-truncation bug — "production-ready app" style requests
// cutting off mid-file on nearly every turn) completes as one seamless
// stream instead of the model having to notice it was cut off and manually
// re-emit whole files from scratch, which is what silently burned through
// MAX_TURNS/MAX_FIX_ATTEMPTS in agentRuntime.ts before this existed.
const MAX_CONTINUATIONS = 6;
const ANTHROPIC_VERSION = "2023-06-01";

// System prompt for the Contract Editor's "Code with AI" panel (single-file
// Solidity help — write/debug/explain/audit) — a lighter-weight sibling of
// the AI Builder's full-app agentPrompt.ts, ported from DevStation's
// equivalent and re-scoped to CRUZ's actual chain (Arbitrum One, not
// QIE/BOT). No Universal Account protected-file constraint here — that's
// specific to the AI Builder's whole-project generation protocol; this panel
// only ever touches the one Solidity file the user has open.
export const SOLIDITY_SYSTEM_PROMPT =
  "You are a senior Solidity engineer and smart-contract auditor embedded in " +
  "CRUZ, a chain-abstraction console for Particle Network's Universal Accounts " +
  "on Arbitrum One. Help the user write, audit, debug, explain, and improve " +
  "smart contracts. Write PRODUCTION-GRADE, secure code — never toy snippets. " +
  "Always include an SPDX license and pragma ^0.8.20, and build on audited " +
  'OpenZeppelin v5 contracts (imports from "@openzeppelin/contracts/..." ' +
  "resolve from a CDN) rather than hand-rolling ERC-20/721/1155, access " +
  "control, or math. Apply security best practices: explicit visibility, " +
  "checks-effects-interactions, ReentrancyGuard on external-call/transfer " +
  "functions, input validation with custom errors, access control on " +
  "privileged functions, events for every state change, and no tx.origin " +
  "auth. Add full NatSpec. For ERC-20 tokens, mint the entire initial supply " +
  "to the deployer (msg.sender) in the constructor, scaled by 10**decimals(). " +
  "OZ v5 notes: ERC20's constructor does not mint (mint explicitly) and " +
  "Ownable requires an initial owner: Ownable(initialOwner). When the user " +
  "shares a contract, audit it first: list findings by severity " +
  "(Critical/High/Medium/Low/Gas) with concrete fixes. Always put Solidity " +
  "in ```solidity fenced code blocks. Be concise but complete.";

interface ChatOptions {
  system: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  // Billing context for the "CRUZ Default" (proxy) path only. Threaded into
  // the POST /api/ai body so the server can meter/charge this generation;
  // ignored by the BYOK paths (those users pay their own provider directly,
  // so CRUZ never bills them). Absent/undefined when billing isn't in play.
  billing?: { address: string; token: string | null; gid: string };
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
  billing,
}: StreamOptions): Promise<string> {
  const s = getAiSettings();
  if (!isAiConfigured()) {
    throw new Error(
      s.proxy
        ? "AI isn't configured on the server."
        : "AI isn't configured. Pick a provider and model, paste your API key, and save in the AI Builder's settings.",
    );
  }
  if (s.proxy) return streamProxy({ system, messages, signal, onDelta, billing });
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

// --- BYOK forwarding (/api/byok) --------------------------------------------
//
// Every bring-your-own-key call routes through one server-side hop instead
// of fetching the provider directly from the browser. Native OpenAI's API
// has no CORS support for browser-origin requests at all — a direct fetch()
// fails at the preflight stage with nothing more specific than "Failed to
// fetch" — and depending on which providers happen to allow direct browser
// access (Anthropic does via an opt-in header; OpenAI doesn't) made this
// fragile per-provider. Forwarding uniformly sidesteps CORS entirely
// (server-to-server has no browser-origin restriction) and drops the need
// for Anthropic's special browser header too.
async function forwardByok(
  endpoint: string,
  headers: Record<string, string>,
  body: string,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch("/api/byok", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint, headers, body }),
    signal,
  });
}

// --- Anthropic (native Messages API) ---------------------------------------

// Stop/finish reasons that mean "cut off by a length cap," not "the model
// actually finished" — the trigger for automatic continuation below.
const TRUNCATED_REASONS = new Set(["max_tokens", "length"]);

// Repeatedly calls `sendOnce` with a growing message list, appending each
// round's own partial output plus a "keep going" instruction whenever the
// provider reports it was cut off by a length limit, until a real stop
// reason arrives or MAX_CONTINUATIONS is exhausted. onDelta already streams
// every round's chunks as they arrive (each `sendOnce` calls it internally
// via consumeStream), so from the caller's perspective this is one seamless
// stream — the model never has to notice its own truncation and manually
// re-emit a whole file, which is what used to eat through
// agentRuntime.ts's MAX_TURNS/MAX_FIX_ATTEMPTS on any sufficiently large
// response.
async function withContinuation(
  sendOnce: (messages: ChatMessage[]) => Promise<{ text: string; stopReason: string | null }>,
  initialMessages: ChatMessage[],
): Promise<string> {
  let messages = initialMessages;
  let full = "";
  for (let round = 0; round <= MAX_CONTINUATIONS; round++) {
    const { text, stopReason } = await sendOnce(messages);
    full += text;
    if (!stopReason || !TRUNCATED_REASONS.has(stopReason)) break;
    messages = [
      ...messages,
      { role: "assistant", content: text },
      {
        role: "user",
        content:
          "Your last response was cut off by a length limit before it finished. Resume the output as a raw continuation of the exact character where it stopped — if you were mid-word, mid-line, or mid-code-block, your very first character must continue that token with NO preamble, NO acknowledgement, NO restating the plan or any earlier file, and NO reopening a ``` fence that's already open. Do not repeat anything already written. Just emit the next characters and carry on with the rest of the protocol.",
      },
    ];
  }
  if (!full) throw new Error("AI returned an empty response.");
  return full;
}

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
  const headers = {
    "content-type": "application/json",
    "x-api-key": activeKey(s),
    "anthropic-version": ANTHROPIC_VERSION,
  };
  const sendOnce = async (msgs: ChatMessage[]) => {
    const anthropicMessages =
      is0g && system
        ? [
            { role: "user" as const, content: system },
            { role: "assistant" as const, content: "Understood." },
            ...msgs,
          ]
        : msgs;
    const body = JSON.stringify({
      model: s.model,
      max_tokens: MAX_TOKENS,
      ...(is0g ? {} : { system }),
      messages: anthropicMessages,
      stream: true,
    });
    const resp = await forwardByok(`${endpoint}/v1/messages`, headers, body, signal);
    if (!resp.ok || !resp.body) throw await providerError(resp, "Anthropic");
    return consumeStream(resp.body, "anthropic", onDelta);
  };
  return withContinuation(sendOnce, messages);
}

// --- Server proxy (/api/ai) ------------------------------------------------

/** Thrown when the proxy refuses a call for billing reasons (HTTP 402) — a
 *  distinct type so the AI Builder can surface the funding/authorize prompt
 *  instead of a generic error. `reason` mirrors the server's block reason. */
export class BillingBlockedError extends Error {
  reason: string;
  constructor(message: string, reason: string) {
    super(message);
    this.name = "BillingBlockedError";
    this.reason = reason;
  }
}

async function streamProxy({
  system,
  messages,
  signal,
  onDelta,
  billing,
}: StreamOptions): Promise<string> {
  const sendOnce = async (msgs: ChatMessage[]) => {
    const resp = await fetch("/api/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ system, messages: msgs, billing }),
      signal,
    });
    if (resp.status === 402) {
      const body = (await resp.json().catch(() => null)) as {
        error?: { message?: string; reason?: string };
      } | null;
      throw new BillingBlockedError(
        body?.error?.message || "Out of free prompts. Add funds to continue.",
        body?.error?.reason || "needs-funding",
      );
    }
    if (!resp.ok || !resp.body) throw await providerError(resp, "AI proxy");
    // The proxy tags the stream with the upstream format ("anthropic" | "openai").
    const fmt = resp.headers.get("x-ai-provider") === "anthropic" ? "anthropic" : "openai";
    return consumeStream(resp.body, fmt, onDelta);
  };
  return withContinuation(sendOnce, messages);
}

// --- OpenAI-compatible (/chat/completions) ---------------------------------

async function streamOpenAI({ system, messages, signal, onDelta }: StreamOptions): Promise<string> {
  const s = getAiSettings();
  const { endpoint } = resolveEndpoint(s);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${activeKey(s)}`,
  };
  // OpenRouter recommends these attribution headers (optional, harmless elsewhere).
  if (endpoint.includes("openrouter")) {
    headers["HTTP-Referer"] = "https://cruz.dev";
    headers["X-Title"] = "CRUZ";
  }
  const sendOnce = async (msgs: ChatMessage[]) => {
    const body = JSON.stringify({
      model: s.model,
      messages: [{ role: "system", content: system }, ...msgs],
      temperature: 0.2,
      max_tokens: MAX_TOKENS,
      stream: true,
    });
    const resp = await forwardByok(endpoint, headers, body, signal);
    if (!resp.ok || !resp.body) throw await providerError(resp, AI_PROVIDERS[s.provider].label);
    return consumeStream(resp.body, "openai", onDelta);
  };
  return withContinuation(sendOnce, messages);
}

// Reads a provider's SSE stream, emitting text deltas, and reports back the
// stream's stop/finish reason (see TRUNCATED_REASONS above) so the caller
// can decide whether to auto-continue past a length-limited cutoff. Shared
// by the direct Anthropic/OpenAI paths and the server proxy (which forwards
// either format). Deliberately doesn't throw on empty output itself — a
// single continuation round legitimately can return little/no new text
// while still reporting a real stop reason; only the outer continuation
// loop (withContinuation) is positioned to know whether the OVERALL result
// ended up empty.
async function consumeStream(
  body: ReadableStream<Uint8Array>,
  format: "anthropic" | "openai",
  onDelta: (chunk: string) => void,
): Promise<{ text: string; stopReason: string | null }> {
  let out = "";
  let stopReason: string | null = null;
  for await (const data of sseData(body)) {
    if (format === "openai") {
      if (data === "[DONE]") break;
      let chunk: {
        choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
      };
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
      const finish = chunk.choices?.[0]?.finish_reason;
      if (finish) stopReason = finish;
    } else {
      let evt: {
        type?: string;
        delta?: { type?: string; text?: string; stop_reason?: string | null };
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
      if (evt.type === "message_delta" && evt.delta?.stop_reason) {
        stopReason = evt.delta.stop_reason;
      }
    }
  }
  return { text: out, stopReason };
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
