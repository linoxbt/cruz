import { CheckCircle2, Circle, Loader2, MinusCircle, XCircle } from "lucide-react";
import type { BuildStep } from "@/hooks/useAppAgent";
import { cn } from "@/lib/utils";

const ICONS = {
  pending: Circle,
  in_progress: Loader2,
  done: CheckCircle2,
  failed: XCircle,
  skipped: MinusCircle,
} as const;

/** The build's persistent task list — spec/scaffold-or-implement/test/
 *  deploy/monitor — with live per-step status, so a reload or a switch to
 *  another conversation and back resumes showing exactly where the build
 *  left off, not just "is it running right now." */
export function TaskList({ steps }: { steps: BuildStep[] }) {
  return (
    <div className="space-y-1.5 p-3">
      {steps.map((step) => {
        const Icon = ICONS[step.status];
        return (
          <div
            key={step.id}
            className={cn(
              "flex items-start gap-2 rounded-sm border border-border bg-surface px-2.5 py-1.5 font-mono text-[11px]",
              step.status === "failed" && "border-destructive/40 bg-destructive/5",
              step.status === "done" && "border-success/30",
              step.status === "skipped" && "opacity-50",
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 h-3 w-3 shrink-0",
                step.status === "in_progress" && "animate-spin text-primary",
                step.status === "done" && "text-success",
                step.status === "failed" && "text-destructive",
                step.status === "pending" && "text-meta",
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-foreground">{step.label}</span>
                {step.attempts ? (
                  <span className="shrink-0 text-meta">attempt {step.attempts + 1}</span>
                ) : null}
              </div>
              {step.detail && <div className="mt-0.5 truncate text-meta">{step.detail}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
