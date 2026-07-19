import type {
  BillingProvider,
  BillingCtx,
  PreflightResult,
  ReserveResult,
  SettleResult,
  FundingRef,
  Dashboard,
} from "./types";
import {
  reserveOrFree,
  settle as ledgerSettle,
  releaseHold,
  credit as ledgerCredit,
  readAccount,
} from "./ledger.server";
import { tokenHashFor } from "./auth.server";
import { billingConfig } from "./config.server";
import { estimateCostCents } from "./cost.server";

// The prepaid-wallet BillingProvider: free prompts, then a USD-cents ledger
// funded on-chain and debited per upstream call. Composes ledger.server
// (atomic Redis ops) + auth.server (authorization gate) behind the narrow
// BillingProvider interface, so agentRuntime.ts/api.ai.ts never see any of
// these internals — and a future provider (subscription/team) can replace it
// without touching either call site.

// A small default per-call estimate used purely to size the initial reserve
// when the caller doesn't pass its own context-derived estimate. The real
// cost is measured from the stream and reconciled at settle time.
const DEFAULT_RESERVE_CENTS = 25;

function statusFor(a: {
  authorized: boolean;
  revoked: boolean;
  balanceCents: number;
  freeUsed: number;
  freeLimit: number;
}): Dashboard["status"] {
  if (a.revoked) return "revoked";
  const freeLeft = Math.max(0, a.freeLimit - a.freeUsed);
  if (freeLeft > 0) return "active";
  if (!a.authorized) return "not-authorized";
  if (a.balanceCents <= 0) return "needs-funding";
  return "active";
}

export const prepaidWalletProvider: BillingProvider = {
  id: "prepaid-wallet",

  async preflight(ctx: BillingCtx): Promise<PreflightResult> {
    try {
      const a = await readAccount(ctx.address);
      const freeRemaining = Math.max(0, a.freeLimit - a.freeUsed);
      const estCents = DEFAULT_RESERVE_CENTS;
      if (freeRemaining > 0) {
        return { ok: true, status: "free", estCents, balanceCents: a.balanceCents, freeRemaining };
      }
      if (a.revoked) {
        return {
          ok: true,
          status: "blocked",
          reason: "revoked",
          balanceCents: a.balanceCents,
          freeRemaining,
        };
      }
      if (!a.authorized) {
        return {
          ok: true,
          status: "blocked",
          reason: "not-authorized",
          balanceCents: a.balanceCents,
          freeRemaining,
        };
      }
      if (a.balanceCents < estCents) {
        return {
          ok: true,
          status: "blocked",
          reason: "needs-funding",
          balanceCents: a.balanceCents,
          freeRemaining,
        };
      }
      return { ok: true, status: "paid", estCents, balanceCents: a.balanceCents, freeRemaining };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Billing check failed." };
    }
  },

  async reserve(ctx, gid, callId, estCents): Promise<ReserveResult> {
    const tokenHash = await tokenHashFor(ctx.token);
    const est = Math.max(1, Math.round(estCents || DEFAULT_RESERVE_CENTS));
    const outcome = await reserveOrFree(ctx.address, gid, callId, est, tokenHash);
    if (outcome.mode === "free") return { ok: true, mode: "free" };
    if (outcome.mode === "paid") return { ok: true, mode: "paid" };
    const reason = outcome.reason ?? "not-authorized";
    const message =
      reason === "needs-funding"
        ? "Your CRUZ balance is too low. Add funds to continue."
        : reason === "revoked"
          ? "Spending authorization was revoked. Re-authorize to continue."
          : "Spending isn't authorized yet. Authorize CRUZ to spend from your balance.";
    return { ok: false, reason, message };
  },

  async settle(ctx, gid, callId, finalCents): Promise<SettleResult> {
    // Free-vs-paid is decided inside the ledger from the freeGids set, not
    // here — a free turn records history without touching balance, a paid
    // turn reconciles its hold against the real measured cost.
    return ledgerSettle(ctx.address, gid, callId, finalCents);
  },

  async release(ctx, gid, callId): Promise<void> {
    await releaseHold(ctx.address, gid, callId);
  },

  async credit(ctx, amountCents, ref: FundingRef): Promise<{ balanceCents: number }> {
    return ledgerCredit(
      ctx.address,
      amountCents,
      `Funded via ${ref.asset.toUpperCase()} (${ref.txHash.slice(0, 10)}…)`,
    );
  },

  async dashboard(ctx): Promise<Dashboard> {
    const a = await readAccount(ctx.address);
    const cfg = billingConfig();
    const promptsUsed = a.promptsUsed;
    const avg = promptsUsed > 0 ? Math.round(a.totalSpentCents / promptsUsed) : 0;
    return {
      freeRemaining: Math.max(0, a.freeLimit - a.freeUsed),
      freeLimit: a.freeLimit,
      balanceCents: a.balanceCents,
      totalSpentCents: a.totalSpentCents,
      promptsUsed,
      avgCostCentsPerPrompt: avg,
      recentTransactions: a.recentTransactions,
      status: statusFor(a),
      autoPay: a.autoPay,
      lowBalanceThresholdCents: a.lowBalanceThresholdCents || cfg.lowBalanceThresholdCents,
    };
  },
};

// Re-exported so callers that want the pre-flight "before" number can compute
// it without reaching into cost.server directly.
export { estimateCostCents };
