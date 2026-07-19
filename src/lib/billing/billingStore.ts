import { create } from "zustand";
import type { Dashboard } from "./types";

// Client-side billing state for the "CRUZ Default" AI path. The spending
// authorization token is an opaque bearer (its hash is what the server
// stores); persisting it in localStorage is fine — it isn't a spend authority
// on its own, the server-side authorization record is the source of truth and
// can be revoked independently. Tokens are keyed per wallet address so
// switching wallets doesn't leak one wallet's authorization to another.
//
// Lives at module scope (same pattern as conversations.ts/agentRuntime.ts) so
// agentRuntime.ts can read getBillingContext() synchronously without being a
// React hook, and so the connected address + token survive route changes.

interface BillingState {
  address: string | null;
  token: string | null;
  autoPay: boolean;
  dashboard: Dashboard | null;
  setAddress: (address: string | null) => void;
  setToken: (token: string | null) => void;
  setAutoPay: (autoPay: boolean) => void;
  setDashboard: (dashboard: Dashboard | null) => void;
}

const TOKEN_KEY_PREFIX = "cruz-billing-token-v1:";

function tokenKey(address: string): string {
  return `${TOKEN_KEY_PREFIX}${address.toLowerCase()}`;
}

function loadToken(address: string | null): string | null {
  if (!address || typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(tokenKey(address));
  } catch {
    return null;
  }
}

function persistToken(address: string | null, token: string | null) {
  if (!address || typeof localStorage === "undefined") return;
  try {
    if (token) localStorage.setItem(tokenKey(address), token);
    else localStorage.removeItem(tokenKey(address));
  } catch {
    /* ignore quota errors */
  }
}

export const useBillingStore = create<BillingState>((set, get) => ({
  address: null,
  token: null,
  autoPay: true,
  dashboard: null,
  setAddress: (address) => {
    // Re-hydrate the token for the newly-connected address (or clear it).
    set({ address, token: loadToken(address) });
  },
  setToken: (token) => {
    persistToken(get().address, token);
    set({ token });
  },
  setAutoPay: (autoPay) => set({ autoPay }),
  setDashboard: (dashboard) => set({ dashboard }),
}));

/** Read the current billing context for a server call — null when no wallet
 *  is connected. Used by agentRuntime.ts (module scope, not a hook). */
export function getBillingContext(): { address: string; token: string | null } | null {
  const { address, token } = useBillingStore.getState();
  return address ? { address, token } : null;
}
