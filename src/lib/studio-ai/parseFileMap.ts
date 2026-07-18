// Parses the AI Builder's multi-file output protocol (see agentPrompt.ts):
//
//   ### FILE: src/App.tsx
//   ```tsx
//   ...full file content...
//   ```
//
// repeated per file, terminated by a trailing `@@DONE` line. This is a text
// protocol (not real tool-calling) — the same mechanism DevStation's
// useCodeAgent.ts uses for its single-directive-line Solidity loop, adapted
// here for N files instead of one trailing directive.
export function parseFileMap(text: string): Record<string, string> {
  const files: Record<string, string> = {};
  const body = text.split(/\n@@DONE\b/)[0];

  const fileHeaderRe = /###\s*FILE:\s*(\S+)\s*\n```[a-zA-Z0-9]*\n/g;
  const matches = [...body.matchAll(fileHeaderRe)];

  for (const m of matches) {
    const path = m[1];
    const contentStart = m.index! + m[0].length;
    const closeIdx = body.indexOf("\n```", contentStart);
    const content = body.slice(contentStart, closeIdx === -1 ? body.length : closeIdx);
    files[path] = content;
  }

  return files;
}

/** True once a `@@DONE` line has actually arrived (vs. mid-stream). */
export function isGenerationComplete(text: string): boolean {
  return /\n@@DONE\b/.test(text) || /^@@DONE\b/.test(text.trim());
}

// Everything the model wrote OUTSIDE the file blocks — its plan before the
// files and closing note after (see agentPrompt.ts's "Output protocol")
// — shown to the user as real chat narration instead of being discarded.
// Uses a single-block regex rather than parseFileMap's index-based scan
// since this is display-only (never feeds actual file content anywhere).
export function extractProse(text: string): string {
  const body = text.split(/\n@@DONE\b/)[0];
  const withoutFiles = body
    .replace(/###\s*FILE:\s*\S+\s*\n```[a-zA-Z0-9]*\n[\s\S]*?\n```/g, "")
    .replace(/^###\s*SUGGESTED_NAME:.*$/m, "")
    .replace(/\n{3,}/g, "\n\n");
  return withoutFiles.trim();
}

/** Pulls the model's `### SUGGESTED_NAME: <name>` line (see agentPrompt.ts —
 *  only emitted when the caller told it the project name is still unset).
 *  Returns null if absent. */
export function extractSuggestedName(text: string): string | null {
  const m = text.match(/^###\s*SUGGESTED_NAME:\s*(.+)$/m);
  if (!m) return null;
  // Keep it filesystem/URL-friendly, matching how projectName is used
  // elsewhere (GitHub repo name, Vercel/Netlify project name).
  const name = m[1]
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return name || null;
}
