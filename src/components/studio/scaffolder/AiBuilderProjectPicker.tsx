import { Bot } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useConversations } from "@/lib/studio-ai/conversations";
import { cn } from "@/lib/utils";

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Lets the Scaffolder pull files straight from something already built in
 *  the AI Builder, instead of only the fixed unified-wallet template — the
 *  same GitHub/Vercel/Netlify delivery in ResultPanel.tsx just gets fed a
 *  different file set. Only conversations with at least one applied file are
 *  listed (a conversation that's mid-review or hasn't produced anything
 *  isn't "built" yet). */
export function AiBuilderProjectPicker({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const navigate = useNavigate();
  const conversations = useConversations((s) => s.conversations);
  const built = conversations
    .filter((c) => Object.keys(c.files).length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  if (built.length === 0) {
    return (
      <div className="rounded-sm border border-dashed border-border bg-surface p-6 text-center">
        <Bot className="mx-auto h-6 w-6 text-meta" />
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          You haven&apos;t built anything in the AI Builder yet.
        </p>
        <Button variant="outline" className="mt-3" onClick={() => navigate({ to: "/builder" })}>
          Go to AI Builder
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {built.map((c) => (
        <Card
          key={c.id}
          className={cn("cursor-pointer transition", selectedId === c.id && "border-primary")}
          onClick={() => onSelect(c.id)}
        >
          <CardHeader>
            <Bot className="h-6 w-6 text-primary" />
            <CardTitle className="text-base">{c.projectName || c.title}</CardTitle>
            <CardDescription>
              {Object.keys(c.files).length} file{Object.keys(c.files).length !== 1 ? "s" : ""} ·
              updated {relativeTime(c.updatedAt)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-[10px] uppercase tracking-wider text-meta">
              {c.title}
            </span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
