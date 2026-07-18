// The canonical, deterministic Universal Account init module generated into
// every scaffolded app — whether from the fixed template (buildUnifiedWalletTemplate)
// or the AI Builder. This is the ONE thing CRUZ guarantees is correct out of
// the box, so it is never authored by an LLM: the AI Builder's protected-file
// enforcement (src/lib/studio-ai/protectedFiles.ts) always discards whatever
// the model produces for this path and replaces it with this function's
// output, regardless of what was generated.

export interface UaInitConfig {
  projectName: string;
}

/** Renders `src/lib/universalAccount.ts` — always this exact shape. */
export function buildUniversalAccountModule(cfg: UaInitConfig): string {
  return `import { UniversalAccount, UNIVERSAL_ACCOUNT_VERSION } from "@particle-network/universal-account-sdk";
import { Wallet } from "ethers";

// Demo owner key for local testing only — replace with your real wallet/embedded-wallet flow.
export const wallet = Wallet.createRandom();

export const ua = new UniversalAccount({
  projectId: import.meta.env.VITE_PARTICLE_PROJECT_ID,
  projectClientKey: import.meta.env.VITE_PARTICLE_CLIENT_KEY,
  projectAppUuid: import.meta.env.VITE_PARTICLE_APP_ID,
  smartAccountOptions: {
    name: ${JSON.stringify(cfg.projectName)},
    version: UNIVERSAL_ACCOUNT_VERSION,
    ownerAddress: wallet.address,
    useEIP7702: true,
  },
});
`;
}

/** The one path the AI Builder is never allowed to author. */
export const UNIVERSAL_ACCOUNT_MODULE_PATH = "src/lib/universalAccount.ts";
