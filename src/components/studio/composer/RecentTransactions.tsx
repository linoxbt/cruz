import { ExternalLink, History, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useComposerHistory, type ComposerHistoryEntry } from "@/lib/studio/composerHistory";
import type { ComposerInput } from "@/hooks/useTxComposer";
import { arbitrumOne, chainConfig } from "@/lib/chains";
import { truncateAddress, truncateHash } from "@/lib/wallet";

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function functionNameOf(functionAbi: string): string {
  return functionAbi
    .split("(")[0]
    .replace(/^function\s+/, "")
    .trim();
}

function summarize(input: ComposerInput): string {
  if (input.mode === "transfer") {
    return `Send ${input.amount || "0"} → ${truncateAddress(input.receiver)}`;
  }
  if (input.mode === "batch") {
    return `Batch · ${input.calls.length} call${input.calls.length !== 1 ? "s" : ""}`;
  }
  return `${functionNameOf(input.functionAbi)}() → ${truncateAddress(input.targetAddress)}`;
}

/** Persisted list of transactions actually executed through the Composer
 *  (see composerHistory.ts) — a real explorer link plus a "Load" button that
 *  feeds the same input back into AssetPicker. */
export function RecentTransactions({ onLoad }: { onLoad: (input: ComposerInput) => void }) {
  const entries = useComposerHistory((s) => s.entries);
  const clear = useComposerHistory((s) => s.clear);
  const explorer = chainConfig(arbitrumOne.id).explorerUrl;

  if (entries.length === 0) return null;

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-meta">
          <History className="h-3.5 w-3.5" /> Recent
        </div>
        <button onClick={clear} className="font-mono text-[10px] text-meta hover:text-foreground">
          Clear
        </button>
      </div>
      <div className="mt-3 space-y-2">
        {entries.map((e: ComposerHistoryEntry) => (
          <div
            key={e.id}
            className="flex items-center justify-between gap-2 rounded border border-border px-3 py-2"
          >
            <div className="min-w-0">
              <div className="truncate font-mono text-xs text-foreground">{summarize(e.input)}</div>
              <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-meta">
                <span>{relativeTime(e.timestamp)}</span>
                <a
                  href={`${explorer}/tx/${e.txId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-0.5 text-primary hover:underline"
                >
                  {truncateHash(e.txId)} <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => onLoad(e.input)}>
              <RotateCcw className="h-3.5 w-3.5" /> Load
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
