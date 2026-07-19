import { CheckCircle2, Loader2, Wallet, Zap } from "lucide-react";
import { useAccount } from "wagmi";
import { useEip7702Upgrade } from "@/hooks/useEip7702Upgrade";
import { Button } from "@/components/ui/button";

const STATUS_LABEL: Record<string, string> = {
  preparing: "Preparing transaction…",
  signing: "Signing and submitting…",
};

export function UpgradeFlow() {
  const { address } = useAccount();
  const { status, error, txId, canUpgrade, upgrade, reset } = useEip7702Upgrade();
  const busy = status === "preparing" || status === "signing";

  if (!canUpgrade) {
    return (
      <div className="rounded-lg border border-warning/40 bg-warning/5 p-4">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-warning" />
          <span className="text-sm font-bold text-foreground">Connect to upgrade</span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Connect your CRUZ wallet (Magic) from the sidebar to run the EIP-7702 upgrade on this
          address.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-primary" />
        <span className="text-sm font-bold text-foreground">Upgrade to a Universal Account</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        Upgrades <span className="text-foreground">{address}</span> on Arbitrum One via a real
        EIP-7702 authorization, signed by your Magic wallet and submitted through Particle&apos;s
        Universal Accounts SDK.
      </p>

      {status === "done" && txId && (
        <div className="mt-3 rounded-md border border-success/40 bg-success/5 p-3 text-xs text-success">
          Upgrade submitted, transaction {txId}
        </div>
      )}
      {status === "already-upgraded" && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-success/40 bg-success/5 p-3 text-xs text-success">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          This address already has a live EIP-7702 delegation on Arbitrum One, nothing to do.
        </div>
      )}
      {status === "error" && error && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Button onClick={() => upgrade()} disabled={busy || status === "done"}>
          {busy ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {STATUS_LABEL[status]}
            </>
          ) : (
            "Run EIP-7702 Upgrade"
          )}
        </Button>
        {(status === "done" || status === "error" || status === "already-upgraded") && (
          <Button variant="outline" onClick={reset}>
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}
