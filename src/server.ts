import fs from "node:fs";
import path from "node:path";
import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

// Load .env.local's server-only vars (ZG_API_KEY, AI_PROVIDER,
// GITHUB_OAUTH_CLIENT_SECRET, ...) into process.env here too, not just in
// vite.config.ts. Confirmed live that the two don't share a process.env:
// vite.config.ts's own process.loadEnvFile() call demonstrably sets
// process.env.AI_PROVIDER within its own module scope, but /api/ai's server
// fn handler (which reads process.env at request time) still saw it as
// unset — this dev server's SSR/server-fn execution runs in a separate
// context from vite.config.ts's, so a mutation made there doesn't propagate
// here. This file is the actual per-request entry every server fn call goes
// through, so loading it here reaches whatever context really executes
// them. Guarded/no-throw: production hosts inject real env vars directly
// and don't ship a .env.local file.
try {
  const envLocalPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envLocalPath)) process.loadEnvFile(envLocalPath);
} catch {
  /* best-effort; real deployments provide env vars directly */
}

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
