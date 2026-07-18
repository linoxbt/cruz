import { create } from "zustand";
import type { ComposerInput } from "@/hooks/useTxComposer";

// Persisted, local-only record of transactions actually executed through the
// Transaction Composer — lets the page offer a "recent" list you can reload
// into the form again, without needing any backend.

export interface ComposerHistoryEntry {
  id: string;
  input: ComposerInput;
  txId: string;
  timestamp: number;
}

const STORAGE_KEY = "cruz-composer-history-v1";
const MAX_ENTRIES = 20;

function load(): ComposerHistoryEntry[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ComposerHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function persist(entries: ComposerHistoryEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* ignore quota errors */
  }
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

interface ComposerHistoryStore {
  entries: ComposerHistoryEntry[];
  add: (input: ComposerInput, txId: string) => void;
  clear: () => void;
}

export const useComposerHistory = create<ComposerHistoryStore>((set, get) => ({
  entries: load(),
  add: (input, txId) => {
    const entry: ComposerHistoryEntry = { id: newId(), input, txId, timestamp: Date.now() };
    const next = [entry, ...get().entries].slice(0, MAX_ENTRIES);
    persist(next);
    set({ entries: next });
  },
  clear: () => {
    persist([]);
    set({ entries: [] });
  },
}));
