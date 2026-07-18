import { findUnauthorizedUaUsage } from "./protectedFiles";

export interface StructuralFinding {
  path: string;
  severity: "error" | "warning";
  message: string;
  /** Flagged for explicit human approval before Apply, not just shown as a
   *  passive warning in the diff — currently: install scripts and any
   *  dependency the agent added beyond the known-safe baseline. */
  securityRelevant?: boolean;
}

// The deterministic template's own dependency set (see unifiedWallet.ts's
// packageJson()) — anything the agent adds beyond this is a new supply-chain
// trust decision the user hasn't implicitly already made, so it gets flagged
// for explicit approval rather than silently accepted.
const KNOWN_SAFE_DEPENDENCIES = new Set([
  "@particle-network/universal-account-sdk",
  "ethers",
  "react",
  "react-dom",
  "magic-sdk",
  "@vitejs/plugin-react",
  "typescript",
  "vite",
]);

// Tier 1 of the AI Builder's two-tier validation: automated, blocking checks.
// There's no client-side TypeScript compiler CRUZ can lean on the way
// compiler.worker.ts leans on solc for Solidity (no realistic in-browser
// type-checker with correct module resolution against a project's own,
// not-yet-installed node_modules) — this is a real infeasibility, not a
// shortcut, so these checks are deliberately lightweight: they catch the
// class of "the model truncated mid-file" / "unbalanced JSX" / "dangerous
// install script" failures a real parser would also catch, without needing
// one. Tier 2 (mandatory human diff review before Apply) is the real backstop.
export function runStructuralChecks(files: Record<string, string>): StructuralFinding[] {
  const findings: StructuralFinding[] = [];

  const pkgRaw = files["package.json"];
  if (pkgRaw === undefined) {
    findings.push({ path: "package.json", severity: "error", message: "Missing package.json." });
  } else {
    try {
      const pkg = JSON.parse(pkgRaw) as {
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      for (const script of ["postinstall", "preinstall", "prepare"]) {
        if (pkg.scripts?.[script]) {
          findings.push({
            path: "package.json",
            severity: "warning",
            securityRelevant: true,
            message: `Has a "${script}" script — review it before running npm install anywhere; CRUZ never runs it, but you or Vercel's build might.`,
          });
        }
      }
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      for (const name of Object.keys(allDeps)) {
        if (!KNOWN_SAFE_DEPENDENCIES.has(name)) {
          findings.push({
            path: "package.json",
            severity: "warning",
            securityRelevant: true,
            message: `New dependency "${name}" — not part of CRUZ's known starter set. Review it before trusting it.`,
          });
        }
      }
    } catch {
      findings.push({ path: "package.json", severity: "error", message: "package.json is not valid JSON." });
    }
  }

  for (const [path, content] of Object.entries(files)) {
    if (!/\.(ts|tsx)$/.test(path)) continue;
    const err = checkBalance(content);
    if (err) findings.push({ path, severity: "error", message: err });
  }

  for (const path of findUnauthorizedUaUsage(files)) {
    findings.push({
      path,
      severity: "warning",
      message: 'Instantiates UniversalAccount directly instead of importing { ua } from "./lib/universalAccount".',
    });
  }

  return findings;
}

// A lightweight, single-pass tokenizer that tracks string/template-literal/
// comment context well enough to catch truncated or unbalanced files —
// deliberately not a real parser (see module comment above).
function checkBalance(content: string): string | null {
  const stack: Array<{ ch: string; templateReturn: boolean }> = [];
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  let state: "normal" | "line-comment" | "block-comment" | "sq" | "dq" | "template" = "normal";

  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    const next = content[i + 1];

    if (state === "line-comment") {
      if (c === "\n") state = "normal";
      continue;
    }
    if (state === "block-comment") {
      if (c === "*" && next === "/") {
        state = "normal";
        i++;
      }
      continue;
    }
    if (state === "sq" || state === "dq") {
      if (c === "\\") {
        i++;
        continue;
      }
      if ((state === "sq" && c === "'") || (state === "dq" && c === '"')) state = "normal";
      continue;
    }
    if (state === "template") {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === "`") {
        state = "normal";
        continue;
      }
      if (c === "$" && next === "{") {
        stack.push({ ch: "{", templateReturn: true });
        state = "normal";
        i++;
        continue;
      }
      continue;
    }

    // state === "normal"
    if (c === "/" && next === "/") {
      state = "line-comment";
      i++;
      continue;
    }
    if (c === "/" && next === "*") {
      state = "block-comment";
      i++;
      continue;
    }
    if (c === "'") {
      state = "sq";
      continue;
    }
    if (c === '"') {
      state = "dq";
      continue;
    }
    if (c === "`") {
      state = "template";
      continue;
    }
    if (c === "(" || c === "[" || c === "{") {
      stack.push({ ch: c, templateReturn: false });
      continue;
    }
    if (c === ")" || c === "]" || c === "}") {
      const top = stack.pop();
      if (!top || top.ch !== pairs[c]) {
        return `Unbalanced "${c}" — mismatched or unexpected closing bracket.`;
      }
      if (c === "}" && top.templateReturn) state = "template";
      continue;
    }
  }

  if (state === "sq" || state === "dq") return "Unterminated string literal — file likely got cut off.";
  if (state === "template") return "Unterminated template literal — file likely got cut off.";
  if (state === "block-comment") return "Unterminated block comment — file likely got cut off.";
  if (stack.length > 0) return `Unbalanced brackets — ${stack.length} unclosed.`;
  return null;
}
