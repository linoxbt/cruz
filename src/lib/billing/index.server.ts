import type { BillingProvider } from "./types";
import { prepaidWalletProvider } from "./prepaidWalletProvider.server";

// Provider registry — the single seam through which agentRuntime.ts/
// api.ai.ts (via billing.functions.ts) obtain a BillingProvider. Adding a
// future payment method (subscription, team workspace, prepaid credit packs)
// means registering another implementation here; no call site changes.
const PROVIDERS: Record<string, BillingProvider> = {
  [prepaidWalletProvider.id]: prepaidWalletProvider,
};

const DEFAULT_PROVIDER_ID = prepaidWalletProvider.id;

export function getBillingProvider(id: string = DEFAULT_PROVIDER_ID): BillingProvider {
  return PROVIDERS[id] ?? prepaidWalletProvider;
}
