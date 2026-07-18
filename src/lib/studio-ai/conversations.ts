import { create } from "zustand";
import type { ChatMessage } from "@/lib/ai";

// Shared timeline/tool-step shapes — defined here (not in useAppAgent.ts) so
// this module and useAppAgent.ts can import each other's types without a
// circular dependency.
export type ToolStepKind = "generate" | "protected-file-check" | "structural-check" | "inspect-url";
export type ToolStepStatus = "running" | "done" | "error";

export interface ToolStep {
  kind: ToolStepKind;
  status: ToolStepStatus;
  detail?: string;
}

export interface TimelineItem {
  role: "user" | "assistant" | "tool";
  content?: string;
  tool?: ToolStep;
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
}

const STORAGE_KEY = "cruz-ai-conversations-v1";
const ACTIVE_KEY = "cruz-ai-active-conversation-v1";
const MAX_CONVERSATIONS = 30;

// Bootstrap placeholder used for every new conversation — treated as "unset"
// so the agent can suggest a real name (see agentPrompt.ts's SUGGESTED_NAME
// line) instead of silently keeping it forever.
export const DEFAULT_PROJECT_NAME = "my-ai-app";

function load(): Conversation[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Conversation[]) : [];
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
  create: (projectName: string) => string;
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
  create: (projectName) => {
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
