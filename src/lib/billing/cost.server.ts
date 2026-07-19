import { billingConfig } from "./config.server";

// Computes one USD-cents cost for a single /api/ai upstream call by reading
// the provider's own usage/billing signals out of the SSE stream. Priority:
//   1. 0G's `x_0g_trace` event — the provider's OWN settled cost, the most
//      accurate source when present (CRUZ's current default provider).
//   2. Anthropic-shaped `message_start`/`message_delta` usage token counts,
//      priced by configured $/Mtok rates.
//   3. OpenAI-shaped final-chunk `usage` (needs stream_options.include_usage).
//   4. A char-count fallback estimate, so a cost is never zero-by-default.
//
// This runs server-side inside api.ai.ts against a tee'd copy of the upstream
// stream (the client still gets the bytes untouched). It parses the same
// `data:` SSE framing consumeStream() uses.

export interface CostResult {
  costCents: number;
  source: "zg-trace" | "anthropic-usage" | "openai-usage" | "estimate";
  inputTokens: number;
  outputTokens: number;
}

interface ZgTrace {
  x_0g_trace?: { billing?: { total_cost?: string } };
}

function centsFromZg(totalCostRaw: string): number {
  // 0G reports cost as a wei-scale integer string in its settlement unit.
  // usdPerUnit is the USD value of one whole unit (raw / 1e18).
  const { zgSettlementUsdPerUnit } = billingConfig().rates;
  const units = Number(totalCostRaw) / 1e18;
  return Math.max(0, Math.round(units * zgSettlementUsdPerUnit * 100));
}

function centsFromAnthropicTokens(input: number, output: number): number {
  const r = billingConfig().rates;
  return Math.max(
    0,
    Math.round(
      (input / 1_000_000) * r.anthropicInputPerMTok * 100 +
        (output / 1_000_000) * r.anthropicOutputPerMTok * 100,
    ),
  );
}

function centsFromOpenaiTokens(input: number, output: number): number {
  const r = billingConfig().rates;
  return Math.max(
    0,
    Math.round(
      (input / 1_000_000) * r.openaiInputPerMTok * 100 +
        (output / 1_000_000) * r.openaiOutputPerMTok * 100,
    ),
  );
}

/** Rough fallback: ~4 chars/token, priced as anthropic output (the pessimistic
 *  side), so an unrecognized stream still costs something rather than nothing. */
function estimateFromChars(chars: number): number {
  const outputTokens = Math.ceil(chars / 4);
  return centsFromAnthropicTokens(0, outputTokens);
}

/** Consumes a tee'd SSE stream to completion and returns the computed cost.
 *  Never throws — a parsing failure degrades to the char-count estimate so a
 *  billed turn always settles with SOME finite cost. */
export async function computeCostFromStream(
  body: ReadableStream<Uint8Array>,
  format: "anthropic" | "openai",
): Promise<CostResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let textChars = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let zgCents: number | null = null;

  const handle = (data: string) => {
    if (data === "[DONE]") return;
    let evt: Record<string, unknown>;
    try {
      evt = JSON.parse(data);
    } catch {
      return;
    }
    // 0G trace (anthropic-shaped stream carries it as an extra event type).
    const trace = evt as ZgTrace;
    const totalCost = trace.x_0g_trace?.billing?.total_cost;
    if (typeof totalCost === "string") zgCents = centsFromZg(totalCost);

    if (format === "anthropic") {
      const type = evt.type as string | undefined;
      if (type === "message_start") {
        const usage = (evt.message as { usage?: { input_tokens?: number; output_tokens?: number } })
          ?.usage;
        if (usage?.input_tokens) inputTokens = usage.input_tokens;
        if (usage?.output_tokens) outputTokens = usage.output_tokens;
      } else if (type === "message_delta") {
        const usage = (evt.usage as { output_tokens?: number }) ?? undefined;
        if (usage?.output_tokens) outputTokens = usage.output_tokens;
      } else if (type === "content_block_delta") {
        const delta = evt.delta as { type?: string; text?: string } | undefined;
        if (delta?.type === "text_delta" && delta.text) textChars += delta.text.length;
      }
    } else {
      const choices = evt.choices as Array<{ delta?: { content?: string } }> | undefined;
      const content = choices?.[0]?.delta?.content;
      if (content) textChars += content.length;
      const usage = evt.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
      if (usage) {
        if (usage.prompt_tokens) inputTokens = usage.prompt_tokens;
        if (usage.completion_tokens) outputTokens = usage.completion_tokens;
      }
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, "");
        buffer = buffer.slice(nl + 1);
        if (line.startsWith("data:")) handle(line.slice(5).trim());
      }
    }
  } catch {
    /* stream ended abruptly — fall through to whatever was gathered */
  } finally {
    reader.releaseLock();
  }

  if (zgCents !== null) {
    return { costCents: zgCents, source: "zg-trace", inputTokens, outputTokens };
  }
  if (outputTokens > 0) {
    const costCents =
      format === "anthropic"
        ? centsFromAnthropicTokens(inputTokens, outputTokens)
        : centsFromOpenaiTokens(inputTokens, outputTokens);
    return {
      costCents,
      source: format === "anthropic" ? "anthropic-usage" : "openai-usage",
      inputTokens,
      outputTokens,
    };
  }
  return { costCents: estimateFromChars(textChars), source: "estimate", inputTokens, outputTokens };
}

/** Pre-flight "before" estimate for the whole accumulated context — used to
 *  size the per-call reserve/hold and to show the user an expected cost. The
 *  history sent as context grows unbounded (never trimmed), so this sums the
 *  full message payload, not just the newest message. Deliberately generous
 *  (assumes a full MAX_TOKENS-ish output) so the hold can't under-reserve. */
export function estimateCostCents(contextChars: number, expectedOutputTokens = 16000): number {
  const inputTokens = Math.ceil(contextChars / 4);
  // Estimate against the 0G/anthropic rate path (CRUZ's default). If a 0G
  // trace ends up cheaper at settle time, the hold difference is refunded.
  return centsFromAnthropicTokens(inputTokens, expectedOutputTokens);
}
