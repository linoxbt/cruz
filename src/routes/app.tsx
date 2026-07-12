import { createFileRoute, Link } from "@tanstack/react-router";
import { useAccount } from "wagmi";
import {
  Loader2,
  ScanSearch,
  Waypoints,
  PackagePlus,
  Code2,
  ArrowRight,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConnectModal } from "@/components/web3/ConnectModal";
import { useUniversalAccount } from "@/hooks/useUniversalAccount";
import { useDelegationStatus } from "@/hooks/useDelegationStatus";
import { isParticleConfigured } from "@/lib/studio/particle";
import { truncateAddress } from "@/lib/wallet";
import { CRUZ_MODULES } from "@/lib/studio/manifest";
import { useState } from "react";

export const Route = createFileRoute("/app")({
  head: () => ({ meta: [{ title: "Dashboard — CRUZ" }] }),
  component: AppDashboard,
});

function AppDashboard() {
  const { address, isConnected } = useAccount();
  const [showConnect, setShowConnect] = useState(false);

  return (
    <div>
      <PageHeader
        breadcrumb={["CRUZ", "Dashboard"]}
        title="Universal Account"
        subtitle="Your connected wallet's unified cross-chain balance and upgrade status."
      />
      <div className="p-6">
        {!isConnected || !address ? (
          <ConnectPrompt onConnect={() => setShowConnect(true)} />
        ) : (
          <div className="space-y-6">
            <UnifiedBalanceCard address={address} />
            <DelegationCard address={address} />
            <QuickActions />
          </div>
        )}
      </div>
      {showConnect && <ConnectModal onClose={() => setShowConnect(false)} />}
    </div>
  );
}

/* ─────────── Connect prompt ─────────── */

function ConnectPrompt({ onConnect }: { onConnect: () => void }) {
  return (
    <Card className="cruz-glow border-border">
      <CardContent className="flex flex-col items-center gap-4 px-6 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Wallet className="h-7 w-7" />
        </div>
        <div>
          <h2 className="font-display text-lg font-bold">Connect to see your unified balance</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Log in with Magic (email or social) and CRUZ shows your Universal Account&apos;s balance
            across every supported chain.
          </p>
        </div>
        <button
          onClick={onConnect}
          className="rounded-sm bg-primary px-5 py-2.5 font-mono text-sm font-medium text-primary-foreground hover:bg-primary-hover"
        >
          Log in with Magic
        </button>
      </CardContent>
    </Card>
  );
}

/* ─────────── Unified balance ─────────── */

function UnifiedBalanceCard({ address }: { address: `0x${string}` }) {
  const { data, isLoading, isError, error } = useUniversalAccount(address);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm">
          <span>Unified Balance</span>
          <span className="font-mono text-[11px] font-normal text-meta">
            {truncateAddress(address)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!isParticleConfigured() ? (
          <ConfigNotice />
        ) : isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Fetching unified balance…
          </div>
        ) : isError || !data ? (
          <p className="text-sm text-danger">
            Couldn&apos;t fetch unified balance
            {error instanceof Error ? `: ${error.message}` : ""}.
          </p>
        ) : (
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-4xl font-bold tracking-tight">
                ${data.totalAmountInUSD.toFixed(2)}
              </span>
              <span className="font-mono text-xs text-meta">across all chains</span>
            </div>
            {data.assets.length > 0 ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {data.assets.map((asset) => (
                  <div
                    key={asset.tokenType}
                    className="rounded-lg border border-border bg-surface p-3"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-bold">{asset.tokenType.toUpperCase()}</span>
                      <span className="text-muted-foreground">
                        {asset.amount.toLocaleString()} · ${asset.amountInUSD.toFixed(2)}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1">
                      {asset.chainAggregation.map((c) => (
                        <div
                          key={`${c.token.chainId}-${c.token.address}`}
                          className="flex items-center justify-between text-[11px] text-meta"
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
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No primary assets found.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConfigNotice() {
  return (
    <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-xs text-muted-foreground">
      Particle Network isn&apos;t configured — set{" "}
      <code className="text-foreground">VITE_PARTICLE_*</code> env vars. See REQUIREMENTS.md.
    </div>
  );
}

/* ─────────── Delegation status ─────────── */

function DelegationCard({ address }: { address: `0x${string}` }) {
  const { data, isLoading } = useDelegationStatus(address);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Account Status</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading account code on Arbitrum One…
          </div>
        ) : data?.isUpgraded ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="h-2 w-2 rounded-full bg-success" />
            <span className="font-medium text-success">Upgraded Universal Account</span>
            <span className="text-meta">· EIP-7702 delegated</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm">
              <span className="h-2 w-2 rounded-full bg-meta" />
              <span className="font-medium">Plain EOA</span>
              <span className="text-meta">· not upgraded yet</span>
            </div>
            <Link
              to="/inspector"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Run the upgrade <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─────────── Quick actions ─────────── */

function QuickActions() {
  const icons: Record<string, typeof ScanSearch> = {
    inspector: ScanSearch,
    composer: Waypoints,
    scaffolder: PackagePlus,
    editor: Code2,
  };
  return (
    <div>
      <h3 className="mb-3 font-mono text-[11px] uppercase tracking-widest text-meta">
        Quick actions
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CRUZ_MODULES.map((m) => {
          const Icon = icons[m.id] ?? ScanSearch;
          return (
            <Link
              key={m.id}
              to={m.path}
              className="group rounded-sm border border-border bg-surface p-4 transition hover:border-primary/50 hover:bg-surface-2"
            >
              <Icon className="mb-2 h-5 w-5 text-primary" />
              <div className="font-display text-sm font-bold">{m.label}</div>
              <div className="mt-1 text-[11px] text-meta">{m.description}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
