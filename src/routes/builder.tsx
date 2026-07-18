import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, MessageSquare } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/shared/CodeBlock";
import { AgentChatPanel } from "@/components/studio/builder/AgentChatPanel";
import { AiSettingsPanel } from "@/components/studio/builder/AiSettingsPanel";
import { BuilderFileList } from "@/components/studio/builder/BuilderFileList";
import { ConversationList } from "@/components/studio/builder/ConversationList";
import { DeployContractPanel } from "@/components/studio/builder/DeployContractPanel";
import { FileDiffPreview } from "@/components/studio/builder/FileDiffPreview";
import { LivePreview } from "@/components/studio/builder/LivePreview";
import { ResultPanel } from "@/components/studio/scaffolder/ResultPanel";
import { useAppAgent } from "@/hooks/useAppAgent";
import { useAiSettings, useAiServerStatus } from "@/lib/ai-settings";
import { useConversations, DEFAULT_PROJECT_NAME } from "@/lib/studio-ai/conversations";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/builder")({
  head: () => ({ meta: [{ title: "AI Builder — CRUZ" }] }),
  component: BuilderPage,
});

function langFor(path: string): string {
  if (path.endsWith(".sol")) return "solidity";
  if (path.endsWith(".tsx") || path.endsWith(".ts")) return "typescript";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".html")) return "html";
  return "text";
}

function BuilderPage() {
  const conversations = useConversations((s) => s.conversations);
  const activeId = useConversations((s) => s.activeId);
  const createConversation = useConversations((s) => s.create);
  const selectConversation = useConversations((s) => s.select);
  const updateConversation = useConversations((s) => s.update);

  // Bootstrap: if there's genuinely nothing yet (first-ever visit), start
  // one conversation automatically rather than showing an empty state with
  // no way to type anything.
  useEffect(() => {
    if (conversations.length === 0) createConversation(DEFAULT_PROJECT_NAME);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const conversation = conversations.find((c) => c.id === activeId) ?? null;
  const projectName = conversation?.projectName ?? DEFAULT_PROJECT_NAME;
  const setProjectName = (name: string) => {
    if (activeId) updateConversation(activeId, { projectName: name });
  };

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [conversationsOpen, setConversationsOpen] = useState(false);
  const [rightTab, setRightTab] = useState<"files" | "preview">("files");
  const [activePath, setActivePath] = useState<string | null>(null);
  const [securityAcknowledged, setSecurityAcknowledged] = useState(false);

  const agent = useAppAgent(activeId, { projectName });

  // Auto-apply the agent's suggested name (see agentPrompt.ts's
  // SUGGESTED_NAME line) only while the user hasn't already picked one —
  // never overwrites a name they set themselves.
  useEffect(() => {
    if (agent.suggestedName && projectName === DEFAULT_PROJECT_NAME) {
      setProjectName(agent.suggestedName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.suggestedName]);

  // Reactive (not the plain isAiConfigured() snapshot) so the page updates
  // once the one-time /api/ai status check resolves, including self-healing
  // a stuck "use server" toggle if the server turns out not to be configured.
  const aiSettings = useAiSettings();
  const serverStatus = useAiServerStatus();
  const configured = aiSettings.proxy
    ? serverStatus.configured
    : !!aiSettings.keys[aiSettings.provider];

  const hasApplied = Object.keys(agent.files).length > 0;
  const displayFiles =
    agent.running && Object.keys(agent.streamingFiles).length > 0
      ? { ...agent.files, ...agent.streamingFiles }
      : (agent.pendingFiles ?? agent.files);

  const securityFindings = agent.pendingFindings.filter((f) => f.securityRelevant);
  const needsSecurityReview = securityFindings.length > 0 && !securityAcknowledged;

  // Reset the acknowledgment whenever a new pending diff arrives — approving
  // one turn's new dependency shouldn't silently carry over to the next.
  useEffect(() => {
    setSecurityAcknowledged(false);
  }, [agent.pendingFiles]);

  return (
    <div>
      <PageHeader
        breadcrumb={["CRUZ", "AI Builder"]}
        title="AI Builder"
        subtitle="Describe an app and an AI agent builds it — live file tree, diff review, and a real sandboxed preview, before anything ships."
      />
      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <Label className="font-mono text-xs">Project name</Label>
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              disabled={agent.running || hasApplied}
              className="mt-1 font-mono text-xs"
            />
          </div>
          <Button variant="outline" onClick={() => setConversationsOpen((o) => !o)}>
            <MessageSquare className="h-3.5 w-3.5" /> Conversations
          </Button>
          <Button variant="outline" onClick={() => setSettingsOpen((o) => !o)}>
            AI settings
          </Button>
          {hasApplied && (
            <Button variant="outline" onClick={agent.reset}>
              Start over
            </Button>
          )}
        </div>

        {conversationsOpen && (
          <ConversationList
            activeId={activeId}
            onSelect={(id) => {
              selectConversation(id);
              setConversationsOpen(false);
              setActivePath(null);
            }}
            onCreate={() => {
              const id = createConversation(DEFAULT_PROJECT_NAME);
              selectConversation(id);
              setConversationsOpen(false);
              setActivePath(null);
            }}
          />
        )}

        {settingsOpen && <AiSettingsPanel />}

        <div className="grid gap-4 lg:grid-cols-2" style={{ height: "70vh" }}>
          {/* Chat */}
          <div className="flex flex-col overflow-hidden rounded-sm border border-border bg-surface">
            <AgentChatPanel
              timeline={agent.timeline}
              running={agent.running}
              onSend={(prompt, inspirationUrl) =>
                agent.run(prompt, inspirationUrl ? { inspirationUrl } : undefined)
              }
              onStop={agent.stop}
              disabled={!configured}
              disabledReason={
                !configured
                  ? "Set an AI provider + key (or CRUZ's default AI) in AI settings above to start building."
                  : undefined
              }
            />
          </div>

          {/* Files / Preview */}
          <div className="flex flex-col overflow-hidden rounded-sm border border-border bg-surface">
            <div className="flex border-b border-border">
              <button
                onClick={() => setRightTab("files")}
                className={cn(
                  "flex-1 border-b-2 px-3 py-2 font-mono text-xs",
                  rightTab === "files"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                Files
              </button>
              <button
                onClick={() => setRightTab("preview")}
                className={cn(
                  "flex-1 border-b-2 px-3 py-2 font-mono text-xs",
                  rightTab === "preview"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                Preview
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              {rightTab === "files" ? (
                <div className="flex h-full">
                  <div className="w-[180px] shrink-0 overflow-y-auto border-r border-border">
                    <BuilderFileList
                      files={displayFiles}
                      activePath={activePath}
                      onSelect={setActivePath}
                    />
                  </div>
                  <div className="flex-1 overflow-y-auto p-2">
                    {activePath && displayFiles[activePath] !== undefined ? (
                      <CodeBlock
                        code={displayFiles[activePath]}
                        language={langFor(activePath)}
                        maxHeight="100%"
                      />
                    ) : (
                      <p className="p-3 font-mono text-xs text-meta">Select a file to view it.</p>
                    )}
                  </div>
                </div>
              ) : (
                <LivePreview files={displayFiles} />
              )}
            </div>
          </div>
        </div>

        {agent.error && (
          <div className="rounded-sm border border-destructive/40 bg-destructive/5 p-3 font-mono text-xs text-destructive">
            {agent.error}
          </div>
        )}

        {agent.pendingFiles && (
          <div className="space-y-3 rounded-sm border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <div className="font-mono text-xs uppercase tracking-wider text-meta">
                Review changes
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={agent.discardPending}>
                  Discard
                </Button>
                <Button onClick={agent.apply} disabled={needsSecurityReview}>
                  Apply
                </Button>
              </div>
            </div>

            {securityFindings.length > 0 && (
              <div className="space-y-2 rounded-sm border border-warning/40 bg-warning/5 p-3">
                <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-warning">
                  <AlertTriangle className="h-3.5 w-3.5" /> Needs your review
                </div>
                <ul className="space-y-1 font-mono text-[11px] text-muted-foreground">
                  {securityFindings.map((f, i) => (
                    <li key={i}>
                      <span className="text-foreground">{f.path}</span> — {f.message}
                    </li>
                  ))}
                </ul>
                <label className="flex cursor-pointer items-center gap-2 pt-1 font-mono text-[11px] text-foreground">
                  <input
                    type="checkbox"
                    checked={securityAcknowledged}
                    onChange={(e) => setSecurityAcknowledged(e.target.checked)}
                    className="h-3 w-3"
                  />
                  I&apos;ve reviewed the above and want to proceed
                </label>
              </div>
            )}

            <FileDiffPreview before={agent.files} after={agent.pendingFiles} />
          </div>
        )}

        {hasApplied && !agent.pendingFiles && (
          <>
            <DeployContractPanel files={agent.files} />
            <ResultPanel files={agent.files} projectName={projectName} />
          </>
        )}
      </div>
    </div>
  );
}
