import { create } from "zustand";

// Where GitHub/Vercel/Netlify connections live — set once on the Settings
// page instead of pasted per-deploy in the Scaffolder's result panel. GitHub
// is a real OAuth connection (no token ever hand-typed); Vercel/Netlify stay
// pasted personal-access-tokens (see the Settings page's own note on why),
// just persisted here instead of reset on every ResultPanel mount.

export interface GithubConnection {
  token: string;
  login: string;
}

interface DeployConnectionsState {
  github: GithubConnection | null;
  vercelToken: string;
  netlifyToken: string;
  setGithub: (c: GithubConnection) => void;
  clearGithub: () => void;
  setVercelToken: (token: string) => void;
  setNetlifyToken: (token: string) => void;
}

const STORAGE_KEY = "cruz-deploy-connections-v1";

interface Persisted {
  github: GithubConnection | null;
  vercelToken: string;
  netlifyToken: string;
}

function load(): Persisted {
  const empty: Persisted = { github: null, vercelToken: "", netlifyToken: "" };
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
  setVercelToken: (token) => {
    const next = { ...get(), vercelToken: token };
    persist(next);
    set({ vercelToken: token });
  },
  setNetlifyToken: (token) => {
    const next = { ...get(), netlifyToken: token };
    persist(next);
    set({ netlifyToken: token });
  },
}));
