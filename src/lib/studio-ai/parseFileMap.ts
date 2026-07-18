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

export interface AgentPlan {
  analysis: string;
  steps: string[];
}

/** Pulls the model's `### ANALYSIS` / `### PLAN` sections (see
 *  agentPrompt.ts — required before every turn's files, not just big ones)
 *  from the prefix before the first `### FILE:` marker. Only call this once
 *  that marker has actually appeared in the streamed text — by protocol
 *  everything before it is already complete at that point, so there's no
 *  risk of returning a plan that's still mid-sentence. Returns null if
 *  neither section is present (e.g. the model skipped the protocol). */
export function extractPlan(text: string): AgentPlan | null {
  const firstFileIdx = text.search(/###\s*FILE:/);
  const head = (
    firstFileIdx === -1 ? text.split(/\n@@DONE\b/)[0] : text.slice(0, firstFileIdx)
  ).replace(/^###\s*SUGGESTED_NAME:.*$/m, "");

  const analysisMatch = head.match(/###\s*ANALYSIS\s*\n([\s\S]*?)(?=\n###\s*PLAN\b|$)/i);
  const planMatch = head.match(/###\s*PLAN\s*\n([\s\S]*)$/i);

  const analysis = analysisMatch ? analysisMatch[1].trim() : "";
  const stepsBlock = planMatch ? planMatch[1].trim() : "";
  const steps = stepsBlock
    ? [...stepsBlock.matchAll(/^\s*\d+[.)]\s+(.+)$/gm)].map((m) => m[1].trim())
    : [];

  if (!analysis && steps.length === 0) return null;
  return { analysis, steps };
}

/** Everything the model wrote after its LAST file block — the closing note
 *  (see agentPrompt.ts) — shown as real chat narration instead of being
 *  discarded. Deliberately scoped to just the trailing note (not the leading
 *  analysis/plan, which extractPlan renders separately) so the two aren't
 *  shown twice. */
export function extractClosingNote(text: string): string {
  const body = text.split(/\n@@DONE\b/)[0];
  const fileBlockRe = /###\s*FILE:\s*\S+\s*\n```[a-zA-Z0-9]*\n[\s\S]*?\n```/g;
  const matches = [...body.matchAll(fileBlockRe)];
  if (matches.length === 0) return "";
  const last = matches[matches.length - 1];
  return body.slice(last.index! + last[0].length).trim();
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
