import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Bot, Download, MessageSquare, PackagePlus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConversations } from "@/lib/studio-ai/conversations";
import { downloadZip } from "@/lib/zip";

export const Route = createFileRoute("/projects")({
  head: () => ({ meta: [{ title: "My Projects — CRUZ" }] }),
  component: ProjectsPage,
});

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Every AI Builder conversation in one place — built apps (at least one
 *  applied file) and drafts (still just a chat, nothing applied yet) as two
 *  separate lists, so starting five conversations in the Builder doesn't mean
 *  losing track of which ones actually produced something. */
function ProjectsPage() {
  const navigate = useNavigate();
  const conversations = useConversations((s) => s.conversations);
  const select = useConversations((s) => s.select);
  const remove = useConversations((s) => s.remove);

  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
  const built = sorted.filter((c) => Object.keys(c.files).length > 0);
  const drafts = sorted.filter((c) => Object.keys(c.files).length === 0);

  const openInBuilder = (id: string) => {
    select(id);
    navigate({ to: "/builder" });
  };

  return (
    <div>
      <PageHeader
        breadcrumb={["CRUZ", "My Projects"]}
        title="My Projects"
        subtitle="Every app you've started or built in the AI Builder."
      />
      <div className="space-y-8 p-6">
        {conversations.length === 0 && (
          <div className="rounded-sm border border-dashed border-border bg-surface p-10 text-center">
            <Bot className="mx-auto h-6 w-6 text-meta" />
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              You haven&apos;t started anything in the AI Builder yet.
            </p>
            <Button className="mt-3" onClick={() => navigate({ to: "/builder" })}>
              Go to AI Builder
            </Button>
          </div>
        )}

        {built.length > 0 && (
          <section>
            <h2 className="mb-3 font-mono text-[11px] uppercase tracking-widest text-meta">
              Built ({built.length})
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {built.map((c) => (
                <Card key={c.id}>
                  <CardContent className="space-y-3 p-4">
                    <div>
                      <div className="font-display text-sm font-bold text-foreground">
                        {c.projectName || c.title}
                      </div>
                      <div className="mt-1 font-mono text-[10px] text-meta">
                        {Object.keys(c.files).length} file
                        {Object.keys(c.files).length !== 1 ? "s" : ""} · updated{" "}
                        {relativeTime(c.updatedAt)}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => openInBuilder(c.id)}>
                        <MessageSquare className="h-3.5 w-3.5" /> Open
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadZip(c.files, c.projectName)}
                      >
                        <Download className="h-3.5 w-3.5" /> ZIP
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate({ to: "/scaffolder" })}
                      >
                        <PackagePlus className="h-3.5 w-3.5" /> Deliver
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (window.confirm(`Delete "${c.projectName || c.title}"?`)) remove(c.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {drafts.length > 0 && (
          <section>
            <h2 className="mb-3 font-mono text-[11px] uppercase tracking-widest text-meta">
              Drafts ({drafts.length})
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {drafts.map((c) => (
                <Card key={c.id} className="border-dashed">
                  <CardContent className="space-y-3 p-4">
                    <div>
                      <div className="font-display text-sm font-bold text-foreground">
                        {c.title}
                      </div>
                      <div className="mt-1 font-mono text-[10px] text-meta">
                        Nothing applied yet · updated {relativeTime(c.updatedAt)}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => openInBuilder(c.id)}>
                        <MessageSquare className="h-3.5 w-3.5" /> Continue
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (window.confirm(`Delete "${c.title}"?`)) remove(c.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
