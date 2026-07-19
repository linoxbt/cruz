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

function centsFromZg(totalCostRaw: string): number | null {
  // 0G reports cost as a wei-scale integer string in its settlement unit.
  // usdPerUnit is the USD value of one whole unit (raw / 1e18). Returns null
  // when the operator hasn't calibrated the unit (config default), so the
  // caller falls back to token-based pricing instead of charging a wrong
  // amount derived from an unknown unit.
  const { zgSettlementUsdPerUnit } = billingConfig().rates;
  if (zgSettlementUsdPerUnit == null) return null;
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

/** Incremental SSE cost accumulator. Feed it decoded text as it streams
 *  (`write`), then call `result()` once the stream ends. Factored out of
 *  computeCostFromStream so the api.ai.ts metering TransformStream can settle
 *  from within the stream lifecycle (flush) rather than a detached promise. */
export function createCostMeter(format: "anthropic" | "openai") {
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
    if (typeof totalCost === "string") {
      const c = centsFromZg(totalCost);
      if (c !== null) zgCents = c;
    }

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

  return {
    write(chunk: string) {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, "");
        buffer = buffer.slice(nl + 1);
        if (line.startsWith("data:")) handle(line.slice(5).trim());
      }
    },
    result(): CostResult {
      // Trace cost is only trusted when the operator has calibrated the
      // settlement unit (centsFromZg returns null otherwise) — see
      // config.server.ts. Without calibration we fall back to token pricing
      // so charges are never silently ~0 from an unknown unit.
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
      return {
        costCents: estimateFromChars(textChars),
        source: "estimate",
        inputTokens,
        outputTokens,
      };
    },
  };
}

/** Pre-flight "before" estimate for the whole accumulated context — used to
 *  size the per-call reserve/hold and to show the user an expected cost. The
 *  history sent as context grows unbounded (never trimmed), so this sums the
 *  full message payload, not just the newest message. The output estimate is
 *  a typical single generation turn, not the absolute MAX_TOKENS ceiling:
 *  the hold is refunded/reconciled at settle against the real measured cost,
 *  and the ledger clamps at zero, so a modest under-reserve is safe while an
 *  over-reserve would needlessly block a well-funded build (the hold is held,
 *  not spent). */
export function estimateCostCents(contextChars: number, expectedOutputTokens = 4000): number {
  const inputTokens = Math.ceil(contextChars / 4);
  // Estimate against the 0G/anthropic rate path (CRUZ's default). If a 0G
  // trace ends up cheaper at settle time, the hold difference is refunded.
  return centsFromAnthropicTokens(inputTokens, expectedOutputTokens);
}
