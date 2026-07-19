import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  RotateCcw,
  Settings,
} from "lucide-react";
import { usePanelRef, type PanelImperativeHandle } from "react-resizable-panels";
import { downloadZip } from "@/lib/zip";
import { PageHeader } from "@/components/shared/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/shared/CodeBlock";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { AgentChatPanel } from "@/components/studio/builder/AgentChatPanel";
import { AiSettingsPanel } from "@/components/studio/builder/AiSettingsPanel";
import { BuilderFileList } from "@/components/studio/builder/BuilderFileList";
import { BuildSummaryCard } from "@/components/studio/builder/BuildSummaryCard";
import { ConversationList } from "@/components/studio/builder/ConversationList";
import { DeployContractPanel } from "@/components/studio/builder/DeployContractPanel";
import { FileDiffPreview } from "@/components/studio/builder/FileDiffPreview";
import { LivePreview } from "@/components/studio/builder/LivePreview";
import { ModePicker } from "@/components/studio/builder/ModePicker";
import { ResultPanel } from "@/components/studio/scaffolder/ResultPanel";
import { useAppAgent } from "@/hooks/useAppAgent";
import { useAiSettings, useAiServerStatus } from "@/lib/ai-settings";
import {
  useConversations,
  DEFAULT_PROJECT_NAME,
  type BuildMode,
} from "@/lib/studio-ai/conversations";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/builder")({
  head: () => ({ meta: [{ title: "AI Builder | CRUZ" }] }),
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

  // Starting a build always asks Auto vs Manual first (see ModePicker) —
  // shown in place of the main content whenever there's nothing to resume
  // yet, whether that's the very first visit or an explicit "+ New".
  const [showModePicker, setShowModePicker] = useState(conversations.length === 0);
  const startNew = (mode: BuildMode) => {
    const id = createConversation(DEFAULT_PROJECT_NAME, mode);
    selectConversation(id);
    setShowModePicker(false);
    setConversationsOpen(false);
    setActivePath(null);
  };

  const conversation = conversations.find((c) => c.id === activeId) ?? null;
  const projectName = conversation?.projectName ?? DEFAULT_PROJECT_NAME;
  const setProjectName = (name: string) => {
    if (activeId) updateConversation(activeId, { projectName: name });
  };

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [conversationsOpen, setConversationsOpen] = useState(false);
  const [rightTab, setRightTab] = useState<"files" | "preview" | "history">("files");
  const [activePath, setActivePath] = useState<string | null>(null);
  const [securityAcknowledged, setSecurityAcknowledged] = useState(false);

  const agent = useAppAgent(activeId, { projectName });

  const filesPanelRef = usePanelRef();
  const [filesCollapsed, setFilesCollapsed] = useState(false);
  const toggleFilesPanel = () => {
    const handle = filesPanelRef.current as PanelImperativeHandle | null;
    if (!handle) return;
    if (handle.isCollapsed()) handle.expand();
    else handle.collapse();
  };

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
  const awaitingPlanApproval = agent.awaitingApproval?.kind === "plan";

  // Reset the acknowledgment whenever a new pending diff arrives — approving
  // one turn's new dependency shouldn't silently carry over to the next.
  useEffect(() => {
    setSecurityAcknowledged(false);
  }, [agent.pendingFiles]);

  if (showModePicker || !conversation) {
    return (
      <div>
        <PageHeader
          breadcrumb={["CRUZ", "AI Builder"]}
          title="AI Builder"
          subtitle="Describe an app and an AI agent builds it: live file tree, diff review, and a real sandboxed preview, before anything ships."
        />
        <div className="space-y-4 p-6">
          {conversations.length > 0 && (
            <ConversationList
              activeId={activeId}
              onSelect={(id) => {
                selectConversation(id);
                setShowModePicker(false);
                setActivePath(null);
              }}
              onCreate={() => setShowModePicker(true)}
            />
          )}
          <ModePicker onChoose={startNew} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        breadcrumb={["CRUZ", "AI Builder"]}
        title="AI Builder"
        subtitle="Describe an app and an AI agent builds it: live file tree, diff review, and a real sandboxed preview, before anything ships."
      />
      <div className="space-y-4 p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3">
          <div className="w-full sm:min-w-[200px] sm:flex-1">
            <Label className="font-mono text-xs">Project name</Label>
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              disabled={agent.running || hasApplied}
              className="mt-1 font-mono text-xs"
            />
          </div>
          {/* Icon-only below sm so a long label (esp. "Conversations") can
              never overflow onto/over the project name field on narrow
              screens — labels come back once there's room for them. */}
          <div className="flex flex-wrap gap-2">
            <span
              className={cn(
                "flex items-center rounded-sm border px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider",
                conversation.mode === "auto"
                  ? "border-primary/40 text-primary"
                  : "border-border text-meta",
              )}
              title="Build mode (set when this conversation was created)"
            >
              {conversation.mode}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConversationsOpen((o) => !o)}
              aria-label="Conversations"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Conversations</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSettingsOpen((o) => !o)}
              aria-label="AI settings"
            >
              <Settings className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">AI settings</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadZip(displayFiles, projectName)}
              disabled={Object.keys(displayFiles).length === 0}
              aria-label="Download ZIP"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Download ZIP</span>
            </Button>
            {hasApplied && (
              <Button variant="outline" size="sm" onClick={agent.reset} aria-label="Start over">
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Start over</span>
              </Button>
            )}
          </div>
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
              setConversationsOpen(false);
              setShowModePicker(true);
            }}
          />
        )}

        {settingsOpen && <AiSettingsPanel />}

        {awaitingPlanApproval && (
          <div className="space-y-2 rounded-sm border border-primary/40 bg-primary/5 p-4">
            <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-primary">
              <CheckCircle2 className="h-3.5 w-3.5" /> Manual mode: review the plan above
            </div>
            <p className="font-mono text-[11px] text-muted-foreground">
              {agent.awaitingApproval?.detail} No files have been written or checked yet.
            </p>
            <Button onClick={agent.approvePlan}>Approve &amp; continue</Button>
          </div>
        )}

        <div style={{ height: "70vh" }}>
          <ResizablePanelGroup orientation="horizontal" className="gap-2">
            <ResizablePanel defaultSize={45} minSize={25}>
              <div className="flex h-full flex-col overflow-hidden rounded-sm border border-border bg-surface">
                <AgentChatPanel
                  timeline={agent.timeline}
                  running={agent.running}
                  onSend={(prompt, inspirationUrl) =>
                    agent.run(prompt, inspirationUrl ? { inspirationUrl } : undefined)
                  }
                  onStop={agent.stop}
                  disabled={!configured || awaitingPlanApproval}
                  disabledReason={
                    !configured
                      ? "Set an AI provider + key (or CRUZ's default AI) in AI settings above to start building."
                      : awaitingPlanApproval
                        ? "Approve the plan above before continuing."
                        : undefined
                  }
                />
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel
              panelRef={filesPanelRef}
              defaultSize={55}
              minSize={0}
              collapsible
              collapsedSize={0}
              onResize={() => setFilesCollapsed(!!filesPanelRef.current?.isCollapsed())}
            >
              <div className="flex h-full flex-col overflow-hidden rounded-sm border border-border bg-surface">
                <div className="flex items-center border-b border-border">
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
                  <button
                    onClick={() => setRightTab("history")}
                    className={cn(
                      "flex-1 border-b-2 px-3 py-2 font-mono text-xs",
                      rightTab === "history"
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    History
                  </button>
                  <button
                    onClick={toggleFilesPanel}
                    className="border-l border-border px-2 py-2 text-meta hover:text-foreground"
                    title={filesCollapsed ? "Expand" : "Collapse"}
                  >
                    {filesCollapsed ? (
                      <PanelRightOpen className="h-3.5 w-3.5" />
                    ) : (
                      <PanelRightClose className="h-3.5 w-3.5" />
                    )}
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
                          <p className="p-3 font-mono text-xs text-meta">
                            Select a file to view it.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : rightTab === "preview" ? (
                    <LivePreview files={displayFiles} />
                  ) : (
                    <div className="h-full overflow-y-auto p-3">
                      {agent.changelog.length === 0 ? (
                        <p className="font-mono text-xs text-meta">
                          Nothing applied yet. History fills in after your first Apply.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {agent.changelog.map((entry) => (
                            <li
                              key={entry.id}
                              className="rounded-sm border border-border bg-background p-2.5 font-mono text-[11px]"
                            >
                              <div className="text-meta">
                                {new Date(entry.timestamp).toLocaleString()}
                              </div>
                              <div className="mt-1 text-foreground">{entry.summary}</div>
                              <div className="mt-1 truncate text-meta">
                                {entry.filesChanged.join(", ")}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>

        {/* Collapsed files/preview leaves a quick way back in, since the
            panel itself is 0-width and its own toggle button goes with it. */}
        {filesCollapsed && (
          <button
            onClick={toggleFilesPanel}
            className="flex items-center gap-1 font-mono text-[11px] text-meta hover:text-foreground"
          >
            <PanelRightOpen className="h-3 w-3" /> Show files/preview
          </button>
        )}

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
                      <span className="text-foreground">{f.path}</span>: {f.message}
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
            {agent.metrics && <BuildSummaryCard metrics={agent.metrics} />}
            <DeployContractPanel files={agent.files} />
            <ResultPanel files={agent.files} projectName={projectName} />
          </>
        )}
      </div>
    </div>
  );
}
