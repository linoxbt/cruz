import { createFileRoute, Link } from "@tanstack/react-router";
import { useAccount } from "wagmi";
import { Loader2, ArrowRight, LogIn } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { ConnectModal } from "@/components/web3/ConnectModal";
import { useUniversalAccount } from "@/hooks/useUniversalAccount";
import { useDelegationStatus } from "@/hooks/useDelegationStatus";
import { useGasPrice } from "@/hooks/useGasPrice";
import { isParticleConfigured } from "@/lib/studio/particle";
import { truncateAddress } from "@/lib/wallet";
import { arbitrumOne } from "@/lib/chains";
import { CRUZ_MODULES, CRUZ_MODULE_ICONS } from "@/lib/studio/manifest";
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
      <div className="space-y-6 p-6">
        <AppStats connected={isConnected} />
        {!isConnected || !address ? (
          <LoginBanner onConnect={() => setShowConnect(true)} />
        ) : (
          <>
            <UnifiedBalanceCard address={address} />
            <DelegationCard address={address} />
          </>
        )}
        <QuickActions />
      </div>
      {showConnect && <ConnectModal onClose={() => setShowConnect(false)} />}
    </div>
  );
}

/* ─────────── App stats — always visible, no wallet required ─────────── */

function AppStats({ connected }: { connected: boolean }) {
  const { data: gasGwei } = useGasPrice();

  const stats = [
    { label: "Chain", value: arbitrumOne.name },
    { label: "Modules", value: String(CRUZ_MODULES.length) },
    { label: "Gas price", value: gasGwei !== undefined ? `${gasGwei.toFixed(3)} gwei` : "…" },
    { label: "Status", value: connected ? "Connected" : "Not connected" },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="rounded-sm border border-border bg-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-wider text-meta">{s.label}</div>
          <div className="mt-1 font-display text-lg font-bold text-foreground">{s.value}</div>
        </div>
      ))}
    </div>
  );
}

/* ─────────── Login banner (replaces the balance/delegation cards only) ─────────── */

function LoginBanner({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="cruz-glow rounded-sm border border-border bg-surface">
      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center sm:flex-row sm:justify-between sm:text-left">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <LogIn className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-base font-bold">Log in to see your balance</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Email + OTP via Magic — CRUZ shows your Universal Account&apos;s balance across every
              supported chain.
            </p>
          </div>
        </div>
        <button
          onClick={onConnect}
          className="shrink-0 rounded-sm bg-primary px-5 py-2.5 font-mono text-sm font-medium text-primary-foreground hover:bg-primary-hover"
        >
          Log in
        </button>
      </div>
    </div>
  );
}

/* ─────────── Unified balance ─────────── */

function UnifiedBalanceCard({ address }: { address: `0x${string}` }) {
  const { data, isLoading, isError, error } = useUniversalAccount(address);

  return (
    <div className="rounded-sm border border-border bg-surface">
      <div className="border-b border-border p-4 pb-3">
        <div className="flex items-center justify-between text-sm font-bold text-foreground">
          <span>Unified Balance</span>
          <span className="font-mono text-[11px] font-normal text-meta">
            {truncateAddress(address)}
          </span>
        </div>
      </div>
      <div className="p-4">
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
      </div>
    </div>
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
  const { data, isLoading, isError } = useDelegationStatus(address);

  return (
    <div className="rounded-sm border border-border bg-surface">
      <div className="border-b border-border p-4 pb-3 text-sm font-bold text-foreground">
        Account Status
      </div>
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading account code on Arbitrum One…
          </div>
        ) : isError || !data ? (
          <p className="text-sm text-danger">
            Couldn&apos;t read the account&apos;s code from Arbitrum One.
          </p>
        ) : data.isUpgraded ? (
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
      </div>
    </div>
  );
}

/* ─────────── Quick actions ─────────── */

function QuickActions() {
  return (
    <div>
      <h3 className="mb-3 font-mono text-[11px] uppercase tracking-widest text-meta">
        Quick actions
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CRUZ_MODULES.map((m) => {
          const Icon = CRUZ_MODULE_ICONS[m.id];
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
