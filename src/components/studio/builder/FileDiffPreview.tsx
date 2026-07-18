import { diffLines, diffStats } from "@/lib/diff";
import { cn } from "@/lib/utils";

interface Props {
  before: Record<string, string>;
  after: Record<string, string>;
}

// Diff-review-before-apply — the AI Builder's mandatory human gate. There's
// no client-side TypeScript compiler CRUZ can lean on to certify generated
// code the way compiler.worker.ts leans on solc for Solidity, so nothing
// here is ever applied to the "real" file state until a person looks at
// this and clicks Apply — same discipline as the Composer's preview/execute
// split.
export function FileDiffPreview({ before, after }: Props) {
  const paths = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
  const changed = paths.filter((p) => before[p] !== after[p]);

  if (changed.length === 0) {
    return <p className="font-mono text-xs text-meta">No changes.</p>;
  }

  return (
    <div className="space-y-2">
      {changed.map((path) => {
        const oldC = before[path] ?? "";
        const newC = after[path] ?? "";
        const ops = diffLines(oldC, newC);
        const stats = diffStats(ops);
        const isNew = before[path] === undefined;
        const isDeleted = after[path] === undefined;
        return (
          <details key={path} open className="rounded-sm border border-border bg-surface">
            <summary className="cursor-pointer select-none px-3 py-2 font-mono text-xs text-foreground">
              {path}
              {isNew && <span className="ml-2 text-success">new</span>}
              {isDeleted && <span className="ml-2 text-destructive">removed</span>}
              <span className="ml-2 text-meta">
                +{stats.added} -{stats.removed}
              </span>
            </summary>
            <div className="max-h-64 overflow-y-auto border-t border-border px-3 py-2 font-mono text-[11px] leading-relaxed">
              {ops.map((op, i) => (
                <div
                  key={i}
                  className={cn(
                    "whitespace-pre-wrap break-all",
                    op.type === "add" && "bg-success/10 text-success",
                    op.type === "del" && "bg-destructive/10 text-destructive",
                  )}
                >
                  {op.type === "add" ? "+ " : op.type === "del" ? "- " : "  "}
                  {op.text}
                </div>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
