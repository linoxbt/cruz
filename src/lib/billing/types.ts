// The billing module's one narrow interface — agentRuntime.ts and api.ai.ts
// only ever call through this (via billing.functions.ts's server fns).
// Neither touches Redis/auth/on-chain verification directly. Today's only
// implementation is prepaidWalletProvider.server.ts; a future
// subscription/team-workspace provider satisfies the same five methods
// without either call site changing.

export interface BillingCtx {
  address: `0x${string}`;
  /** Opaque spending-authorization token from authorizeSpending(); null for
   *  a wallet that hasn't authorized yet (still eligible for free prompts). */
  token: string | null;
}

export type PreflightResult =
  | {
      ok: true;
      status: "free" | "paid";
      estCents: number;
      balanceCents: number;
      freeRemaining: number;
    }
  | {
      ok: true;
      status: "blocked";
      reason: "needs-funding" | "not-authorized" | "revoked" | "trial-exhausted";
      balanceCents: number;
      freeRemaining: number;
    }
  | { ok: false; message: string };

export type ReserveResult =
  | { ok: true; mode: "free" | "paid" }
  | { ok: false; reason: "needs-funding" | "not-authorized" | "revoked"; message: string };

export interface SettleResult {
  balanceCents: number;
}

export interface FundingRef {
  txHash: `0x${string}`;
  asset: "usdc" | "eth";
}

export interface HistoryEntry {
  id: string;
  type: "usage" | "funding" | "free";
  amountCents: number;
  ts: number;
  detail?: string;
}

export interface Dashboard {
  freeRemaining: number;
  freeLimit: number;
  balanceCents: number;
  totalSpentCents: number;
  promptsUsed: number;
  avgCostCentsPerPrompt: number;
  recentTransactions: HistoryEntry[];
  status: "active" | "needs-funding" | "not-authorized" | "revoked";
  autoPay: boolean;
  lowBalanceThresholdCents: number;
}

export interface BillingProvider {
  id: string;
  preflight(ctx: BillingCtx): Promise<PreflightResult>;
  // gid identifies the whole generation (one user prompt) and controls free-
  // slot allocation; callId is unique per upstream HTTP call and is the charge
  // unit (one prompt can fan out to many calls via retries/continuations).
  reserve(ctx: BillingCtx, gid: string, callId: string, estCents: number): Promise<ReserveResult>;
  settle(ctx: BillingCtx, gid: string, callId: string, finalCents: number): Promise<SettleResult>;
  /** Called when a call is aborted/crashed before usable usage data arrived
   *  — releases its hold back into balance, no charge for undelivered work. */
  release(ctx: BillingCtx, gid: string, callId: string): Promise<void>;
  credit(ctx: BillingCtx, amountCents: number, ref: FundingRef): Promise<{ balanceCents: number }>;
  dashboard(ctx: BillingCtx): Promise<Dashboard>;
}
