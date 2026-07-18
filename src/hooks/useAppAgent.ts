import { useAgentRuntime, EMPTY_RUN } from "@/lib/studio-ai/agentRuntime";
import { useConversations } from "@/lib/studio-ai/conversations";
import type { UaInitConfig } from "@/lib/studio-templates/universalAccountInit";

// Re-exported for existing consumers (AgentChatPanel.tsx) — canonical
// definitions live in conversations.ts to avoid a circular import between
// this hook and the conversation store.
export type {
  TimelineItem,
  ToolStep,
  ToolStepKind,
  ToolStepStatus,
} from "@/lib/studio-ai/conversations";

/**
 * Thin selector hook over two module-scoped stores — it holds no state of
 * its own, so mounting/unmounting it (e.g. navigating to and from /builder)
 * never loses anything:
 *
 *  - `conversations.ts` — the persisted, settled state (timeline/files/
 *    messages), same as any other conversation data.
 *  - `agentRuntime.ts` — the actual generation engine, running independent
 *    of whether this hook (or any component) is currently mounted. See its
 *    module comment for why that split exists: an earlier version ran the
 *    generation loop directly in this hook's local useState, which silently
 *    discarded an entire in-progress turn if the user navigated away
 *    mid-generation, since the fetch kept running but the state updates it
 *    made belonged to an already-unmounted hook instance.
 */
export function useAppAgent(conversationId: string | null, cfg: UaInitConfig) {
  const conversation = useConversations((s) =>
    conversationId ? s.conversations.find((c) => c.id === conversationId) : undefined,
  );
  const run =
    useAgentRuntime((s) => (conversationId ? s.runs[conversationId] : undefined)) ?? EMPTY_RUN;

  return {
    timeline: conversation?.timeline ?? [],
    running: run.running,
    files: conversation?.files ?? {},
    streamingFiles: run.streamingFiles,
    pendingFiles: run.pendingFiles,
    pendingFindings: run.pendingFindings,
    error: run.error,
    suggestedName: run.suggestedName,
    run: (prompt: string, opts?: { inspirationUrl?: string }) => {
      if (conversationId) void useAgentRuntime.getState().run(conversationId, cfg, prompt, opts);
    },
    stop: () => {
      if (conversationId) useAgentRuntime.getState().stop(conversationId);
    },
    apply: () => {
      if (conversationId) useAgentRuntime.getState().apply(conversationId);
    },
    discardPending: () => {
      if (conversationId) useAgentRuntime.getState().discardPending(conversationId);
    },
    reset: () => {
      if (conversationId) useAgentRuntime.getState().reset(conversationId);
    },
  };
}
