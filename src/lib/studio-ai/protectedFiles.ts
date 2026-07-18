import {
  buildUniversalAccountModule,
  UNIVERSAL_ACCOUNT_MODULE_PATH,
  type UaInitConfig,
} from "@/lib/studio-templates/universalAccountInit";

// The AI Builder's core safeguard: the Universal Accounts wiring is the one
// thing CRUZ guarantees is correct out of the box, so it's never authored by
// the model. Whatever the AI produces (or omits) for this path is always
// discarded and replaced with the canonical, deterministically-generated
// content — never merged, never trusted. See universalAccountInit.ts.
export const PROTECTED_FILES: readonly string[] = [UNIVERSAL_ACCOUNT_MODULE_PATH];

/** Overwrite any protected path in `files` with its canonical content,
 *  regardless of what the AI produced (or omitted). Returns the corrected
 *  file map plus the list of paths that had to be overwritten, for the
 *  agent's timeline. */
export function enforceProtectedFiles(
  files: Record<string, string>,
  cfg: UaInitConfig,
): { files: Record<string, string>; overwritten: string[] } {
  const next = { ...files };
  const overwritten: string[] = [];

  const canonical = buildUniversalAccountModule(cfg);
  if (next[UNIVERSAL_ACCOUNT_MODULE_PATH] !== canonical) {
    overwritten.push(UNIVERSAL_ACCOUNT_MODULE_PATH);
  }
  next[UNIVERSAL_ACCOUNT_MODULE_PATH] = canonical;

  return { files: next, overwritten };
}

// Flags (does not auto-fix) any *other* file that re-instantiates a
// UniversalAccount directly instead of importing the protected module —
// surfaced to the user, not silently stripped, matching the Composer's
// "no side effects, just show what would happen" ethos.
export function findUnauthorizedUaUsage(files: Record<string, string>): string[] {
  const flagged: string[] = [];
  for (const [path, content] of Object.entries(files)) {
    if (path === UNIVERSAL_ACCOUNT_MODULE_PATH) continue;
    if (/new\s+UniversalAccount\s*\(/.test(content)) flagged.push(path);
  }
  return flagged;
}
