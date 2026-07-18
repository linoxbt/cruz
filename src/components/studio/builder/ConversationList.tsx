import { Loader2, Plus, Trash2 } from "lucide-react";
import { useConversations } from "@/lib/studio-ai/conversations";
import { useAgentRuntime } from "@/lib/studio-ai/agentRuntime";
import { cn } from "@/lib/utils";

interface Props {
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Browse, resume, or start a new AI Builder conversation — each one
 *  persists to localStorage (see conversations.ts) so reloading the page or
 *  coming back later picks up exactly where you left off. */
export function ConversationList({ activeId, onSelect, onCreate }: Props) {
  const conversations = useConversations((s) => s.conversations);
  const remove = useConversations((s) => s.remove);
  const runs = useAgentRuntime((s) => s.runs);

  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="rounded-sm border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="font-mono text-xs uppercase tracking-wider text-meta">Conversations</span>
        <button
          onClick={onCreate}
          className="flex items-center gap-1 rounded border border-border px-2 py-1 font-mono text-[11px] text-muted-foreground hover:border-primary hover:text-primary"
        >
          <Plus className="h-3 w-3" /> New
        </button>
      </div>
      <div className="max-h-56 overflow-y-auto p-1">
        {sorted.length === 0 && (
          <p className="p-2 font-mono text-[11px] text-meta">
            No conversations yet — start one below.
          </p>
        )}
        {sorted.map((c) => (
          <div
            key={c.id}
            className={cn(
              "group flex items-center gap-1 rounded px-2 py-1.5 font-mono text-[11px]",
              c.id === activeId
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
            )}
          >
            <button
              onClick={() => onSelect(c.id)}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate">{c.title}</span>
                <span className="block text-[10px] text-meta">{relativeTime(c.updatedAt)}</span>
              </span>
              {runs[c.id]?.running && (
                <span title="Building…">
                  <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />
                </span>
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                remove(c.id);
              }}
              className="hidden rounded p-1 text-meta hover:text-danger group-hover:block"
              title="Delete conversation"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
