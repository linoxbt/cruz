import { create } from "zustand";

// Where the GitHub connection lives — set once on the Settings page instead
// of pasted per-deploy in the Scaffolder's result panel. A real OAuth
// connection (no token ever hand-typed).

export interface GithubConnection {
  token: string;
  login: string;
}

interface DeployConnectionsState {
  github: GithubConnection | null;
  setGithub: (c: GithubConnection) => void;
  clearGithub: () => void;
}

const STORAGE_KEY = "cruz-deploy-connections-v1";

interface Persisted {
  github: GithubConnection | null;
}

function load(): Persisted {
  const empty: Persisted = { github: null };
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

export const useDeployConnections = create<DeployConnectionsState>((set, get) => ({
  ...load(),
  setGithub: (c) => {
    const next = { ...get(), github: c };
    persist(next);
    set({ github: c });
  },
  clearGithub: () => {
    const next = { ...get(), github: null };
    persist(next);
    set({ github: null });
  },
}));
