import { create } from "zustand";
import { chatStream, type ChatMessage } from "@/lib/ai";
import { CRUZ_AGENT_SYSTEM_PROMPT } from "@/lib/studio-ai/agentPrompt";
import { parseFileMap, extractProse, extractSuggestedName } from "@/lib/studio-ai/parseFileMap";
import { runStructuralChecks, type StructuralFinding } from "@/lib/studio-ai/structuralCheck";
import { enforceProtectedFiles } from "@/lib/studio-ai/protectedFiles";
import {
  useConversations,
  DEFAULT_PROJECT_NAME,
  type TimelineItem,
  type ToolStep,
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
const MAX_STRUCTURAL_FIX_ATTEMPTS = 5;
const MAX_TURNS = 8;

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

interface AgentRuntimeStore {
  runs: Record<string, AgentRunState>;
  run: (
    conversationId: string,
    cfg: UaInitConfig,
    prompt: string,
    opts?: { inspirationUrl?: string },
  ) => Promise<void>;
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
    return useConversations.getState().conversations.find((c) => c.id === id)?.timeline ?? [];
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

  return {
    runs: {},

    run: async (conversationId, cfg, prompt, opts) => {
      if ((get().runs[conversationId] ?? EMPTY_RUN).running) return;

      const internal = getInternal(conversationId);
      internal.stopFlag = false;

      const conv = useConversations.getState().conversations.find((c) => c.id === conversationId);
      // Seed the in-memory turn buffer from what's persisted only the first
      // time this conversation runs since the page loaded (a fresh module
      // load / internals entry) — subsequent runs keep accumulating on the
      // same in-memory buffer, matching ordinary chat-history behavior.
      if (internal.messages.length === 0 && conv?.messages?.length) {
        internal.messages = [...conv.messages];
      }
      const files = conv?.files ?? {};

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

      let workingFiles = { ...files };
      let sawError = false;

      try {
        let turn = 0;
        let fixAttempts = 0;

        while (turn < MAX_TURNS) {
          turn++;
          if (internal.stopFlag) break;

          pushTimeline(conversationId, {
            role: "tool",
            tool: { kind: "generate", status: "running", detail: "Starting…" },
          });
          let full = "";
          const controller = new AbortController();
          internal.abort = controller;
          await chatStream({
            system: CRUZ_AGENT_SYSTEM_PROMPT,
            messages: internal.messages,
            signal: controller.signal,
            onDelta: (delta) => {
              full += delta;
              const seen = [...full.matchAll(/###\s*FILE:\s*(\S+)/g)].map((m) => m[1]);
              const latest = seen[seen.length - 1];
              if (latest) updateLastTool(conversationId, { detail: `Writing ${latest}…` });
              patchRun(conversationId, { streamingFiles: parseFileMap(full) });
            },
          });
          internal.messages.push({ role: "assistant", content: full });

          const produced = parseFileMap(full);
          if (Object.keys(produced).length === 0) {
            updateLastTool(conversationId, { status: "error", detail: "No files were produced." });
            patchRun(conversationId, {
              error: "The agent didn't produce any files — try rephrasing your request.",
            });
            sawError = true;
            break;
          }
          updateLastTool(conversationId, {
            status: "done",
            detail: `${Object.keys(produced).length} file(s) written.`,
          });

          const name = extractSuggestedName(full);
          if (name) patchRun(conversationId, { suggestedName: name });

          const prose = extractProse(full);
          if (prose) pushTimeline(conversationId, { role: "assistant", content: prose });

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
              : "Universal Account file untouched — good.",
          });

          pushTimeline(conversationId, {
            role: "tool",
            tool: { kind: "structural-check", status: "running" },
          });
          const findings = runStructuralChecks(workingFiles);
          const errors = findings.filter((f) => f.severity === "error");
          if (errors.length === 0) {
            const securityCount = findings.filter((f) => f.securityRelevant).length;
            updateLastTool(conversationId, {
              status: "done",
              detail: findings.length
                ? `${findings.length} finding(s)${securityCount ? `, ${securityCount} need your review` : ""}.`
                : "Clean.",
            });
            patchRun(conversationId, { pendingFiles: workingFiles, pendingFindings: findings });
            pushTimeline(conversationId, {
              role: "assistant",
              content: "Ready — review the diff below and click Apply.",
            });
            useConversations.getState().update(conversationId, { messages: internal.messages });
            patchRun(conversationId, { running: false });
            return;
          }

          updateLastTool(conversationId, {
            status: "error",
            detail: errors.map((e) => `${e.path}: ${e.message}`).join(" · "),
          });
          fixAttempts++;
          if (fixAttempts >= MAX_STRUCTURAL_FIX_ATTEMPTS) {
            patchRun(conversationId, {
              error: `Gave up after ${MAX_STRUCTURAL_FIX_ATTEMPTS} fix attempts — structural checks kept failing. See the diff for what exists so far.`,
              pendingFiles: workingFiles,
              pendingFindings: findings,
            });
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
        }
        if (turn >= MAX_TURNS && !sawError) {
          patchRun(conversationId, {
            error: `Gave up after ${MAX_TURNS} turns without a clean result.`,
          });
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
    },

    stop: (conversationId) => {
      const internal = getInternal(conversationId);
      internal.stopFlag = true;
      internal.abort?.abort();
    },

    apply: (conversationId) => {
      const run = get().runs[conversationId];
      if (!run?.pendingFiles) return;
      useConversations.getState().update(conversationId, { files: run.pendingFiles });
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
      useConversations.getState().update(conversationId, { timeline: [], files: {}, messages: [] });
      set((s) => {
        const next = { ...s.runs };
        delete next[conversationId];
        return { runs: next };
      });
    },
  };
});
