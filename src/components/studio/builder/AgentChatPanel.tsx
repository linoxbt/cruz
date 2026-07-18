import { useEffect, useRef, useState } from "react";
import { Bot, CheckCircle2, Link2, Loader2, Send, Square, User, XCircle } from "lucide-react";
import type { TimelineItem, ToolStep } from "@/hooks/useAppAgent";
import { cn } from "@/lib/utils";

interface Props {
  timeline: TimelineItem[];
  running: boolean;
  onSend: (prompt: string, inspirationUrl?: string) => void;
  onStop: () => void;
  disabled?: boolean;
  disabledReason?: string;
}

const STEP_LABELS: Record<ToolStep["kind"], string> = {
  generate: "Generating",
  "protected-file-check": "Checking protected files",
  "structural-check": "Structural check",
  "inspect-url": "Looking at reference site",
};

function ToolStepRow({ step }: { step: ToolStep }) {
  const Icon =
    step.status === "running" ? Loader2 : step.status === "done" ? CheckCircle2 : XCircle;
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-sm border border-border bg-surface px-2.5 py-1.5 font-mono text-[11px]",
        step.status === "error" && "border-destructive/40 bg-destructive/5",
        step.status === "done" && "border-success/30",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 h-3 w-3 shrink-0",
          step.status === "running" && "animate-spin text-primary",
          step.status === "done" && "text-success",
          step.status === "error" && "text-destructive",
        )}
      />
      <div className="min-w-0">
        <div className="text-foreground">{STEP_LABELS[step.kind]}</div>
        {step.detail && <div className="mt-0.5 truncate text-meta">{step.detail}</div>}
      </div>
    </div>
  );
}

/** Antigravity/Codex-style conversation panel: user prompts, the agent's
 *  plain-text replies, and inline tool-step status rows for what it's doing
 *  right now (generating, checking protected files, running structural
 *  checks) — a live action log, not a raw markdown dump of the model's
 *  output protocol. */
export function AgentChatPanel({
  timeline,
  running,
  onSend,
  onStop,
  disabled,
  disabledReason,
}: Props) {
  const [input, setInput] = useState("");
  const [inspirationUrl, setInspirationUrl] = useState("");
  const [showInspiration, setShowInspiration] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [timeline]);

  const submit = () => {
    const text = input.trim();
    if (!text || running || disabled) return;
    setInput("");
    const url = inspirationUrl.trim();
    setInspirationUrl("");
    onSend(text, url || undefined);
  };

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
        {timeline.length === 0 && (
          <p className="font-mono text-xs text-meta">
            Describe the app you want CRUZ&apos;s AI Builder to build — e.g. &quot;a unified-balance
            dashboard with a dark mode toggle and a tip-jar demo contract.&quot;
          </p>
        )}
        {timeline.map((item, i) => {
          if (item.role === "tool" && item.tool) return <ToolStepRow key={i} step={item.tool} />;
          const isUser = item.role === "user";
          return (
            <div key={i} className={cn("flex gap-2", isUser && "flex-row-reverse")}>
              <div
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                  isUser ? "bg-primary/20 text-primary" : "bg-surface-2 text-meta",
                )}
              >
                {isUser ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
              </div>
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-sm border border-border px-2.5 py-1.5 font-mono text-xs text-foreground",
                  isUser ? "bg-primary/10" : "bg-surface",
                )}
              >
                {item.content}
              </div>
            </div>
          );
        })}
      </div>
      <div className="border-t border-border p-2">
        {disabled && disabledReason && (
          <p className="mb-2 rounded-sm border border-warning/40 bg-warning/5 px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
            {disabledReason}
          </p>
        )}
        {showInspiration ? (
          <input
            value={inspirationUrl}
            onChange={(e) => setInspirationUrl(e.target.value)}
            placeholder="https://example.com — a site to reference for style/structure"
            disabled={disabled}
            className="mb-1.5 w-full rounded-sm border border-border bg-background px-2.5 py-1 font-mono text-[11px] text-foreground placeholder:text-meta focus:outline-none disabled:opacity-50"
          />
        ) : (
          <button
            onClick={() => setShowInspiration(true)}
            disabled={disabled}
            className="mb-1.5 flex items-center gap-1 font-mono text-[11px] text-meta hover:text-foreground disabled:opacity-50"
          >
            <Link2 className="h-3 w-3" /> Add a reference site for inspiration
          </button>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Describe what to build or change…"
            rows={2}
            disabled={disabled}
            className="flex-1 resize-none rounded-sm border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-foreground placeholder:text-meta focus:outline-none disabled:opacity-50"
          />
          {running ? (
            <button
              onClick={onStop}
              className="flex items-center gap-1 rounded-sm border border-destructive/40 px-3 py-1.5 font-mono text-xs text-destructive hover:bg-destructive/5"
            >
              <Square className="h-3.5 w-3.5" /> Stop
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={disabled || !input.trim()}
              className="flex items-center gap-1 rounded-sm bg-primary px-3 py-1.5 font-mono text-xs font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" /> Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
