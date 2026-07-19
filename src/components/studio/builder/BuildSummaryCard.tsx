import { Clock, RefreshCw, ShieldAlert, TestTube2 } from "lucide-react";
import type { BuildMetrics } from "@/hooks/useAppAgent";

export function formatElapsed(ms: number): string {
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return `${mins}m ${rem}s`;
}

/** Plain, no-fabrication build stats — shown once the build's ready to
 *  review/apply. Zero/not-applicable metrics are shown as such, not hidden,
 *  since the whole point is demonstrating real numbers, not impressive ones. */
export function BuildSummaryCard({ metrics }: { metrics: BuildMetrics }) {
  const elapsed =
    metrics.startedAt && metrics.finishedAt ? metrics.finishedAt - metrics.startedAt : null;

  const stats = [
    {
      icon: Clock,
      label: "Time to build",
      value: elapsed !== null ? formatElapsed(elapsed) : "-",
    },
    {
      icon: RefreshCw,
      label: "Fix iterations",
      value: String(metrics.iterations),
    },
    {
      icon: TestTube2,
      label: "Build check",
      value: metrics.testsRun > 0 ? `${metrics.testsPassed}/${metrics.testsRun} passed` : "-",
    },
    {
      icon: ShieldAlert,
      label: "Findings caught",
      value: String(metrics.errorsCaught),
    },
  ];

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <div className="font-mono text-xs uppercase tracking-wider text-meta">Build summary</div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-sm border border-border bg-background p-3">
            <s.icon className="h-3.5 w-3.5 text-primary" />
            <div className="mt-1.5 font-display text-lg font-bold text-foreground">{s.value}</div>
            <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-meta">
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
