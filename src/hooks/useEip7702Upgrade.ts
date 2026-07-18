import { useState } from "react";
import { ZeroAddress } from "@particle-network/universal-account-sdk";
import { getUniversalAccount } from "@/lib/studio/particle";
import { signAndSendWithMagic, useMagic, useMagicAddress } from "@/lib/studio/magicSigner";
import { arbitrumOne } from "@/lib/chains";

export type UpgradeStatus = "idle" | "preparing" | "signing" | "done" | "error";

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
  const canUpgrade = !!(magic && address);

  const upgrade = async () => {
    setError(null);
    setTxId(null);

    if (!magic || !address) {
      setError("Connect your CRUZ wallet (Magic) to run the EIP-7702 upgrade.");
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
        setError("This address is already upgraded on Arbitrum One — nothing to authorize.");
        setStatus("error");
        return;
      }

      setStatus("signing");
      const result = await signAndSendWithMagic(ua, tx, address);
      setTxId((result?.transactionId as string | undefined) ?? tx.transactionId);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upgrade failed");
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
