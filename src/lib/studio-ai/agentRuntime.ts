import { create } from "zustand";
import { chatStream, type ChatMessage } from "@/lib/ai";
import { buildAgentSystemPrompt } from "@/lib/studio-ai/agentPrompt";
import {
  parseFileMap,
  extractPlan,
  extractClosingNote,
  extractSuggestedName,
  extractConversationalReply,
  extractMcpCall,
  type McpCallRequest,
} from "@/lib/studio-ai/parseFileMap";
import { listMcpTools, callMcpTool } from "@/lib/api/mcp.functions";
import { runStructuralChecks, type StructuralFinding } from "@/lib/studio-ai/structuralCheck";
import { enforceProtectedFiles } from "@/lib/studio-ai/protectedFiles";
import { bundleForPreview } from "@/lib/studio-ai/livePreviewBundler";
import { diffLines, diffStats } from "@/lib/diff";
import {
  useConversations,
  DEFAULT_PROJECT_NAME,
  defaultSteps,
  defaultMetrics,
  type TimelineItem,
  type ToolStep,
  type ToolStepKind,
  type BuildStep,
  type BuildStepKind,
  type ChangelogEntry,
  type Conversation,
} from "@/lib/studio-ai/conversations";
import { fetchUrlForInspiration } from "@/lib/api/inspect.functions";
import type { UaInitConfig } from "@/lib/studio-templates/universalAccountInit";

// The AI Builder's generation engine, keyed by conversation id and living at
// module scope (a Zustand store, same pattern as conversations.ts/
// ai-settings.ts) rather than inside a React hook tied to the /builder
// route's mount lifecycle. That distinction is the whole point: a fetch
// started by useAppAgent's old per-mount useState-based loop kept running
// after the component unmounted, but every state update it made
// (setStreamingFiles/setPendingFiles/etc.) was thrown away since it belonged
// to a now-discarded hook instance — navigating away from /builder mid-turn
// silently lost that turn's entire result. Living here instead, `run()`
// keeps going and keeps persisting to `conversations.ts` regardless of which
// route (or no route) is currently mounted; useAppAgent.ts is now a thin
// selector over this store plus the conversation's own persisted state.
//
// The turn loop below now also drives a persistent task list
// (Conversation.steps — spec/scaffold/implement/test/deploy/monitor) and, in
// "manual" mode, pauses once the plan is visible so the user approves before
// any files get validated/finalized — see generateAndCheck()'s
// `allowPlanPause` for exactly where that happens.
const MAX_FIX_ATTEMPTS = 5;
const MAX_TURNS = 8;
// Caps how many MCP tool round-trips a single generateAndCheck() call can
// make (see mcp.functions.ts) — prevents a misbehaving/looping model from
// burning turns on tool calls indefinitely. Irrelevant when no MCP servers
// are configured (mcpTools is empty, the check is never even reached).
const MAX_MCP_CALLS = 5;
const BUNDLE_ENTRY = "src/main.tsx";

export interface AgentRunState {
  running: boolean;
  streamingFiles: Record<string, string>;
  pendingFiles: Record<string, string> | null;
  pendingFindings: StructuralFinding[];
  error: string | null;
  suggestedName: string | null;
}

export const EMPTY_RUN: AgentRunState = {
  running: false,
  streamingFiles: {},
  pendingFiles: null,
  pendingFindings: [],
  error: null,
  suggestedName: null,
};

// Per-conversation working state that has no business being in Zustand (an
// in-flight message buffer and an AbortController aren't serializable/
// reactive data) — a plain module-level map keyed the same way, so it
// survives exactly as long as the store does (the page's lifetime).
interface Internal {
  messages: ChatMessage[];
  stopFlag: boolean;
  abort: AbortController | null;
}
const internals = new Map<string, Internal>();
function getInternal(id: string): Internal {
  let i = internals.get(id);
  if (!i) {
    i = { messages: [], stopFlag: false, abort: null };
    internals.set(id, i);
  }
  return i;
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getConv(id: string): Conversation | undefined {
  return useConversations.getState().conversations.find((c) => c.id === id);
}

interface AgentRuntimeStore {
  runs: Record<string, AgentRunState>;
  run: (
    conversationId: string,
    cfg: UaInitConfig,
    prompt: string,
    opts?: { inspirationUrl?: string },
  ) => Promise<void>;
  /** Manual mode's post-spec pause: continue past the plan and let the
   *  files it already drafted get validated/finalized. */
  approvePlan: (conversationId: string, cfg: UaInitConfig) => Promise<void>;
  /** Resumes after an internal safety cap (MAX_TURNS/MAX_FIX_ATTEMPTS) was
   *  hit — a one-click continuation, not a fresh prompt, so a genuinely
   *  large build doesn't dead-end just because it needed more iterations
   *  than the cap allows in one call. */
  continueBuilding: (conversationId: string, cfg: UaInitConfig) => Promise<void>;
  stop: (conversationId: string) => void;
  apply: (conversationId: string) => void;
  discardPending: (conversationId: string) => void;
  reset: (conversationId: string) => void;
}

export const useAgentRuntime = create<AgentRuntimeStore>((set, get) => {
  function patchRun(id: string, patch: Partial<AgentRunState>) {
    set((s) => ({ runs: { ...s.runs, [id]: { ...(s.runs[id] ?? EMPTY_RUN), ...patch } } }));
  }

  function currentTimeline(id: string): TimelineItem[] {
    return getConv(id)?.timeline ?? [];
  }

  function pushTimeline(id: string, item: TimelineItem) {
    useConversations.getState().update(id, { timeline: [...currentTimeline(id), item] });
  }

  function updateLastTool(id: string, patch: Partial<ToolStep>) {
    const next = [...currentTimeline(id)];
    for (let i = next.length - 1; i >= 0; i--) {
      const t = next[i].tool;
      if (t) {
        next[i] = { ...next[i], tool: { ...t, ...patch } };
        break;
      }
    }
    useConversations.getState().update(id, { timeline: next });
  }

  // Same idea as updateLastTool, but scoped to a specific kind — used by
  // finishStep/failStep below so a build-step's completion updates ITS OWN
  // row even if other tool rows (generate/structural-check) were pushed
  // after it began. Returns false if no matching row exists yet, so the
  // caller can push one instead (defensive — shouldn't normally happen
  // since beginStep always pushes first).
  function updateLastToolOfKind(id: string, kind: ToolStepKind, patch: Partial<ToolStep>): boolean {
    const next = [...currentTimeline(id)];
    for (let i = next.length - 1; i >= 0; i--) {
      const t = next[i].tool;
      if (t && t.kind === kind) {
        next[i] = { ...next[i], tool: { ...t, ...patch } };
        useConversations.getState().update(id, { timeline: next });
        return true;
      }
    }
    return false;
  }

  // Task-list step tracking (Conversation.steps) drives BuildSummaryCard's
  // metrics and the Projects-page aggregate stats — that data model still
  // exists. But how a step transition is *shown* is the same inline,
  // play-by-play timeline log used for every other tool-step row (no
  // separate checklist panel) — beginStep/finishStep/failStep below update
  // both in one call.
  function patchStep(
    id: string,
    kind: BuildStepKind,
    patch: Partial<BuildStep> | ((s: BuildStep) => Partial<BuildStep>),
  ) {
    const conv = getConv(id);
    if (!conv) return;
    const steps = conv.steps.map((s) => {
      if (s.kind !== kind) return s;
      const p = typeof patch === "function" ? patch(s) : patch;
      return { ...s, ...p };
    });
    useConversations.getState().update(id, { steps });
  }
  const beginStep = (id: string, kind: BuildStepKind, detail?: string) => {
    patchStep(id, kind, { status: "in_progress", detail, startedAt: Date.now() });
    pushTimeline(id, { role: "tool", tool: { kind, status: "running", detail } });
  };
  const finishStep = (id: string, kind: BuildStepKind, detail?: string) => {
    patchStep(id, kind, { status: "done", detail, finishedAt: Date.now() });
    if (!updateLastToolOfKind(id, kind, { status: "done", detail })) {
      pushTimeline(id, { role: "tool", tool: { kind, status: "done", detail } });
    }
  };
  const failStep = (id: string, kind: BuildStepKind, detail?: string) => {
    patchStep(id, kind, (s) => ({ status: "failed", detail, attempts: (s.attempts ?? 0) + 1 }));
    if (!updateLastToolOfKind(id, kind, { status: "error", detail })) {
      pushTimeline(id, { role: "tool", tool: { kind, status: "error", detail } });
    }
  };

  function patchMetrics(
    id: string,
    patch:
      | Partial<Conversation["metrics"]>
      | ((m: Conversation["metrics"]) => Partial<Conversation["metrics"]>),
  ) {
    const conv = getConv(id);
    if (!conv) return;
    const p = typeof patch === "function" ? patch(conv.metrics) : patch;
    useConversations.getState().update(id, { metrics: { ...conv.metrics, ...p } });
  }

  /**
   * Runs the generate -> protected-file-check -> structural-check -> bundle-test
   * cycle, retrying only itself on failure (never re-running spec). Shared by
   * `run()` (a fresh user prompt) and `approvePlan()` (resuming after a
   * manual-mode plan pause) — the only difference between callers is whether
   * a pause-worthy plan should stop the very first turn.
   */
  async function generateAndCheck(
    conversationId: string,
    cfg: UaInitConfig,
    opts: { allowPlanPause: boolean },
  ) {
    const internal = getInternal(conversationId);
    const conv = getConv(conversationId);
    const mode = conv?.mode ?? "manual";
    const isFollowUp = Object.keys(conv?.files ?? {}).length > 0;
    const scaffoldKind: BuildStepKind = isFollowUp ? "implement" : "scaffold";

    let workingFiles = { ...(conv?.files ?? {}) };
    let sawError = false;

    // Populated once per call — empty (and free of any network round-trip
    // cost worth caring about) when MCP_SERVERS isn't configured, so the
    // rest of this function behaves identically to before this existed.
    let mcpTools: Awaited<ReturnType<typeof listMcpTools>>["tools"] = [];
    try {
      mcpTools = (await listMcpTools()).tools;
    } catch {
      /* MCP listing is best-effort — never block a normal build over it */
    }

    try {
      let turn = 0;
      let fixAttempts = 0;
      let mcpAttempts = 0;
      // True until the first REAL model response (one that isn't just an
      // MCP round-trip) completes — decoupled from `turn` so that one or
      // more tool calls preceding the actual plan don't consume the single
      // manual-mode pause opportunity that used to be tied to `turn === 1`.
      let firstRealTurn = true;

      while (turn < MAX_TURNS) {
        turn++;
        if (internal.stopFlag) break;

        if (turn === 1) beginStep(conversationId, "spec", "Analyzing the request…");
        beginStep(conversationId, scaffoldKind, "Writing files…");

        pushTimeline(conversationId, {
          role: "tool",
          tool: { kind: "generate", status: "running", detail: "Analyzing…" },
        });
        let full = "";
        let planPushed = false;
        let pausedForPlan = false;
        let pausedForMcp = false;
        let mcpRequest: McpCallRequest | null = null;
        const controller = new AbortController();
        internal.abort = controller;

        try {
          await chatStream({
            system: buildAgentSystemPrompt(mcpTools),
            messages: internal.messages,
            signal: controller.signal,
            onDelta: (delta) => {
              full += delta;
              const seen = [...full.matchAll(/###\s*FILE:\s*(\S+)/g)].map((m) => m[1]);
              const latest = seen[seen.length - 1];
              // The analysis/plan is only guaranteed complete once the model
              // has moved past it into file blocks — that's the signal to
              // surface it as its own checklist card, before files finish
              // streaming, matching how Claude Code/Codex show a plan up
              // front rather than after the fact. It's also the manual-mode
              // pause point: abort right here, before any file content is
              // trusted/validated, so "approve the plan" genuinely means
              // "before implementation," not "after."
              if (latest && !planPushed) {
                const plan = extractPlan(full);
                if (plan) {
                  pushTimeline(conversationId, { role: "assistant", plan });
                  planPushed = true;
                  if (opts.allowPlanPause && firstRealTurn && mode === "manual") {
                    pausedForPlan = true;
                    controller.abort();
                  }
                }
              }
              if (latest) updateLastTool(conversationId, { detail: `Writing ${latest}…` });

              // MCP tool-call detection (see agentPrompt.ts's "Tools
              // available this session") — only checked while at least one
              // server is actually configured, before any FILE marker (a
              // call belongs in the reasoning prefix, never interleaved
              // with file content), and under the per-generation cap.
              if (!pausedForMcp && !latest && mcpTools.length > 0 && mcpAttempts < MAX_MCP_CALLS) {
                const call = extractMcpCall(full);
                if (call) {
                  mcpRequest = call;
                  pausedForMcp = true;
                  controller.abort();
                }
              }

              patchRun(conversationId, { streamingFiles: parseFileMap(full) });
            },
          });
        } catch (e) {
          if (pausedForMcp && mcpRequest) {
            const req: McpCallRequest = mcpRequest;
            mcpAttempts++;
            // Trim anything that may have streamed in past the JSON close
            // before abort() actually took effect — the model never
            // "committed" to that trailing text, so it shouldn't end up in
            // its own message history.
            internal.messages.push({ role: "assistant", content: full.slice(0, req.endIndex) });
            pushTimeline(conversationId, {
              role: "tool",
              tool: { kind: "mcp-call", status: "running", detail: `${req.server}.${req.tool}` },
            });
            let resultText: string;
            try {
              const res = await callMcpTool({
                data: { server: req.server, tool: req.tool, args: req.args },
              });
              if (res.ok) {
                updateLastTool(conversationId, {
                  status: "done",
                  detail: `${req.server}.${req.tool}`,
                });
                resultText =
                  res.result.content
                    .map((c) => c.text ?? "")
                    .filter(Boolean)
                    .join("\n") || "(no output)";
              } else {
                updateLastTool(conversationId, { status: "error", detail: res.error });
                resultText = `Error: ${res.error}`;
              }
            } catch (mcpErr) {
              const msg = mcpErr instanceof Error ? mcpErr.message : "MCP call failed.";
              updateLastTool(conversationId, { status: "error", detail: msg });
              resultText = `Error: ${msg}`;
            }
            internal.messages.push({
              role: "user",
              content: `[MCP RESULT] ${req.server}.${req.tool} returned:\n${resultText}`,
            });
            continue;
          }
          if (pausedForPlan) {
            // Not a real failure — save the plan-only partial as this turn's
            // assistant message and pause for approval.
            internal.messages.push({ role: "assistant", content: full });
            useConversations.getState().update(conversationId, {
              awaitingApproval: {
                kind: "plan",
                detail: "Review the plan above, then continue.",
              },
              messages: internal.messages,
            });
            updateLastTool(conversationId, {
              status: "done",
              detail: "Plan ready, awaiting your approval.",
            });
            patchRun(conversationId, { running: false });
            return;
          }
          throw e;
        }

        internal.messages.push({ role: "assistant", content: full });
        firstRealTurn = false;

        const produced = parseFileMap(full);
        if (Object.keys(produced).length === 0) {
          if (!planPushed) {
            // Conversational turn, not a failure: the model decided this
            // message was a question/inquiry (see agentPrompt.ts's "is this
            // actually a build request?" branch) and answered in prose
            // instead of building anything. Undo the in_progress marks
            // beginStep set above (nothing was actually attempted) rather
            // than showing this as an error.
            updateLastTool(conversationId, { status: "done", detail: "Answered." });
            finishStep(conversationId, "spec", "Answered without changing the project.");
            patchStep(conversationId, scaffoldKind, {
              status: "pending",
              startedAt: undefined,
              detail: undefined,
            });
            const reply = extractConversationalReply(full);
            if (reply) pushTimeline(conversationId, { role: "assistant", content: reply });
            useConversations.getState().update(conversationId, { messages: internal.messages });
            patchRun(conversationId, { running: false });
            return;
          }
          updateLastTool(conversationId, { status: "error", detail: "No files were produced." });
          patchRun(conversationId, {
            error: "The agent didn't produce any files, try rephrasing your request.",
          });
          failStep(conversationId, scaffoldKind, "No files were produced.");
          sawError = true;
          break;
        }
        updateLastTool(conversationId, {
          status: "done",
          detail: `${Object.keys(produced).length} file(s) written.`,
        });
        finishStep(conversationId, "spec", "Analysis + plan ready.");

        // Fallback in case streaming ended before a FILE marker was ever
        // seen mid-flight (e.g. a very short response) — still show the
        // plan rather than lose it.
        if (!planPushed) {
          const plan = extractPlan(full);
          if (plan) pushTimeline(conversationId, { role: "assistant", plan });
        }

        const name = extractSuggestedName(full);
        if (name) patchRun(conversationId, { suggestedName: name });

        const note = extractClosingNote(full);
        if (note) pushTimeline(conversationId, { role: "assistant", content: note });

        workingFiles = { ...workingFiles, ...produced };

        pushTimeline(conversationId, {
          role: "tool",
          tool: { kind: "protected-file-check", status: "running" },
        });
        const { files: enforced, overwritten } = enforceProtectedFiles(workingFiles, cfg);
        workingFiles = enforced;
        updateLastTool(conversationId, {
          status: "done",
          detail: overwritten.length
            ? `Restored the protected Universal Account file (agent output for it was discarded).`
            : "Universal Account file untouched, good.",
        });

        pushTimeline(conversationId, {
          role: "tool",
          tool: { kind: "structural-check", status: "running" },
        });
        const findings = runStructuralChecks(workingFiles);
        const errors = findings.filter((f) => f.severity === "error");

        if (errors.length > 0) {
          updateLastTool(conversationId, {
            status: "error",
            detail: errors.map((e) => `${e.path}: ${e.message}`).join(" · "),
          });
          patchMetrics(conversationId, (m) => ({ errorsCaught: m.errorsCaught + errors.length }));
          fixAttempts++;
          patchMetrics(conversationId, (m) => ({ iterations: m.iterations + 1 }));
          if (fixAttempts >= MAX_FIX_ATTEMPTS) {
            const detail = `Hit the internal safety cap after ${MAX_FIX_ATTEMPTS} fix attempts (structural checks kept failing) — click Continue to keep going with what's been learned so far.`;
            patchRun(conversationId, {
              error: detail,
              pendingFiles: workingFiles,
              pendingFindings: findings,
            });
            useConversations
              .getState()
              .update(conversationId, { awaitingApproval: { kind: "limit", detail } });
            failStep(conversationId, scaffoldKind, "Structural checks kept failing.");
            sawError = true;
            break;
          }
          internal.messages.push({
            role: "user",
            content: `[STRUCTURAL CHECK RESULT] These files failed validation:\n${errors
              .map((e) => `- ${e.path}: ${e.message}`)
              .join(
                "\n",
              )}\n\nFix them and re-emit the corrected file(s) in full, using the same output protocol.`,
          });
          continue;
        }

        const securityCount = findings.filter((f) => f.securityRelevant).length;
        updateLastTool(conversationId, {
          status: "done",
          detail: findings.length
            ? `${findings.length} finding(s)${securityCount ? `, ${securityCount} need your review` : ""}.`
            : "Clean.",
        });

        // Real compile-ish signal: actually bundle the produced files with
        // esbuild-wasm (the same bundler LivePreview.tsx uses) rather than
        // just the regex-based structural check — a bundle failure means
        // something genuinely doesn't parse/transform, not just "looks
        // truncated." Treated exactly like a structural-check failure: feed
        // the error back and retry, same budget.
        beginStep(conversationId, "test", "Verifying it actually builds…");
        pushTimeline(conversationId, {
          role: "tool",
          tool: { kind: "structural-check", status: "running", detail: "Bundling to verify…" },
        });
        patchMetrics(conversationId, (m) => ({ testsRun: m.testsRun + 1 }));
        try {
          await bundleForPreview(workingFiles, BUNDLE_ENTRY);
          patchMetrics(conversationId, (m) => ({ testsPassed: m.testsPassed + 1 }));
          finishStep(conversationId, "test", "Bundled successfully.");
          updateLastTool(conversationId, { status: "done", detail: "Bundled successfully." });
        } catch (e) {
          const bundleError = e instanceof Error ? e.message : "Bundling failed.";
          updateLastTool(conversationId, { status: "error", detail: bundleError });
          fixAttempts++;
          patchMetrics(conversationId, (m) => ({ iterations: m.iterations + 1 }));
          if (fixAttempts >= MAX_FIX_ATTEMPTS) {
            const detail = `Hit the internal safety cap after ${MAX_FIX_ATTEMPTS} fix attempts — the bundle kept failing to build (${bundleError}). Click Continue to keep going with what's been learned so far.`;
            patchRun(conversationId, {
              error: detail,
              pendingFiles: workingFiles,
              pendingFindings: findings,
            });
            useConversations
              .getState()
              .update(conversationId, { awaitingApproval: { kind: "limit", detail } });
            failStep(conversationId, "test", bundleError);
            sawError = true;
            break;
          }
          failStep(conversationId, "test", bundleError);
          internal.messages.push({
            role: "user",
            content: `[BUILD CHECK RESULT] The project failed to bundle (a real compile-ish error, not just structural review):\n${bundleError}\n\nFix the underlying issue and re-emit the corrected file(s) in full, using the same output protocol.`,
          });
          continue;
        }

        finishStep(conversationId, scaffoldKind, `${Object.keys(produced).length} file(s).`);
        beginStep(conversationId, "deploy", "Ready, awaiting Apply.");
        patchMetrics(conversationId, (m) => ({ finishedAt: m.finishedAt ?? Date.now() }));
        patchRun(conversationId, { pendingFiles: workingFiles, pendingFindings: findings });
        pushTimeline(conversationId, {
          role: "assistant",
          content: "Ready, review the diff below and click Apply.",
        });
        useConversations.getState().update(conversationId, { messages: internal.messages });
        patchRun(conversationId, { running: false });
        return;
      }
      if (turn >= MAX_TURNS && !sawError) {
        const detail = `Hit the internal safety cap after ${MAX_TURNS} turns without a clean result — click Continue to keep going with what's been learned so far.`;
        patchRun(conversationId, { error: detail });
        useConversations
          .getState()
          .update(conversationId, { awaitingApproval: { kind: "limit", detail } });
      }
    } catch (e) {
      if (internal.stopFlag || (e instanceof DOMException && e.name === "AbortError")) {
        updateLastTool(conversationId, { status: "error", detail: "Stopped." });
      } else {
        const msg = e instanceof Error ? e.message : "Generation failed.";
        patchRun(conversationId, { error: msg });
        updateLastTool(conversationId, { status: "error", detail: msg });
      }
    } finally {
      useConversations.getState().update(conversationId, { messages: internal.messages });
      patchRun(conversationId, { running: false });
    }
  }

  return {
    runs: {},

    run: async (conversationId, cfg, prompt, opts) => {
      if ((get().runs[conversationId] ?? EMPTY_RUN).running) return;

      const internal = getInternal(conversationId);
      internal.stopFlag = false;

      const conv = getConv(conversationId);
      // Seed the in-memory turn buffer from what's persisted only the first
      // time this conversation runs since the page loaded (a fresh module
      // load / internals entry) — subsequent runs keep accumulating on the
      // same in-memory buffer, matching ordinary chat-history behavior.
      if (internal.messages.length === 0 && conv?.messages?.length) {
        internal.messages = [...conv.messages];
      }
      // A fresh prompt is an equally valid way to move past a stale "hit the
      // safety cap" banner as clicking Continue — don't leave it showing
      // once the user's chosen to just say what's next themselves.
      if (conv?.awaitingApproval?.kind === "limit") {
        useConversations.getState().update(conversationId, { awaitingApproval: null });
      }
      const files = conv?.files ?? {};

      if (!conv?.metrics.startedAt) {
        patchMetrics(conversationId, { startedAt: Date.now() });
      }
      patchRun(conversationId, { running: true, error: null, streamingFiles: {} });
      pushTimeline(conversationId, { role: "user", content: prompt });

      let inspirationBlock = "";
      if (opts?.inspirationUrl) {
        pushTimeline(conversationId, {
          role: "tool",
          tool: { kind: "inspect-url", status: "running", detail: opts.inspirationUrl },
        });
        try {
          const res = await fetchUrlForInspiration({ data: { url: opts.inspirationUrl } });
          if (res.ok) {
            updateLastTool(conversationId, { status: "done", detail: res.title || res.url });
            inspirationBlock = `\n\nInspiration reference (fetched from ${res.url} — title/description/visible text only, not a screenshot; use it for tone/structure, don't copy its text or claim to be it):\nTitle: ${res.title}\nDescription: ${res.description}\nText excerpt: ${res.text.slice(0, 2000)}`;
          } else {
            updateLastTool(conversationId, { status: "error", detail: res.message });
          }
        } catch (e) {
          updateLastTool(conversationId, {
            status: "error",
            detail: e instanceof Error ? e.message : "Couldn't fetch that URL.",
          });
        }
      }

      const nameNote =
        cfg.projectName === DEFAULT_PROJECT_NAME
          ? "Project name is currently unset (default placeholder) — suggest one."
          : `Project name is already set to "${cfg.projectName}" — do not suggest a new one unless asked.`;

      const contextNote =
        Object.keys(files).length > 0
          ? `Current project files (unlisted files stay unchanged unless you rewrite them in full):\n${Object.keys(
              files,
            )
              .map((p) => `- ${p}`)
              .join("\n")}\n\n${nameNote}${inspirationBlock}\n\nUser request: ${prompt}`
          : `${nameNote}${inspirationBlock}\n\nUser request: ${prompt}`;
      internal.messages.push({ role: "user", content: contextNote });

      await generateAndCheck(conversationId, cfg, { allowPlanPause: true });
    },

    approvePlan: async (conversationId, cfg) => {
      const conv = getConv(conversationId);
      if (!conv?.awaitingApproval || conv.awaitingApproval.kind !== "plan") return;
      if ((get().runs[conversationId] ?? EMPTY_RUN).running) return;

      useConversations.getState().update(conversationId, { awaitingApproval: null });
      const internal = getInternal(conversationId);
      internal.stopFlag = false;
      internal.messages.push({
        role: "user",
        content: "Approved — continue and write the files now, following the plan above.",
      });
      pushTimeline(conversationId, { role: "user", content: "Approved, continuing." });
      patchRun(conversationId, { running: true, error: null, streamingFiles: {} });

      await generateAndCheck(conversationId, cfg, { allowPlanPause: false });
    },

    continueBuilding: async (conversationId, cfg) => {
      const conv = getConv(conversationId);
      if (!conv?.awaitingApproval || conv.awaitingApproval.kind !== "limit") return;
      if ((get().runs[conversationId] ?? EMPTY_RUN).running) return;

      useConversations.getState().update(conversationId, { awaitingApproval: null });
      const internal = getInternal(conversationId);
      internal.stopFlag = false;
      internal.messages.push({
        role: "user",
        content:
          "Continue exactly where you left off — do not restart from scratch or repeat earlier files unless they still need fixing.",
      });
      pushTimeline(conversationId, { role: "user", content: "Continue building." });
      patchRun(conversationId, { running: true, error: null, streamingFiles: {} });

      await generateAndCheck(conversationId, cfg, { allowPlanPause: false });
    },

    stop: (conversationId) => {
      const internal = getInternal(conversationId);
      internal.stopFlag = true;
      internal.abort?.abort();
    },

    apply: (conversationId) => {
      const run = get().runs[conversationId];
      if (!run?.pendingFiles) return;
      const conv = getConv(conversationId);
      if (!conv) return;

      const before = conv.files;
      const after = run.pendingFiles;
      const changedPaths = Object.keys(after).filter((p) => before[p] !== after[p]);
      let added = 0;
      let removed = 0;
      for (const p of changedPaths) {
        const stats = diffStats(diffLines(before[p] ?? "", after[p] ?? ""));
        added += stats.added;
        removed += stats.removed;
      }
      const entry: ChangelogEntry = {
        id: newId(),
        timestamp: Date.now(),
        summary: `${changedPaths.length} file${changedPaths.length !== 1 ? "s" : ""} changed (+${added}/-${removed})`,
        filesChanged: changedPaths,
      };

      useConversations.getState().update(conversationId, {
        files: after,
        changelog: [entry, ...conv.changelog],
      });
      finishStep(conversationId, "deploy", "Applied.");
      patchRun(conversationId, { pendingFiles: null, pendingFindings: [] });
    },

    discardPending: (conversationId) => {
      patchRun(conversationId, { pendingFiles: null, pendingFindings: [] });
    },

    reset: (conversationId) => {
      const internal = getInternal(conversationId);
      internal.stopFlag = true;
      internal.abort?.abort();
      internal.messages = [];
      useConversations.getState().update(conversationId, {
        timeline: [],
        files: {},
        messages: [],
        steps: defaultSteps(),
        metrics: defaultMetrics(),
        changelog: [],
        awaitingApproval: null,
      });
      set((s) => {
        const next = { ...s.runs };
        delete next[conversationId];
        return { runs: next };
      });
    },
  };
});
