import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getBillingProvider } from "@/lib/billing/index.server";
import { isBillingConfigured, billingConfig } from "@/lib/billing/config.server";
import {
  issueNonce,
  authorizeSpending,
  revokeSpending,
  verifyToken,
} from "@/lib/billing/auth.server";
import { verifyFunding } from "@/lib/billing/fundingVerify.server";
import { redis } from "@/lib/billing/redis.server";
import { estimateCostCents } from "@/lib/billing/cost.server";
import { ARBITRUM_USDC } from "@/lib/chains";
import { getEthPrice } from "@/lib/api/chainPrice.functions";

// The ONLY billing surface the UI and agentRuntime.ts import. Everything
// behind it (Redis, Lua, on-chain verification, the BillingProvider
// implementation) stays server-only. Matches the house style in
// studio.functions.ts/mcp.functions.ts: createServerFn + zod inputValidator,
// discriminated-union returns, never throws to the client.
//
// When billing isn't configured (no Upstash creds), every fn returns an inert
// "not configured" shape so the whole feature is invisible/no-op — the AI
// Builder behaves exactly as it did before billing existed.

const addressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid wallet address")
  .transform((a) => a.toLowerCase() as `0x${string}`);

const txHashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Invalid transaction hash");

function notConfigured() {
  return { ok: false as const, configured: false as const, message: "Billing is not enabled." };
}

// ---- Spending authorization ----------------------------------------------

export const requestNonce = createServerFn({ method: "POST" })
  .inputValidator(z.object({ address: addressSchema }))
  .handler(async ({ data }) => {
    if (!isBillingConfigured()) return notConfigured();
    try {
      const { message } = await issueNonce(data.address);
      return { ok: true as const, message };
    } catch (e) {
      return {
        ok: false as const,
        message: e instanceof Error ? e.message : "Could not start authorization.",
      };
    }
  });

export const authorizeSpendingFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      address: addressSchema,
      signature: z.string().regex(/^0x[a-fA-F0-9]+$/, "Invalid signature"),
      autoPay: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    if (!isBillingConfigured()) return notConfigured();
    const res = await authorizeSpending(
      data.address,
      data.signature as `0x${string}`,
      data.autoPay ?? true,
    );
    return res.ok
      ? { ok: true as const, token: res.token! }
      : { ok: false as const, message: res.message ?? "Authorization failed." };
  });

export const revokeSpendingFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ address: addressSchema, token: z.string().min(1) }))
  .handler(async ({ data }) => {
    if (!isBillingConfigured()) return notConfigured();
    const res = await revokeSpending(data.address, data.token);
    return res.ok ? { ok: true as const } : { ok: false as const, message: res.message };
  });

// ---- Funding --------------------------------------------------------------

export const getFundingQuote = createServerFn({ method: "GET" }).handler(async () => {
  if (!isBillingConfigured()) return notConfigured();
  const cfg = billingConfig();
  if (!cfg.treasuryAddress) {
    return { ok: false as const, message: "Treasury address is not configured." };
  }
  const price = await getEthPrice();
  return {
    ok: true as const,
    treasury: cfg.treasuryAddress,
    usdc: ARBITRUM_USDC,
    ethUsd: price.ok ? price.usd : null,
  };
});

export const submitFunding = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      address: addressSchema,
      asset: z.enum(["eth", "usdc"]),
      txHash: txHashSchema,
    }),
  )
  .handler(async ({ data }) => {
    if (!isBillingConfigured()) return notConfigured();
    const txHash = data.txHash as `0x${string}`;
    const dedupKey = `bill:funded:${txHash.toLowerCase()}`;

    // A tx hash may be credited at most once. SET NX claims it; if it already
    // exists, this funding was already processed (or is in flight).
    let claimed: string | null;
    try {
      claimed = await redis<string | null>(["SET", dedupKey, "pending", "NX"]);
    } catch (e) {
      return { ok: false as const, message: e instanceof Error ? e.message : "Storage error." };
    }
    if (claimed === null) {
      return { ok: false as const, message: "This transaction has already been submitted." };
    }

    const verified = await verifyFunding(data.asset, txHash, data.address);
    if (!verified.ok || !verified.amountCents) {
      // Release the claim so a legitimate retry (e.g. tx not yet mined) can
      // re-verify later.
      await redis(["DEL", dedupKey]).catch(() => {});
      return {
        ok: false as const,
        message: verified.message ?? "Could not verify the transaction on-chain.",
      };
    }

    try {
      const provider = getBillingProvider();
      const { balanceCents } = await provider.credit(
        { address: data.address, token: null },
        verified.amountCents,
        { txHash, asset: data.asset },
      );
      await redis(["SET", dedupKey, "credited"]);
      return { ok: true as const, creditedCents: verified.amountCents, balanceCents };
    } catch (e) {
      await redis(["DEL", dedupKey]).catch(() => {});
      return { ok: false as const, message: e instanceof Error ? e.message : "Crediting failed." };
    }
  });

// ---- Preflight + dashboard ------------------------------------------------

export const preflightGeneration = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      address: addressSchema,
      token: z.string().nullable().optional(),
      // Char length of the accumulated context to size the estimate.
      contextChars: z.number().int().nonnegative().optional(),
    }),
  )
  .handler(async ({ data }) => {
    if (!isBillingConfigured()) {
      // Inert: unconfigured billing never blocks a build.
      return { ok: true as const, configured: false as const, status: "free" as const };
    }
    const provider = getBillingProvider();
    const estFromContext =
      data.contextChars != null ? estimateCostCents(data.contextChars) : undefined;
    // Use the SAME context-derived estimate the per-call reserve will use, so
    // preflight and reserve agree on affordability (no clear-then-402).
    const res = await provider.preflight(
      { address: data.address, token: data.token ?? null },
      estFromContext,
    );
    if (!res.ok) return { ok: false as const, message: res.message };
    const { ok: _ok, ...rest } = res;
    void _ok;
    return { ok: true as const, configured: true as const, ...rest, estFromContext };
  });

export const getUsageDashboard = createServerFn({ method: "POST" })
  .inputValidator(z.object({ address: addressSchema, token: z.string().nullable().optional() }))
  .handler(async ({ data }) => {
    if (!isBillingConfigured()) return notConfigured();
    try {
      const provider = getBillingProvider();
      const dashboard = await provider.dashboard({
        address: data.address,
        token: data.token ?? null,
      });
      const authorized = await verifyToken(data.address, data.token ?? null);
      return { ok: true as const, dashboard, authorized };
    } catch (e) {
      return {
        ok: false as const,
        message: e instanceof Error ? e.message : "Could not load usage.",
      };
    }
  });
