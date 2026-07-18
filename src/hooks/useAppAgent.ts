import { useCallback, useEffect, useRef, useState } from "react";
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

// Re-exported for existing consumers (AgentChatPanel.tsx) — canonical
// definitions now live in conversations.ts to avoid a circular import
// between this hook and the conversation store.
export type {
  TimelineItem,
  ToolStep,
  ToolStepKind,
  ToolStepStatus,
} from "@/lib/studio-ai/conversations";

const MAX_STRUCTURAL_FIX_ATTEMPTS = 5;
const MAX_TURNS = 8;

/**
 * Drives the AI Builder's full-app generation loop for one conversation: a
 * text-protocol chat with the model (see agentPrompt.ts/parseFileMap.ts —
 * plain streamed text, not real tool-calling, same mechanism DevStation's
 * useCodeAgent.ts uses for a single Solidity file, adapted here to N project
 * files), gated by two automated checks (protected-file enforcement,
 * structural checks) with a bounded retry loop, and a mandatory human
 * diff-review-before-apply step — nothing here ever touches `files` (the
 * last-applied, "real" state) until the caller explicitly calls apply().
 *
 * `timeline`/`files`/`messages` persist to the given conversation (see
 * conversations.ts) on every settled change, so switching conversations or
 * reloading the page resumes where you left off. In-flight generation state
 * (`streamingFiles`, `pendingFiles`, `pendingFindings`) is intentionally NOT
 * persisted — reloading mid-review loses that one turn's pending diff,
 * which is an acceptable simplification given nothing has been applied yet.
 */
export function useAppAgent(conversationId: string | null, cfg: UaInitConfig) {
  const conversations = useConversations((s) => s.conversations);
  const updateConversation = useConversations((s) => s.update);
  const conversation = conversationId
    ? conversations.find((c) => c.id === conversationId)
    : undefined;

  const [timeline, setTimeline] = useState<TimelineItem[]>(conversation?.timeline ?? []);
  const [running, setRunning] = useState(false);
  const [files, setFiles] = useState<Record<string, string>>(conversation?.files ?? {});
  const [streamingFiles, setStreamingFiles] = useState<Record<string, string>>({});
  const [pendingFiles, setPendingFiles] = useState<Record<string, string> | null>(null);
  const [pendingFindings, setPendingFindings] = useState<StructuralFinding[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [suggestedName, setSuggestedName] = useState<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>(conversation?.messages ?? []);
  const stopRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const loadedConversationId = useRef<string | null>(conversationId);

  // Switching conversations (or the initial mount) re-hydrates local state
  // from whatever was last persisted for it.
  useEffect(() => {
    if (loadedConversationId.current === conversationId) return;
    loadedConversationId.current = conversationId;
    setTimeline(conversation?.timeline ?? []);
    setFiles(conversation?.files ?? {});
    messagesRef.current = conversation?.messages ?? [];
    setStreamingFiles({});
    setPendingFiles(null);
    setPendingFindings([]);
    setError(null);
    setSuggestedName(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Persist settled state (timeline/files/messages) on every change — not
  // the transient in-flight state, see module comment above.
  useEffect(() => {
    if (!conversationId) return;
    updateConversation(conversationId, { timeline, files, messages: messagesRef.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, timeline, files]);

  const push = useCallback((item: TimelineItem) => setTimeline((p) => [...p, item]), []);

  const updateLastTool = useCallback((patch: Partial<ToolStep>) => {
    setTimeline((p) => {
      const next = [...p];
      for (let i = next.length - 1; i >= 0; i--) {
        const t = next[i].tool;
        if (t) {
          next[i] = { ...next[i], tool: { ...t, ...patch } };
          break;
        }
      }
      return next;
    });
  }, []);

  const run = useCallback(
    async (prompt: string, opts?: { inspirationUrl?: string }) => {
      if (running || !conversationId) return;
      setRunning(true);
      setError(null);
      setStreamingFiles({});
      stopRef.current = false;
      push({ role: "user", content: prompt });

      let inspirationBlock = "";
      if (opts?.inspirationUrl) {
        push({
          role: "tool",
          tool: { kind: "inspect-url", status: "running", detail: opts.inspirationUrl },
        });
        try {
          const res = await fetchUrlForInspiration({ data: { url: opts.inspirationUrl } });
          if (res.ok) {
            updateLastTool({ status: "done", detail: res.title || res.url });
            inspirationBlock = `\n\nInspiration reference (fetched from ${res.url} — title/description/visible text only, not a screenshot; use it for tone/structure, don't copy its text or claim to be it):\nTitle: ${res.title}\nDescription: ${res.description}\nText excerpt: ${res.text.slice(0, 2000)}`;
          } else {
            updateLastTool({ status: "error", detail: res.message });
          }
        } catch (e) {
          updateLastTool({
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
      messagesRef.current.push({ role: "user", content: contextNote });

      let workingFiles = { ...files };
      let sawError = false;

      try {
        let turn = 0;
        let fixAttempts = 0;

        while (turn < MAX_TURNS) {
          turn++;
          if (stopRef.current) break;

          push({
            role: "tool",
            tool: { kind: "generate", status: "running", detail: "Starting…" },
          });
          let full = "";
          const controller = new AbortController();
          abortRef.current = controller;
          await chatStream({
            system: CRUZ_AGENT_SYSTEM_PROMPT,
            messages: messagesRef.current,
            signal: controller.signal,
            onDelta: (delta) => {
              full += delta;
              const seen = [...full.matchAll(/###\s*FILE:\s*(\S+)/g)].map((m) => m[1]);
              const latest = seen[seen.length - 1];
              if (latest) updateLastTool({ detail: `Writing ${latest}…` });
              setStreamingFiles(parseFileMap(full));
            },
          });
          messagesRef.current.push({ role: "assistant", content: full });

          const produced = parseFileMap(full);
          if (Object.keys(produced).length === 0) {
            updateLastTool({ status: "error", detail: "No files were produced." });
            setError("The agent didn't produce any files — try rephrasing your request.");
            sawError = true;
            break;
          }
          updateLastTool({
            status: "done",
            detail: `${Object.keys(produced).length} file(s) written.`,
          });

          const name = extractSuggestedName(full);
          if (name) setSuggestedName(name);

          // Codex-style narration: the model's plan/closing note, shown as a
          // real chat message rather than discarded (only the file blocks
          // themselves are protocol, not something to show verbatim).
          const prose = extractProse(full);
          if (prose) push({ role: "assistant", content: prose });

          workingFiles = { ...workingFiles, ...produced };

          push({ role: "tool", tool: { kind: "protected-file-check", status: "running" } });
          const { files: enforced, overwritten } = enforceProtectedFiles(workingFiles, cfg);
          workingFiles = enforced;
          updateLastTool({
            status: "done",
            detail: overwritten.length
              ? `Restored the protected Universal Account file (agent output for it was discarded).`
              : "Universal Account file untouched — good.",
          });

          push({ role: "tool", tool: { kind: "structural-check", status: "running" } });
          const findings = runStructuralChecks(workingFiles);
          const errors = findings.filter((f) => f.severity === "error");
          if (errors.length === 0) {
            const securityCount = findings.filter((f) => f.securityRelevant).length;
            updateLastTool({
              status: "done",
              detail: findings.length
                ? `${findings.length} finding(s)${securityCount ? `, ${securityCount} need your review` : ""}.`
                : "Clean.",
            });
            setPendingFiles(workingFiles);
            setPendingFindings(findings);
            push({ role: "assistant", content: "Ready — review the diff below and click Apply." });
            return;
          }

          updateLastTool({
            status: "error",
            detail: errors.map((e) => `${e.path}: ${e.message}`).join(" · "),
          });
          fixAttempts++;
          if (fixAttempts >= MAX_STRUCTURAL_FIX_ATTEMPTS) {
            setError(
              `Gave up after ${MAX_STRUCTURAL_FIX_ATTEMPTS} fix attempts — structural checks kept failing. See the diff for what exists so far.`,
            );
            sawError = true;
            setPendingFiles(workingFiles);
            setPendingFindings(findings);
            break;
          }
          messagesRef.current.push({
            role: "user",
            content: `[STRUCTURAL CHECK RESULT] These files failed validation:\n${errors
              .map((e) => `- ${e.path}: ${e.message}`)
              .join(
                "\n",
              )}\n\nFix them and re-emit the corrected file(s) in full, using the same output protocol.`,
          });
        }
        if (turn >= MAX_TURNS && !sawError) {
          setError(`Gave up after ${MAX_TURNS} turns without a clean result.`);
        }
      } catch (e) {
        if (stopRef.current || (e instanceof DOMException && e.name === "AbortError")) {
          updateLastTool({ status: "error", detail: "Stopped." });
        } else {
          const msg = e instanceof Error ? e.message : "Generation failed.";
          setError(msg);
          updateLastTool({ status: "error", detail: msg });
        }
      } finally {
        setRunning(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [running, files, cfg, conversationId],
  );

  const stop = useCallback(() => {
    stopRef.current = true;
    abortRef.current?.abort();
  }, []);

  const apply = useCallback(() => {
    if (!pendingFiles) return;
    setFiles(pendingFiles);
    setPendingFiles(null);
    setPendingFindings([]);
  }, [pendingFiles]);

  const discardPending = useCallback(() => {
    setPendingFiles(null);
    setPendingFindings([]);
  }, []);

  const reset = useCallback(() => {
    setTimeline([]);
    setFiles({});
    setStreamingFiles({});
    setPendingFiles(null);
    setPendingFindings([]);
    setError(null);
    setSuggestedName(null);
    messagesRef.current = [];
  }, []);

  return {
    timeline,
    running,
    files,
    streamingFiles,
    pendingFiles,
    pendingFindings,
    error,
    suggestedName,
    run,
    stop,
    apply,
    discardPending,
    reset,
  };
}
