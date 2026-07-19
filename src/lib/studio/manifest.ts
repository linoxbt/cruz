import {
  Bot,
  BookOpen,
  Code2,
  Compass,
  FolderKanban,
  MessageSquareCode,
  PackagePlus,
  ScanSearch,
  Settings,
  Waypoints,
  type LucideIcon,
} from "lucide-react";

// CRUZ module manifest, the single source of truth for the app's modules.
// CRUZ is single-mode (it's always "chain abstraction"), so there's no
// mode/chain gating here: every module listed is always enabled. The manifest
// exists so the landing page, sidebar, and docs page render from one source,
// and so adding a future module is "add an id + drop in a route file" with
// no refactor.
export type CruzModuleId =
  | "inspector"
  | "composer"
  | "scaffolder"
  | "editor"
  | "codeAi"
  | "builder"
  | "projects"
  | "explorer"
  | "docs"
  | "settings";

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
    description: "Generate a starter app (or deliver one built in the AI Builder) via GitHub.",
  },
  {
    id: "editor",
    label: "Contract Editor",
    path: "/editor",
    description:
      "Edit, compile, inspect, and deploy a Solidity contract, with an AI assistant on hand.",
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
      "Describe an app and an AI agent builds it, live file tree, diff review, and preview.",
  },
  {
    id: "projects",
    label: "My Projects",
    path: "/projects",
    description:
      "Every app, contract, and repo you've built or shipped through CRUZ, in one place.",
  },
  {
    id: "explorer",
    label: "Explorer",
    path: "/explorer",
    description: "Browse Arbitrum One blocks, transactions, addresses, and tokens.",
  },
  {
    id: "docs",
    label: "Docs",
    path: "/docs",
    description: "How CRUZ works, module by module, plus security notes and FAQ.",
  },
  {
    id: "settings",
    label: "Settings",
    path: "/settings",
    description: "Connect GitHub once for every deploy.",
  },
];

// One icon per module id, shared by the sidebar and the docs page so they
// can't silently drift if a module id ever changes.
export const CRUZ_MODULE_ICONS: Record<CruzModuleId, LucideIcon> = {
  inspector: ScanSearch,
  composer: Waypoints,
  scaffolder: PackagePlus,
  editor: Code2,
  codeAi: MessageSquareCode,
  builder: Bot,
  projects: FolderKanban,
  explorer: Compass,
  docs: BookOpen,
  settings: Settings,
};
