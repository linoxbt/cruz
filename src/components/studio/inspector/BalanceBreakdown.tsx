import { Loader2 } from "lucide-react";
import { useUniversalAccount } from "@/hooks/useUniversalAccount";
import { isParticleConfigured } from "@/lib/studio/particle";

export function BalanceBreakdown({ address }: { address: string | undefined }) {
  const { data, isLoading, isError, error } = useUniversalAccount(address);

  if (!isParticleConfigured()) {
    return (
      <div className="rounded-sm border border-border bg-surface p-4 font-mono text-xs text-muted-foreground">
        Particle Network isn&apos;t configured — set{" "}
        <code className="text-foreground">VITE_PARTICLE_PROJECT_ID</code>,{" "}
        <code className="text-foreground">VITE_PARTICLE_CLIENT_KEY</code>, and{" "}
        <code className="text-foreground">VITE_PARTICLE_APP_ID</code>. See STUDIO_REQUIREMENTS.md.
      </div>
    );
  }

  if (!address) {
    return (
      <div className="rounded-sm border border-border bg-surface p-4 font-mono text-xs text-muted-foreground">
        Paste an address or connect a wallet to inspect its unified balance.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-sm border border-border bg-surface p-4 font-mono text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Fetching unified balance…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-sm border border-destructive/40 bg-destructive/5 p-4 font-mono text-xs text-destructive">
        Couldn&apos;t fetch unified balance{error instanceof Error ? `: ${error.message}` : ""}.
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-xs uppercase tracking-wider text-meta">
          Unified balance
        </span>
        <span className="font-mono text-2xl font-bold text-foreground">
          ${data.totalAmountInUSD.toFixed(2)}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {data.assets.length === 0 && (
          <p className="font-mono text-xs text-muted-foreground">No primary assets found.</p>
        )}
        {data.assets.map((asset) => (
          <div
            key={asset.tokenType}
            className="border-t border-border pt-3 first:border-0 first:pt-0"
          >
            <div className="flex items-center justify-between font-mono text-xs">
              <span className="font-bold text-foreground">{asset.tokenType.toUpperCase()}</span>
              <span className="text-muted-foreground">
                {asset.amount.toLocaleString()} · ${asset.amountInUSD.toFixed(2)}
              </span>
            </div>
            <div className="mt-1.5 space-y-1 pl-3">
              {asset.chainAggregation.map((c) => (
                <div
                  key={`${c.token.chainId}-${c.token.address}`}
                  className="flex items-center justify-between font-mono text-[11px] text-meta"
                >
                  <span>Chain {c.token.chainId}</span>
                  <span>
                    {c.amount.toLocaleString()} · ${c.amountInUSD.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
