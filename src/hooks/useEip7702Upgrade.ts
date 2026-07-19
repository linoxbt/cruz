import { useState } from "react";
import { useChainId } from "wagmi";
import { ZeroAddress } from "@particle-network/universal-account-sdk";
import { getUniversalAccount } from "@/lib/studio/particle";
import { signAndSendWithMagic, useMagic, useMagicAddress } from "@/lib/studio/magicSigner";
import { arbitrumOne } from "@/lib/chains";

export type UpgradeStatus =
  "idle" | "preparing" | "signing" | "done" | "already-upgraded" | "error";

export interface UpgradeResult {
  status: UpgradeStatus;
  error: string | null;
  txId: string | null;
  /** false until a Magic wallet is connected. */
  canUpgrade: boolean;
  upgrade: () => Promise<void>;
  reset: () => void;
}

/**
 * Drives the EIP-7702 upgrade for the connected Magic wallet on Arbitrum One.
 *
 * Magic's embedded wallet is exactly the "embedded wallet" case Particle's
 * EIP-7702 mode supports, and Magic's `sign7702Authorization` produces the
 * signed authorization object Particle's sendTransaction expects — so the
 * upgrade now goes through the connected Magic account, not a separate burner.
 *
 * Mechanism: build the smallest possible carrier transaction (a zero-value
 * self-transfer) purely to bundle the pending per-userOp `eip7702Auth`, then
 * signAndSendWithMagic signs each pending auth + the tx rootHash and submits.
 */
export function useEip7702Upgrade(): UpgradeResult {
  const [status, setStatus] = useState<UpgradeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txId, setTxId] = useState<string | null>(null);

  const magic = useMagic();
  const address = useMagicAddress();
  const chainId = useChainId();
  const canUpgrade = !!(magic && address);

  const upgrade = async () => {
    setError(null);
    setTxId(null);

    if (!magic || !address) {
      setError("Connect your CRUZ wallet (Magic) to run the EIP-7702 upgrade.");
      setStatus("error");
      return;
    }

    if (chainId !== arbitrumOne.id) {
      setError("Switch your wallet to Arbitrum One before running the upgrade.");
      setStatus("error");
      return;
    }

    try {
      setStatus("preparing");
      const ua = getUniversalAccount(address);

      const tx = await ua.createTransferTransaction({
        token: { chainId: arbitrumOne.id, address: ZeroAddress },
        amount: "0",
        receiver: address,
      });

      if (!tx.userOps.some((op) => op.eip7702Auth)) {
        // Not a failure — the account already has a live EIP-7702 delegation
        // on this chain, so there's nothing left to authorize. Kept as its
        // own status (not "error") so the UI doesn't show this as a crash.
        setStatus("already-upgraded");
        return;
      }

      setStatus("signing");
      const result = await signAndSendWithMagic(ua, tx, address);
      setTxId((result?.transactionId as string | undefined) ?? tx.transactionId);
      setStatus("done");
    } catch (e) {
      // Log the raw error so a Magic/Particle-SDK-specific shape (error
      // codes, nested `data`/`details` fields) is inspectable in the
      // console — the string below is what's shown in the UI, but the
      // console has the full object for diagnosing exactly what failed.
      console.error("[CRUZ] EIP-7702 upgrade failed:", e);
      setError(describeUpgradeError(e));
      setStatus("error");
    }
  };

  const reset = () => {
    setStatus("idle");
    setError(null);
    setTxId(null);
  };

  return { status, error, txId, canUpgrade, upgrade, reset };
}

// Web3 SDKs (Magic, Particle, viem/wagmi) rarely throw a plain `Error` —
// they usually attach the real cause on `.message`, `.reason`, `.details`,
// or a nested `.data.message`/`.cause.message`. Falling back straight to
// "Upgrade failed" (as this used to) throws that detail away. Walk the
// common shapes before giving up.
function describeUpgradeError(e: unknown): string {
  if (e && typeof e === "object") {
    const obj = e as Record<string, unknown>;
    const candidates = [
      obj.message,
      obj.reason,
      obj.details,
      (obj.data as Record<string, unknown> | undefined)?.message,
      (obj.cause as Record<string, unknown> | undefined)?.message,
    ];
    for (const c of candidates) {
      if (typeof c === "string" && c.trim()) return c;
    }
  }
  if (e instanceof Error) return e.message;
  return "Upgrade failed, see the browser console for details.";
}
