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

/** The plain-prose reply for a conversational turn (see agentPrompt.ts's
 *  "is this actually a build request?" branch) — no ANALYSIS/PLAN/FILE
 *  sections, just an answer, terminated the same `@@DONE` way as any other
 *  turn. Strips that trailing marker so it isn't shown literally in the chat. */
export function extractConversationalReply(text: string): string {
  return text
    .split(/\n@@DONE\b/)[0]
    .replace(/^@@DONE\b/, "")
    .trim();
}

export interface McpCallRequest {
  server: string;
  tool: string;
  args: Record<string, unknown>;
  /** Index in `text` right after the parsed JSON args block ends — used to
   *  trim the partial reply before re-entering the turn with the result. */
  endIndex: number;
}

/** Detects a complete `### MCP_CALL: <server>.<tool>` block with its JSON
 *  args object (see agentPrompt.ts's "Tools available this session"
 *  section), once the JSON has actually finished streaming — brace-depth
 *  balanced, respecting string literals so a `{`/`}` inside a quoted value
 *  doesn't miscount. Returns null while still mid-stream, if no call marker
 *  is present, or if the JSON is malformed. Only the first call in the
 *  buffer is ever returned; agentRuntime.ts re-enters the turn after
 *  handling it, so a second call (if any) is naturally its own detection on
 *  the next round rather than something this needs to handle at once. */
export function extractMcpCall(text: string): McpCallRequest | null {
  const headerMatch = text.match(/###\s*MCP_CALL:\s*(\S+)\.(\S+)\s*\n/);
  if (!headerMatch) return null;
  const [header, server, tool] = headerMatch;
  const jsonStart = (headerMatch.index ?? 0) + header.length;
  const rest = text.slice(jsonStart);
  const firstBrace = rest.indexOf("{");
  if (firstBrace === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  let endIdx = -1;
  for (let i = firstBrace; i < rest.length; i++) {
    const ch = rest[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  if (endIdx === -1) return null; // still streaming

  const jsonText = rest.slice(firstBrace, endIdx + 1);
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    return null;
  }
  return { server, tool, args, endIndex: jsonStart + endIdx + 1 };
}

/** Pulls the model's `### SUGGESTED_NAME: <name>` line (see agentPrompt.ts —
 *  only emitted when the caller told it the project name is still unset).
 *  Returns null if absent. */
export function extractSuggestedName(text: string): string | null {
  const m = text.match(/^###\s*SUGGESTED_NAME:\s*(.+)$/m);
  if (!m) return null;
  // Keep it filesystem/URL-friendly, matching how projectName is used
  // elsewhere (as the GitHub repo name).
  const name = m[1]
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return name || null;
}
