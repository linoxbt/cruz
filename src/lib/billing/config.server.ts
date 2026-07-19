// Server-only billing configuration — mirrors serverConfig() in
// src/routes/api.ai.ts: read process.env fresh (never module-scope cached),
// no VITE_ prefix (never inlined into the client bundle). Every value here
// is either a secret (Upstash token) or something that must not be
// client-trusted (treasury address, cost rates, free-prompt count).

export interface BillingConfig {
  upstash: { url: string; token: string };
  treasuryAddress: `0x${string}` | "";
  freePrompts: number;
  lowBalanceThresholdCents: number;
  rates: {
    // 0G's router reports cost in its own settlement unit (wei-scale, seen
    // live as e.g. "1228190000000000" in an x_0g_trace event) — this is the
    // USD price of one whole unit of that settlement value (i.e. after
    // dividing the raw string by 1e18), used to convert it to USD-cents.
    zgSettlementUsdPerUnit: number;
    anthropicInputPerMTok: number;
    anthropicOutputPerMTok: number;
    openaiInputPerMTok: number;
    openaiOutputPerMTok: number;
  };
}

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function billingConfig(): BillingConfig {
  const e = process.env;
  return {
    upstash: {
      url: e.UPSTASH_REDIS_REST_URL || "",
      token: e.UPSTASH_REDIS_REST_TOKEN || "",
    },
    treasuryAddress: (e.CRUZ_TREASURY_ADDRESS as `0x${string}`) || "",
    freePrompts: Math.max(0, Math.floor(num(e.BILLING_FREE_PROMPTS, 5))),
    lowBalanceThresholdCents: Math.max(
      0,
      Math.floor(num(e.BILLING_LOW_BALANCE_THRESHOLD_CENTS, 100)),
    ),
    rates: {
      zgSettlementUsdPerUnit: num(e.ZG_SETTLEMENT_USD_PER_UNIT, 1),
      anthropicInputPerMTok: num(e.ANTHROPIC_COST_INPUT_PER_MTOK, 3),
      anthropicOutputPerMTok: num(e.ANTHROPIC_COST_OUTPUT_PER_MTOK, 15),
      openaiInputPerMTok: num(e.OPENAI_COST_INPUT_PER_MTOK, 2.5),
      openaiOutputPerMTok: num(e.OPENAI_COST_OUTPUT_PER_MTOK, 10),
    },
  };
}

/** Billing is entirely inert (no gate, no charge, feature invisible) until
 *  both Upstash vars are set — same "configured or it isn't" pattern as the
 *  AI proxy and the MCP client. */
export function isBillingConfigured(c: BillingConfig = billingConfig()): boolean {
  return !!c.upstash.url && !!c.upstash.token;
}
