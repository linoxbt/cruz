import { useSyncExternalStore } from "react";
import { create } from "zustand";

// Runtime AI configuration for the AI Builder. Endpoints + model lists for
// each provider are hardcoded here; the user picks a provider, picks a model,
// pastes their API key, and saves. Choices persist to localStorage so they
// survive refresh/browser sessions until the user clears their cache. SSR-safe.

export type AiProvider = "openai" | "anthropic" | "openrouter" | "0g";

export interface ProviderPreset {
  id: AiProvider;
  label: string;
  /** "anthropic" uses the native Messages API; others are OpenAI-compatible. */
  kind: "anthropic" | "openai";
  endpoint: string;
  models: string[];
  keyPlaceholder: string;
  keyHint?: string;
}

// Hardcoded provider presets. Endpoints are fixed; the user only supplies a key.
export const AI_PROVIDERS: Record<AiProvider, ProviderPreset> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    kind: "openai",
    endpoint: "https://api.openai.com/v1/chat/completions",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1", "o4-mini"],
    keyPlaceholder: "sk-...",
    keyHint: "platform.openai.com/api-keys",
  },
  anthropic: {
    id: "anthropic",
    label: "Claude (Anthropic)",
    kind: "anthropic",
    endpoint: "https://api.anthropic.com",
    models: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
    keyPlaceholder: "sk-ant-...",
    keyHint: "console.anthropic.com/settings/keys",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    models: [
      "openai/gpt-4o-mini",
      "anthropic/claude-3.5-sonnet",
      "google/gemini-2.0-flash-001",
      "meta-llama/llama-3.3-70b-instruct",
      "deepseek/deepseek-chat",
    ],
    keyPlaceholder: "sk-or-v1-...",
    keyHint: "openrouter.ai/keys",
  },
  "0g": {
    id: "0g",
    label: "0G Router",
    // Anthropic-Messages-API-shaped, but a different host/key than native
    // Anthropic — see streamAnthropic()'s 0G-specific system-field workaround
    // in ai.ts.
    kind: "anthropic",
    endpoint: "https://router-api.0g.ai",
    models: ["claude-opus-4-8"],
    keyPlaceholder: "sk-...",
    keyHint: "0G router dashboard",
  },
};

// Effective endpoint + API kind for the current settings. Kept as a helper so
// call sites stay uniform if a provider ever needs per-model routing.
export function resolveEndpoint(s: AiSettings = getAiSettings()): {
  endpoint: string;
  kind: "anthropic" | "openai";
} {
  const preset = AI_PROVIDERS[s.provider];
  return { endpoint: preset.endpoint, kind: preset.kind };
}

export const AI_PROVIDER_LIST = Object.values(AI_PROVIDERS);

export interface AiSettings {
  provider: AiProvider;
  /** Selected model id for the active provider. */
  model: string;
  /** Per-provider API keys (so switching providers keeps each key). */
  keys: Partial<Record<AiProvider, string>>;
  /** Route through CRUZ's server proxy (operator-controlled), if configured. */
  proxy: boolean;
}

const STORAGE_KEY = "cruz-ai-settings-v1";
const env = import.meta.env;

function defaults(): AiSettings {
  return {
    provider: "openai",
    model: AI_PROVIDERS.openai.models[0],
    keys: {},
    // Default to the operator-provided server proxy when the deployment opts
    // in with VITE_AI_PROXY=true (set alongside a server-only key). Users can
    // switch to their own key in the AI Builder's settings panel.
    proxy: (env.VITE_AI_PROXY as string | undefined) === "true",
  };
}

function load(): AiSettings {
  const base = defaults();
  if (typeof window === "undefined" || typeof localStorage === "undefined") return base;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<AiSettings>;
    const provider =
      saved.provider && AI_PROVIDERS[saved.provider] ? saved.provider : base.provider;
    const preset = AI_PROVIDERS[provider];
    const model =
      saved.model && preset.models.includes(saved.model) ? saved.model : preset.models[0];
    return { ...base, ...saved, provider, model, keys: saved.keys ?? {} };
  } catch {
    return base;
  }
}

function save(s: AiSettings) {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota errors */
  }
}

interface AiSettingsStore extends AiSettings {
  setProvider: (p: AiProvider) => void;
  setModel: (m: string) => void;
  setKey: (key: string) => void;
  setProxy: (on: boolean) => void;
  reset: () => void;
}

export const useAiSettings = create<AiSettingsStore>((set, get) => ({
  ...load(),
  // Switching provider snaps the model to that provider's first option unless
  // the current model is valid for it.
  setProvider: (p) => {
    const preset = AI_PROVIDERS[p];
    const model = preset.models.includes(get().model) ? get().model : preset.models[0];
    const next = { ...get(), provider: p, model };
    save(next);
    set({ provider: p, model });
  },
  // Toggle between CRUZ's server proxy (if configured) and a personal
  // bring-your-own-key. Persisted so the choice survives refresh.
  setProxy: (on) => {
    const next = { ...get(), proxy: on };
    save(next);
    set({ proxy: on });
  },
  setModel: (m) => {
    const next = { ...get(), model: m };
    save(next);
    set({ model: m });
  },
  setKey: (key) => {
    const keys = { ...get().keys, [get().provider]: key };
    const next = { ...get(), keys };
    save(next);
    set({ keys });
  },
  reset: () => {
    const d = defaults();
    save(d);
    set(d);
  },
}));

// Non-reactive snapshot for the chat client (not a React component).
export function getAiSettings(): AiSettings {
  return useAiSettings.getState();
}

export function activeKey(s: AiSettings = getAiSettings()): string {
  return s.keys[s.provider] ?? "";
}

export function isAiConfigured(): boolean {
  const s = getAiSettings();
  if (s.proxy) return getServerStatus().configured;
  return !!activeKey(s);
}

// --- Server-proxy status ----------------------------------------------------
//
// The `proxy` toggle above only records the user's *preference* — it can't
// know on its own whether CRUZ's server actually has a key configured. This
// checks the real /api/ai status once and caches it, purely as an
// informational signal for the settings panel ("not configured on this
// deployment, here's why") — it does NOT override the user's choice. An
// earlier version silently flipped `proxy` back to false whenever the server
// looked unconfigured; that took the choice away from the user (they should
// be able to select whichever mode they want, whenever they want, and see a
// real error if it doesn't work, rather than being overridden behind their
// back) — removed.
export interface AiServerStatus {
  checked: boolean;
  configured: boolean;
}

let serverStatus: AiServerStatus = { checked: false, configured: false };
const serverStatusListeners = new Set<() => void>();

function notifyServerStatus() {
  for (const l of serverStatusListeners) l();
}

async function checkServerStatus(): Promise<void> {
  try {
    const resp = await fetch("/api/ai");
    const data = (await resp.json()) as { configured?: boolean };
    serverStatus = { checked: true, configured: !!data.configured };
  } catch {
    serverStatus = { checked: true, configured: false };
  }
  notifyServerStatus();
}

let statusCheckStarted = false;

export function getServerStatus(): AiServerStatus {
  return serverStatus;
}

/** Kick off the one-time server-status check if it hasn't run yet. Safe to
 *  call from anywhere (e.g. on every render) — only fires the request once. */
export function ensureServerStatusChecked(): void {
  if (statusCheckStarted || typeof window === "undefined") return;
  statusCheckStarted = true;
  void checkServerStatus();
}

export function subscribeServerStatus(listener: () => void): () => void {
  serverStatusListeners.add(listener);
  return () => serverStatusListeners.delete(listener);
}

const SSR_SERVER_STATUS: AiServerStatus = { checked: false, configured: false };

/** Reactive server-proxy status — triggers the one-time check on first use. */
export function useAiServerStatus(): AiServerStatus {
  ensureServerStatusChecked();
  return useSyncExternalStore(subscribeServerStatus, getServerStatus, () => SSR_SERVER_STATUS);
}
