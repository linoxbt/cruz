import { useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { parseEther, parseUnits } from "viem";
import { getUniversalAccount } from "@/lib/studio/particle";
import { signAndSendWithMagic, signAuthMessage } from "@/lib/studio/magicSigner";
import { arbitrumOne, ARBITRUM_USDC, ARBITRUM_USDC_DECIMALS } from "@/lib/chains";
import { useBillingStore } from "@/lib/billing/billingStore";
import {
  requestNonce,
  authorizeSpendingFn,
  revokeSpendingFn,
  getFundingQuote,
  submitFunding,
  getUsageDashboard,
} from "@/lib/api/billing.functions";

// Client-facing billing hook. Owns the authorize/revoke/fund actions and the
// usage dashboard query, and keeps billingStore's `address` in sync with the
// connected wallet so agentRuntime.ts (module scope) always has the right
// context. When billing isn't configured server-side, dashboard calls return
// a "not configured" shape and this hook stays inert (configured === false).

export type FundAsset = "eth" | "usdc";

/** Keeps the module-scope billingStore address in sync with the connected
 *  wallet. MUST be mounted unconditionally on any page where a generation can
 *  start (agentRuntime.ts reads getBillingContext() at module scope, so if
 *  nothing syncs the address the billing gate silently never engages). Kept
 *  separate from useBilling() so it can be called at a route's top level
 *  without pulling in the dashboard query. */
export function useSyncBillingAddress() {
  const { address } = useAccount();
  const setAddress = useBillingStore((s) => s.setAddress);
  useEffect(() => {
    setAddress(address ?? null);
  }, [address, setAddress]);
}

/** Best-effort resolution of a Particle UA transactionId to the settled EVM
 *  tx hash the server verifies. `getTransaction` returns `any`, so probe the
 *  common shapes and give up gracefully (the server can't credit without a
 *  real hash). */
async function resolveTxHash(
  address: `0x${string}`,
  transactionId: string,
): Promise<`0x${string}` | null> {
  const ua = getUniversalAccount(address);
  const hashRe = /^0x[a-fA-F0-9]{64}$/;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const info = (await ua.getTransaction(transactionId)) as Record<string, unknown> | null;
      const candidates: unknown[] = [
        info?.transactionHash,
        info?.txHash,
        info?.hash,
        ...(Array.isArray(info?.receipts)
          ? (info!.receipts as Array<Record<string, unknown>>).map((r) => r?.transactionHash)
          : []),
        ...(Array.isArray(info?.userOps)
          ? (info!.userOps as Array<Record<string, unknown>>).map((u) => u?.transactionHash)
          : []),
      ];
      const found = candidates.find((c) => typeof c === "string" && hashRe.test(c));
      if (found) return found as `0x${string}`;
    } catch {
      /* not settled yet — keep polling */
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return null;
}

export function useBilling() {
  const { address } = useAccount();
  const token = useBillingStore((s) => s.token);
  const setToken = useBillingStore((s) => s.setToken);
  const setDashboard = useBillingStore((s) => s.setDashboard);

  // Keep the module-scope store's address in sync with the connected wallet
  // (shared with the standalone useSyncBillingAddress so a page can sync
  // without mounting the full dashboard query).
  useSyncBillingAddress();

  const dashboardQuery = useQuery({
    queryKey: ["billing", "dashboard", address?.toLowerCase(), token],
    enabled: !!address,
    refetchInterval: 20_000,
    queryFn: async () => {
      const res = await getUsageDashboard({ data: { address: address as string, token } });
      if (!("ok" in res) || !res.ok) {
        setDashboard(null);
        return { configured: false as const, dashboard: null, authorized: false };
      }
      setDashboard(res.dashboard);
      return { configured: true as const, dashboard: res.dashboard, authorized: res.authorized };
    },
  });

  /** Nonce → sign (Magic personal_sign) → verify server-side → store token. */
  const authorize = useCallback(
    async (autoPay: boolean): Promise<{ ok: boolean; message?: string }> => {
      if (!address) return { ok: false, message: "Connect a wallet first." };
      const nonceRes = await requestNonce({ data: { address } });
      if (!("ok" in nonceRes) || !nonceRes.ok || !nonceRes.message) {
        return {
          ok: false,
          message: ("message" in nonceRes && nonceRes.message) || "Could not start authorization.",
        };
      }
      const signature = await signAuthMessage(nonceRes.message, address);
      const authRes = await authorizeSpendingFn({ data: { address, signature, autoPay } });
      if (!("ok" in authRes) || !authRes.ok || !authRes.token) {
        return {
          ok: false,
          message: ("message" in authRes && authRes.message) || "Authorization failed.",
        };
      }
      setToken(authRes.token);
      await dashboardQuery.refetch();
      return { ok: true };
    },
    [address, setToken, dashboardQuery],
  );

  const revoke = useCallback(async (): Promise<{ ok: boolean; message?: string }> => {
    if (!address || !token) return { ok: false, message: "Nothing to revoke." };
    const res = await revokeSpendingFn({ data: { address, token } });
    if ("ok" in res && res.ok) {
      setToken(null);
      await dashboardQuery.refetch();
      return { ok: true };
    }
    return { ok: false, message: ("message" in res && res.message) || "Revoke failed." };
  }, [address, token, setToken, dashboardQuery]);

  /** Move funds from the wallet to the CRUZ treasury and credit the ledger
   *  once the transfer is verified on-chain server-side. */
  const fund = useCallback(
    async (
      asset: FundAsset,
      amount: string,
    ): Promise<{ ok: boolean; message?: string; creditedCents?: number }> => {
      if (!address) return { ok: false, message: "Connect a wallet first." };
      const quote = await getFundingQuote();
      if (!("ok" in quote) || !quote.ok) {
        return {
          ok: false,
          message: ("message" in quote && quote.message) || "Funding is unavailable.",
        };
      }
      const treasury = quote.treasury as `0x${string}`;
      const ua = getUniversalAccount(address);

      // USDC: ERC-20 transfer; ETH: native transfer. Both go to the treasury.
      const tx =
        asset === "usdc"
          ? await ua.createTransferTransaction({
              token: { chainId: arbitrumOne.id, address: ARBITRUM_USDC },
              amount: parseUnits(amount, ARBITRUM_USDC_DECIMALS).toString(),
              receiver: treasury,
            })
          : await ua.createTransferTransaction({
              token: {
                chainId: arbitrumOne.id,
                address: "0x0000000000000000000000000000000000000000",
              },
              amount: parseEther(amount).toString(),
              receiver: treasury,
            });

      const result = await signAndSendWithMagic(ua, tx, address);
      const transactionId = (result?.transactionId as string | undefined) ?? tx.transactionId;
      const txHash = await resolveTxHash(address, transactionId);
      if (!txHash) {
        return {
          ok: false,
          message:
            "Your transfer was submitted but we couldn't confirm the on-chain hash in time. It may still credit shortly, check back in a moment.",
        };
      }
      const res = await submitFunding({ data: { address, asset, txHash } });
      if ("ok" in res && res.ok) {
        await dashboardQuery.refetch();
        return { ok: true, creditedCents: res.creditedCents };
      }
      return { ok: false, message: ("message" in res && res.message) || "Crediting failed." };
    },
    [address, dashboardQuery],
  );

  return {
    address,
    configured: dashboardQuery.data?.configured ?? false,
    authorized: dashboardQuery.data?.authorized ?? false,
    dashboard: dashboardQuery.data?.dashboard ?? null,
    loading: dashboardQuery.isLoading,
    authorize,
    revoke,
    fund,
    refresh: () => dashboardQuery.refetch(),
  };
}
