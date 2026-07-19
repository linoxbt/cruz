import { Bot, UserCheck } from "lucide-react";
import type { BuildMode } from "@/hooks/useAppAgent";

/** Asked once, before a build starts: Auto proceeds through the task list
 *  on its own (still pausing for security-relevant findings); Manual pauses
 *  after the plan for an explicit "Approve & continue" before any files get
 *  validated/finalized. */
export function ModePicker({ onChoose }: { onChoose: (mode: BuildMode) => void }) {
  return (
    <div className="rounded-sm border border-border bg-surface p-6">
      <div className="font-mono text-xs uppercase tracking-wider text-meta">
        How should this build run?
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          onClick={() => onChoose("auto")}
          className="flex flex-col items-start gap-2 rounded-sm border border-border p-4 text-left transition hover:border-primary/50"
        >
          <Bot className="h-5 w-5 text-primary" />
          <span className="font-display text-sm font-bold text-foreground">Auto</span>
          <span className="text-xs leading-relaxed text-muted-foreground">
            Moves through the plan, build, and test steps on its own. Still pauses for
            security-relevant findings before Apply.
          </span>
        </button>
        <button
          onClick={() => onChoose("manual")}
          className="flex flex-col items-start gap-2 rounded-sm border border-border p-4 text-left transition hover:border-primary/50"
        >
          <UserCheck className="h-5 w-5 text-primary" />
          <span className="font-display text-sm font-bold text-foreground">Manual</span>
          <span className="text-xs leading-relaxed text-muted-foreground">
            Pauses after every plan for your explicit &quot;Approve &amp; continue&quot; before
            writing any files.
          </span>
        </button>
      </div>
    </div>
  );
}
