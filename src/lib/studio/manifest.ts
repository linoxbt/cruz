import {
  Bot,
  Code2,
  MessageSquareCode,
  PackagePlus,
  ScanSearch,
  Waypoints,
  type LucideIcon,
} from "lucide-react";

// CRUZ module manifest — the single source of truth for the app's modules.
// CRUZ is single-mode (it's always "chain abstraction"), so there's no
// mode/chain gating here: every module listed is always enabled. The manifest
// exists so the landing page and sidebar render from one source, and so adding
// a future module is "add an id + drop in a route file" with no refactor.
export type CruzModuleId =
  "inspector" | "composer" | "scaffolder" | "editor" | "codeAi" | "builder";

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
      "Generate a starter app (or deliver one built in the AI Builder) via GitHub, Vercel, or Netlify.",
  },
  {
    id: "editor",
    label: "Contract Editor",
    path: "/editor",
    description:
      "Edit, compile, inspect, and deploy a Solidity contract — with an AI assistant on hand.",
  },
  {
    id: "codeAi",
    label: "Code with AI",
    path: "/code-ai",
    description: "Write, debug, and explain Solidity contracts with an AI assistant.",
  },
  {
    id: "builder",
    label: "AI Builder",
    path: "/builder",
    description:
      "Describe an app and an AI agent builds it — live file tree, diff review, and preview.",
  },
];

// One icon per module id, shared by the sidebar and the dashboard's quick
// actions so the two can't silently drift if a module id ever changes.
export const CRUZ_MODULE_ICONS: Record<CruzModuleId, LucideIcon> = {
  inspector: ScanSearch,
  composer: Waypoints,
  scaffolder: PackagePlus,
  editor: Code2,
  codeAi: MessageSquareCode,
  builder: Bot,
};
