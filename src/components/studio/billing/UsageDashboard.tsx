import { useState } from "react";
import { Coins, Gauge, History, Sparkles, Wallet, ShieldCheck, ShieldOff } from "lucide-react";
import { useBilling } from "@/hooks/useBilling";
import { formatCents } from "@/lib/billing/format";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { FundingModal } from "./FundingModal";
import { SpendingAuthModal } from "./SpendingAuthModal";
import type { Dashboard } from "@/lib/billing/types";

function Stat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Coins;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-sm border border-border bg-surface p-3">
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-meta">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="mt-1 font-mono text-lg font-bold text-foreground">{value}</div>
      {sub && <div className="font-mono text-[10px] text-meta">{sub}</div>}
    </div>
  );
}

const STATUS_LABEL: Record<Dashboard["status"], { text: string; className: string }> = {
  active: { text: "Active", className: "border-success/40 text-success" },
  "needs-funding": { text: "Needs funding", className: "border-warning/40 text-warning" },
  "not-authorized": { text: "Not authorized", className: "border-warning/40 text-warning" },
  revoked: { text: "Revoked", className: "border-destructive/40 text-destructive" },
};

// The full usage panel: free prompts remaining, prepaid balance, total spend,
// prompts used, average cost/prompt, recent transactions, current status, and
// the fund/authorize actions. Renders a compact "billing off" note when the
// server hasn't configured billing, so it's harmless to always mount.
export function UsageDashboard() {
  const { configured, authorized, dashboard, loading, refresh } = useBilling();
  const [fundOpen, setFundOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  if (!configured) {
    return (
      <div className="rounded-sm border border-border bg-surface p-4 font-mono text-xs text-meta">
        Usage-based billing isn&apos;t enabled on this deployment. The AI Builder is free to use
        here.
      </div>
    );
  }

  if (loading && !dashboard) {
    return (
      <div className="rounded-sm border border-border bg-surface p-4 font-mono text-xs text-meta">
        Loading usage…
      </div>
    );
  }
  if (!dashboard) return null;

  const d = dashboard;
  const freePct = d.freeLimit > 0 ? (d.freeRemaining / d.freeLimit) * 100 : 0;
  const status = STATUS_LABEL[d.status];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-mono text-xs font-bold text-foreground">
          <Gauge className="h-3.5 w-3.5 text-primary" /> Usage &amp; billing
        </div>
        <Badge variant="outline" className={status.className}>
          {status.text}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          icon={Sparkles}
          label="Free prompts"
          value={`${d.freeRemaining}/${d.freeLimit}`}
          sub="remaining"
        />
        <Stat icon={Wallet} label="Balance" value={formatCents(d.balanceCents)} sub="prepaid" />
        <Stat icon={Coins} label="Total spent" value={formatCents(d.totalSpentCents)} />
        <Stat
          icon={Gauge}
          label="Avg / prompt"
          value={formatCents(d.avgCostCentsPerPrompt)}
          sub={`${d.promptsUsed} used`}
        />
      </div>

      {d.freeLimit > 0 && d.freeRemaining > 0 && (
        <div>
          <Progress value={freePct} className="h-1.5" />
          <p className="mt-1 font-mono text-[10px] text-meta">
            {d.freeRemaining} free {d.freeRemaining === 1 ? "prompt" : "prompts"} left, then
            it&apos;s pay-as-you-build from your balance.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setFundOpen(true)}>
          <Wallet className="h-3.5 w-3.5" /> Add funds
        </Button>
        <Button size="sm" variant="outline" onClick={() => setAuthOpen(true)}>
          {authorized ? (
            <>
              <ShieldCheck className="h-3.5 w-3.5" /> Manage authorization
            </>
          ) : (
            <>
              <ShieldOff className="h-3.5 w-3.5" /> Authorize spending
            </>
          )}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => refresh()}>
          Refresh
        </Button>
      </div>

      <div>
        <div className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-meta">
          <History className="h-3 w-3" /> Recent transactions
        </div>
        {d.recentTransactions.length === 0 ? (
          <p className="font-mono text-[11px] text-meta">No transactions yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-sm border border-border">
            {d.recentTransactions.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between px-2.5 py-1.5 font-mono text-[11px]"
              >
                <span className="text-muted-foreground">
                  {t.type === "funding" ? "Funded" : t.type === "free" ? "Free prompt" : "Usage"}
                  {t.detail ? ` · ${t.detail}` : ""}
                </span>
                <span className={t.type === "funding" ? "text-success" : "text-foreground"}>
                  {t.type === "funding" ? "+" : "-"}
                  {formatCents(t.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <FundingModal open={fundOpen} onOpenChange={setFundOpen} />
      <SpendingAuthModal open={authOpen} onOpenChange={setAuthOpen} />
    </div>
  );
}
