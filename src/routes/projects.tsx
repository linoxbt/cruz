import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  Download,
  ExternalLink,
  FileCode2,
  Github,
  History,
  Loader2,
  MessageSquare,
  PackagePlus,
  Trash2,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useConversations, type Conversation } from "@/lib/studio-ai/conversations";
import { useMyActivity } from "@/lib/studio/myActivity";
import { truncateAddress } from "@/lib/wallet";
import { downloadZip } from "@/lib/zip";
import { bundleForPreview } from "@/lib/studio-ai/livePreviewBundler";
import { checkDependencyVersions } from "@/lib/api/registry.functions";
import { formatElapsed } from "@/components/studio/builder/BuildSummaryCard";

export const Route = createFileRoute("/projects")({
  head: () => ({ meta: [{ title: "My Projects | CRUZ" }] }),
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

async function runHealthCheck(c: Conversation) {
  let ok = true;
  let message = "Bundled successfully.";
  try {
    await bundleForPreview(c.files, "src/main.tsx");
  } catch (e) {
    ok = false;
    message = e instanceof Error ? e.message : "Bundling failed.";
  }

  let outdatedDeps: string[] = [];
  try {
    const pkg = JSON.parse(c.files["package.json"] ?? "{}") as {
      dependencies?: Record<string, string>;
    };
    if (pkg.dependencies) {
      const res = await checkDependencyVersions({ data: { dependencies: pkg.dependencies } });
      outdatedDeps = res.outdatedDeps;
    }
  } catch {
    /* package.json missing/invalid — skip the dependency check, bundle result still stands */
  }

  return { checkedAt: Date.now(), ok, message, outdatedDeps };
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
  const update = useConversations((s) => s.update);

  const deployedContracts = useMyActivity((s) => s.deployedContracts);
  const deliveredRepos = useMyActivity((s) => s.deliveredRepos);

  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);

  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
  const built = sorted.filter((c) => Object.keys(c.files).length > 0);
  const drafts = sorted.filter((c) => Object.keys(c.files).length === 0);

  const withTiming = built.filter((c) => c.metrics.startedAt && c.metrics.finishedAt);
  const avgBuildMs =
    withTiming.length > 0
      ? withTiming.reduce((sum, c) => sum + (c.metrics.finishedAt! - c.metrics.startedAt!), 0) /
        withTiming.length
      : null;

  const openInBuilder = (id: string) => {
    select(id);
    navigate({ to: "/builder" });
  };

  const checkHealth = async (c: Conversation) => {
    setCheckingId(c.id);
    const result = await runHealthCheck(c);
    update(c.id, { lastHealthCheck: result });
    setCheckingId(null);
  };

  return (
    <div>
      <PageHeader
        breadcrumb={["CRUZ", "My Projects"]}
        title="My Projects"
        subtitle="Every app, contract, and repo you've built or shipped through CRUZ."
      />
      <div className="space-y-8 p-6">
        {conversations.length === 0 &&
          deployedContracts.length === 0 &&
          deliveredRepos.length === 0 && (
            <div className="rounded-sm border border-dashed border-border bg-surface p-10 text-center">
              <Bot className="mx-auto h-6 w-6 text-meta" />
              <p className="mt-2 font-mono text-xs text-muted-foreground">
                Nothing here yet. Build an app, deploy a contract, or push a repo to see it show up.
              </p>
              <Button className="mt-3" onClick={() => navigate({ to: "/builder" })}>
                Go to AI Builder
              </Button>
            </div>
          )}

        {avgBuildMs !== null && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-sm border border-border bg-surface p-4">
              <div className="font-mono text-[10px] uppercase tracking-wider text-meta">
                Avg. time to first build
              </div>
              <div className="mt-1 font-display text-lg font-bold text-foreground">
                {formatElapsed(avgBuildMs)}
              </div>
            </div>
            <div className="rounded-sm border border-border bg-surface p-4">
              <div className="font-mono text-[10px] uppercase tracking-wider text-meta">
                Built projects
              </div>
              <div className="mt-1 font-display text-lg font-bold text-foreground">
                {built.length}
              </div>
            </div>
            <div className="rounded-sm border border-border bg-surface p-4">
              <div className="font-mono text-[10px] uppercase tracking-wider text-meta">
                Total fix iterations
              </div>
              <div className="mt-1 font-display text-lg font-bold text-foreground">
                {built.reduce((sum, c) => sum + c.metrics.iterations, 0)}
              </div>
            </div>
          </div>
        )}

        {built.length > 0 && (
          <section>
            <h2 className="mb-3 font-mono text-[11px] uppercase tracking-widest text-meta">
              Built ({built.length})
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {built.map((c) => (
                <div key={c.id} className="rounded-sm border border-border bg-surface p-4">
                  <div className="space-y-3">
                    <div>
                      <div className="font-display text-sm font-bold text-foreground">
                        {c.projectName || c.title}
                      </div>
                      <div className="mt-1 font-mono text-[10px] text-meta">
                        {Object.keys(c.files).length} file
                        {Object.keys(c.files).length !== 1 ? "s" : ""} · updated{" "}
                        {relativeTime(c.updatedAt)}
                      </div>
                      {c.lastHealthCheck && (
                        <div
                          className={`mt-2 flex items-start gap-1.5 font-mono text-[10px] ${
                            c.lastHealthCheck.ok ? "text-success" : "text-destructive"
                          }`}
                        >
                          {c.lastHealthCheck.ok ? (
                            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
                          ) : (
                            <XCircle className="mt-0.5 h-3 w-3 shrink-0" />
                          )}
                          <span>
                            {c.lastHealthCheck.message} · checked{" "}
                            {relativeTime(c.lastHealthCheck.checkedAt)}
                            {c.lastHealthCheck.outdatedDeps.length > 0 && (
                              <span className="block text-warning">
                                {c.lastHealthCheck.outdatedDeps.length} dependency version(s)
                                behind: {c.lastHealthCheck.outdatedDeps.join(", ")}
                              </span>
                            )}
                          </span>
                        </div>
                      )}
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
                        onClick={() => void checkHealth(c)}
                        disabled={checkingId === c.id}
                      >
                        {checkingId === c.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        Check health
                      </Button>
                      {c.changelog.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setHistoryOpenId((id) => (id === c.id ? null : c.id))}
                        >
                          <History className="h-3.5 w-3.5" /> History ({c.changelog.length})
                          <ChevronDown
                            className={`h-3 w-3 transition-transform ${historyOpenId === c.id ? "rotate-180" : ""}`}
                          />
                        </Button>
                      )}
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
                    {historyOpenId === c.id && (
                      <ul className="space-y-1.5 border-t border-border pt-2">
                        {c.changelog.map((entry) => (
                          <li
                            key={entry.id}
                            className="font-mono text-[10px] text-muted-foreground"
                          >
                            <span className="text-meta">{relativeTime(entry.timestamp)}:</span>{" "}
                            {entry.summary}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
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
                <div
                  key={c.id}
                  className="rounded-sm border border-dashed border-border bg-surface p-4"
                >
                  <div className="space-y-3">
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
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {deployedContracts.length > 0 && (
          <section>
            <h2 className="mb-3 font-mono text-[11px] uppercase tracking-widest text-meta">
              Deployed Contracts ({deployedContracts.length})
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {deployedContracts.map((d) => (
                <div key={d.id} className="rounded-sm border border-border bg-surface p-4">
                  <div className="flex items-center gap-2 font-display text-sm font-bold text-foreground">
                    <FileCode2 className="h-4 w-4 text-primary" /> {d.name}
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-meta">
                    Deployed {relativeTime(d.deployedAt)}
                  </div>
                  <a
                    href={`/explorer/address/${d.address}`}
                    className="mt-3 flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                  >
                    {truncateAddress(d.address)} <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              ))}
            </div>
          </section>
        )}

        {deliveredRepos.length > 0 && (
          <section>
            <h2 className="mb-3 font-mono text-[11px] uppercase tracking-widest text-meta">
              Delivered Repos ({deliveredRepos.length})
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {deliveredRepos.map((r) => (
                <div key={r.id} className="rounded-sm border border-border bg-surface p-4">
                  <div className="flex items-center gap-2 font-display text-sm font-bold text-foreground">
                    <Github className="h-4 w-4 text-primary" /> {r.repoName}
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-meta">
                    Pushed {relativeTime(r.deliveredAt)}
                  </div>
                  <a
                    href={r.repoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                  >
                    View on GitHub <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
