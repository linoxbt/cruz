// CRUZ module manifest — the single source of truth for the app's modules.
// CRUZ is single-mode (it's always "chain abstraction"), so there's no
// mode/chain gating here: every module listed is always enabled. The manifest
// exists so the landing page and sidebar render from one source, and so adding
// a future module is "add an id + drop in a route file" with no refactor.
export type CruzModuleId = "inspector" | "composer" | "scaffolder" | "editor";

export interface CruzModuleDef {
  id: CruzModuleId;
  label: string;
  path: string;
  description: string;
}

export const CRUZ_MODULES: CruzModuleDef[] = [
  {
    id: "inspector",
    label: "Account Inspector",
    path: "/inspector",
    description: "Unified balance, EOA vs. upgraded status, and the EIP-7702 upgrade flow.",
  },
  {
    id: "composer",
    label: "Transaction Composer",
    path: "/composer",
    description:
      "Compose, preview, and execute a cross-chain Universal Transaction, and export it as code.",
  },
  {
    id: "scaffolder",
    label: "Starter Scaffolder",
    path: "/scaffolder",
    description:
      "Generate a runnable, chain-abstracted starter app and deliver it via GitHub or Vercel.",
  },
  {
    id: "editor",
    label: "Contract Editor",
    path: "/editor",
    description:
      "Edit and compile a Solidity contract — for reviewing demo and generated contracts.",
  },
];
