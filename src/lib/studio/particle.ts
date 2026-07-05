import { UniversalAccount } from "@particle-network/universal-account-sdk";

// Particle project credentials are publishable identifiers for a client-side
// SDK (not secrets) — same VITE_* public-env convention as chains.ts/contracts.ts.
// Get these from dashboard.particle.network after enabling Universal Accounts.
const PROJECT_ID = import.meta.env.VITE_PARTICLE_PROJECT_ID || "";
const PROJECT_CLIENT_KEY = import.meta.env.VITE_PARTICLE_CLIENT_KEY || "";
const PROJECT_APP_UUID = import.meta.env.VITE_PARTICLE_APP_ID || "";

export function isParticleConfigured(): boolean {
  return !!(PROJECT_ID && PROJECT_CLIENT_KEY && PROJECT_APP_UUID);
}

// A UniversalAccount's config is owner-scoped (smartAccountOptions.ownerAddress),
// so we keep one instance per address inspected this session rather than
// reconstructing it on every call.
const instances = new Map<string, UniversalAccount>();

/** Get (or lazily create) the UniversalAccount for a given EOA, in EIP-7702 mode. */
export function getUniversalAccount(ownerAddress: `0x${string}`): UniversalAccount {
  const key = ownerAddress.toLowerCase();
  let ua = instances.get(key);
  if (!ua) {
    ua = new UniversalAccount({
      projectId: PROJECT_ID,
      projectClientKey: PROJECT_CLIENT_KEY,
      projectAppUuid: PROJECT_APP_UUID,
      smartAccountOptions: {
        name: "CRUZ",
        version: "1.0.0",
        ownerAddress,
        // EIP-7702 mode: the EOA address itself becomes the Universal Account,
        // rather than a separate counterfactual smart-account address.
        useEIP7702: true,
      },
    });
    instances.set(key, ua);
  }
  return ua;
}
