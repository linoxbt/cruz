import { create } from "zustand";
import type { ChatMessage } from "@/lib/ai";

// Shared timeline/tool-step shapes — defined here (not in useAppAgent.ts) so
// this module and useAppAgent.ts can import each other's types without a
// circular dependency.
//
// The build-step kinds (spec/scaffold/implement/test/deploy/monitor, see
// BuildStepKind below) are included here too: a build-step transition is
// rendered as an inline ToolStep row in the conversation itself — the same
// live-status log used for "Generating"/"Structural check" — rather than as
// a separate checklist panel elsewhere in the UI. The underlying BuildStep
// list (conv.steps) still exists for resumability/metrics; this is only
// about how a step transition is *shown*.
export type ToolStepKind =
  | "generate"
  | "protected-file-check"
  | "structural-check"
  | "inspect-url"
  | "mcp-call"
  | "spec"
  | "scaffold"
  | "implement"
  | "test"
  | "deploy"
  | "monitor";
export type ToolStepStatus = "running" | "done" | "error";

export interface ToolStep {
  kind: ToolStepKind;
  status: ToolStepStatus;
  detail?: string;
}

export interface AgentPlan {
  analysis: string;
  steps: string[];
}

export interface TimelineItem {
  role: "user" | "assistant" | "tool";
  content?: string;
  tool?: ToolStep;
  /** Set on assistant items that are the turn's analysis/plan (see
   *  agentPrompt.ts/parseFileMap.ts's extractPlan) — rendered as a distinct
   *  checklist card instead of a plain chat bubble. */
  plan?: AgentPlan;
}

// The persistent task list a build works through — spec -> scaffold ->
// implement -> test -> deploy -> monitor — tracked as real state (not just
// implied by which turn we're on), so the UI can show live per-step status
// and a reload can resume at the right step instead of restarting.
export type BuildStepKind = "spec" | "scaffold" | "implement" | "test" | "deploy" | "monitor";
export type BuildStepStatus = "pending" | "in_progress" | "done" | "failed" | "skipped";

export interface BuildStep {
  id: string;
  kind: BuildStepKind;
  label: string;
  status: BuildStepStatus;
  detail?: string;
  startedAt?: number;
  finishedAt?: number;
  /** Retry count for this step specifically (a failed test step retrying
   *  doesn't restart spec/scaffold). */
  attempts?: number;
}

const STEP_LABELS: Record<BuildStepKind, string> = {
  spec: "Spec",
  scaffold: "Scaffold",
  implement: "Implement",
  test: "Test",
  deploy: "Deploy",
  monitor: "Monitor",
};

export function defaultSteps(): BuildStep[] {
  return (Object.keys(STEP_LABELS) as BuildStepKind[]).map((kind) => ({
    id: kind,
    kind,
    label: STEP_LABELS[kind],
    status: "pending",
  }));
}

export interface BuildMetrics {
  startedAt: number | null;
  finishedAt: number | null;
  /** Total retry/fix loops across every step (structural-check or bundle-test failures). */
  iterations: number;
  testsRun: number;
  testsPassed: number;
  /** Total structural/security findings surfaced across the build. */
  errorsCaught: number;
}

export function defaultMetrics(): BuildMetrics {
  return {
    startedAt: null,
    finishedAt: null,
    iterations: 0,
    testsRun: 0,
    testsPassed: 0,
    errorsCaught: 0,
  };
}

export interface ChangelogEntry {
  id: string;
  timestamp: number;
  summary: string;
  filesChanged: string[];
}

/** A build-time decision the agent is paused on until the user acts —
 *  "plan" (manual mode's post-spec pause), "security" (the existing
 *  new-dependency/install-script review, which applies in both modes), or
 *  "limit" (an internal safety cap — MAX_TURNS/MAX_FIX_ATTEMPTS — was hit;
 *  this is a one-click resume, not a dead end, since the underlying work may
 *  still be genuinely unfinished rather than actually stuck). */
export interface AwaitingApproval {
  kind: "plan" | "security" | "limit";
  detail: string;
}

export type BuildMode = "auto" | "manual";

export interface HealthCheck {
  checkedAt: number;
  ok: boolean;
  message: string;
  outdatedDeps: string[];
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  projectName: string;
  timeline: TimelineItem[];
  messages: ChatMessage[];
  files: Record<string, string>;
  mode: BuildMode;
  steps: BuildStep[];
  metrics: BuildMetrics;
  changelog: ChangelogEntry[];
  awaitingApproval: AwaitingApproval | null;
  lastHealthCheck: HealthCheck | null;
}

const STORAGE_KEY = "cruz-ai-conversations-v1";
const ACTIVE_KEY = "cruz-ai-active-conversation-v1";
const MAX_CONVERSATIONS = 30;

// Bootstrap placeholder used for every new conversation — treated as "unset"
// so the agent can suggest a real name (see agentPrompt.ts's SUGGESTED_NAME
// line) instead of silently keeping it forever.
export const DEFAULT_PROJECT_NAME = "my-ai-app";

// Fills in the task-list/metrics/changelog fields for conversations
// persisted before this feature existed, so old localStorage data doesn't
// need a version bump or migration step.
function normalize(c: Conversation): Conversation {
  return {
    ...c,
    mode: c.mode ?? "manual",
    steps: c.steps ?? defaultSteps(),
    metrics: c.metrics ?? defaultMetrics(),
    changelog: c.changelog ?? [],
    awaitingApproval: c.awaitingApproval ?? null,
    lastHealthCheck: c.lastHealthCheck ?? null,
  };
}

function load(): Conversation[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Conversation[]).map(normalize) : [];
  } catch {
    return [];
  }
}

function loadActiveId(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

function persistActiveId(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore quota errors */
  }
}

function persist(list: Conversation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_CONVERSATIONS)));
  } catch {
    /* ignore quota errors */
  }
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function titleFrom(timeline: TimelineItem[], fallback: string): string {
  const firstUser = timeline.find((t) => t.role === "user" && t.content);
  if (!firstUser?.content) return fallback;
  const text = firstUser.content.trim();
  return text.length > 48 ? `${text.slice(0, 48)}…` : text;
}

interface ConversationsStore {
  conversations: Conversation[];
  activeId: string | null;
  create: (projectName: string, mode: BuildMode) => string;
  select: (id: string) => void;
  update: (id: string, patch: Partial<Omit<Conversation, "id" | "createdAt">>) => void;
  remove: (id: string) => void;
}

// Initial state reads localStorage directly (SSR-safe via load()'s own
// window check) — same pattern as theme.ts/ui-state.ts — rather than a
// separate async hydrate() step, so useAppAgent's initial state (computed
// from this store on first render) never races an unhydrated empty store.
const initial = load();
const initialActiveId = loadActiveId();
// Fall back to the newest conversation only if the persisted active id no
// longer exists (e.g. it was deleted in another tab) — otherwise resuming a
// conversation you explicitly switched to survives a reload.
const initialResolvedActiveId =
  (initialActiveId && initial.some((c) => c.id === initialActiveId) ? initialActiveId : null) ??
  initial[0]?.id ??
  null;

export const useConversations = create<ConversationsStore>((set, get) => ({
  conversations: initial,
  activeId: initialResolvedActiveId,
  create: (projectName, mode) => {
    const id = newId();
    const now = Date.now();
    const conv: Conversation = {
      id,
      title: "New conversation",
      createdAt: now,
      updatedAt: now,
      projectName,
      timeline: [],
      messages: [],
      files: {},
      mode,
      steps: defaultSteps(),
      metrics: defaultMetrics(),
      changelog: [],
      awaitingApproval: null,
      lastHealthCheck: null,
    };
    const list = [conv, ...get().conversations].slice(0, MAX_CONVERSATIONS);
    persist(list);
    persistActiveId(id);
    set({ conversations: list, activeId: id });
    return id;
  },
  select: (id) => {
    persistActiveId(id);
    set({ activeId: id });
  },
  update: (id, patch) => {
    const list = get().conversations.map((c) => {
      if (c.id !== id) return c;
      const next = { ...c, ...patch, updatedAt: Date.now() };
      if (patch.timeline) next.title = titleFrom(patch.timeline, c.projectName);
      return next;
    });
    persist(list);
    set({ conversations: list });
  },
  remove: (id) => {
    const list = get().conversations.filter((c) => c.id !== id);
    persist(list);
    set((s) => {
      const nextActiveId = s.activeId === id ? (list[0]?.id ?? null) : s.activeId;
      if (s.activeId === id) persistActiveId(nextActiveId);
      return { conversations: list, activeId: nextActiveId };
    });
  },
}));
