import { create } from "zustand";

// Everything a user has produced through CRUZ that isn't an AI Builder app
// (those already live in conversations.ts) — contracts deployed via the
// Contract Editor, and repos delivered via the Scaffolder — so My Projects
// can show the full picture of what's been built, not just AI Builder apps.
// Same versioned-localStorage-key/load/persist pattern as conversations.ts/
// deployConnections.ts.

export interface DeployedContract {
  id: string;
  name: string;
  address: string;
  txHash: string;
  chainId: number;
  deployedAt: number;
}

export interface DeliveredRepo {
  id: string;
  repoName: string;
  repoUrl: string;
  deliveredAt: number;
}

interface MyActivityState {
  deployedContracts: DeployedContract[];
  deliveredRepos: DeliveredRepo[];
  addDeployedContract: (c: Omit<DeployedContract, "id">) => void;
  addDeliveredRepo: (r: Omit<DeliveredRepo, "id">) => void;
}

const STORAGE_KEY = "cruz-my-activity-v1";
const MAX_ENTRIES = 100;

interface Persisted {
  deployedContracts: DeployedContract[];
  deliveredRepos: DeliveredRepo[];
}

function load(): Persisted {
  const empty: Persisted = { deployedContracts: [], deliveredRepos: [] };
  if (typeof localStorage === "undefined") return empty;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...empty, ...(JSON.parse(raw) as Partial<Persisted>) } : empty;
  } catch {
    return empty;
  }
}

function persist(s: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota errors */
  }
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const useMyActivity = create<MyActivityState>((set, get) => ({
  ...load(),
  addDeployedContract: (c) => {
    const deployedContracts = [{ ...c, id: newId() }, ...get().deployedContracts].slice(
      0,
      MAX_ENTRIES,
    );
    persist({ ...get(), deployedContracts });
    set({ deployedContracts });
  },
  addDeliveredRepo: (r) => {
    const deliveredRepos = [{ ...r, id: newId() }, ...get().deliveredRepos].slice(0, MAX_ENTRIES);
    persist({ ...get(), deliveredRepos });
    set({ deliveredRepos });
  },
}));
