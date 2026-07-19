import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Module 3 (Starter App Scaffolder) delivery path: push the generated files
// to a new GitHub repo. Needs a genuinely server-side step (the user's token
// must never reach the client bundle logs or be persisted), so, matching
// explorer.functions.ts/verify.functions.ts, this is a plain-fetch
// createServerFn, no GitHub SDK dependency.
//
// The token is passed once, per call, straight through to the GitHub API,
// never written to disk, a database, or logs on this server.

const filesSchema = z.record(z.string(), z.string());

// Web-standard base64 (works under Node, edge runtimes, and any serverless
// host alike) rather than Node's Buffer, matching the rest of this file's
// plain-fetch, no-Node-specific-API style.
function toBase64(content: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(content)));
}

// ---- GitHub: create a repo and push the generated files -------------------

const githubInput = z.object({
  token: z.string().min(1),
  repoName: z.string().min(1),
  files: filesSchema,
  // Defaults to private: a starter app embeds the user's chosen project name
  // and (optionally) wallet-provider config, so an accidental public repo is
  // the worse default. The UI lets the user opt into a public repo instead.
  private: z.boolean().optional(),
});

function githubHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

export const pushToGithubRepo = createServerFn({ method: "POST" })
  .inputValidator(githubInput)
  .handler(async ({ data }) => {
    const { token, repoName, files, private: isPrivate = true } = data;

    let owner: string;
    let name: string;
    let htmlUrl: string;
    try {
      const createResp = await fetch("https://api.github.com/user/repos", {
        method: "POST",
        headers: githubHeaders(token),
        body: JSON.stringify({ name: repoName, private: isPrivate, auto_init: false }),
      });
      if (!createResp.ok) {
        const body = await createResp.text().catch(() => "");
        return {
          ok: false as const,
          message: `GitHub repo creation failed (${createResp.status}): ${body.slice(0, 300)}`,
        };
      }
      const created = (await createResp.json()) as {
        name: string;
        owner: { login: string };
        html_url: string;
      };
      owner = created.owner.login;
      // GitHub may normalize the requested name (e.g. stripping characters),
      // use the canonical name it actually created, not the raw client input,
      // for every subsequent call, or a normalized name 404s every file push.
      name = created.name;
      htmlUrl = created.html_url;
    } catch (e) {
      return {
        ok: false as const,
        message: e instanceof Error ? e.message : "Repo creation failed",
      };
    }

    // One "create file" call per file, a few in flight at once, bounded
    // concurrency cuts wall-clock delivery time for larger templates without
    // tripping GitHub's secondary rate limits the way full parallelism could.
    const FILE_PUSH_CONCURRENCY = 4;
    const entries = Object.entries(files);
    let cursor = 0;
    const state: { failure: { message: string } | null } = { failure: null };

    async function pushOne(path: string, content: string) {
      // Encode each path segment individually, encoding the whole path
      // would also escape the `/` directory separators GitHub's contents
      // API expects literally.
      const encodedPath = path.split("/").map(encodeURIComponent).join("/");
      const resp = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents/${encodedPath}`,
        {
          method: "PUT",
          headers: githubHeaders(token),
          body: JSON.stringify({
            message: `Add ${path}`,
            content: toBase64(content),
          }),
        },
      );
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`Failed to push ${path} (${resp.status}): ${body.slice(0, 300)}`);
      }
    }

    async function worker() {
      while (cursor < entries.length && !state.failure) {
        const [path, content] = entries[cursor++];
        try {
          await pushOne(path, content);
        } catch (e) {
          state.failure = { message: e instanceof Error ? e.message : `Failed to push ${path}` };
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(FILE_PUSH_CONCURRENCY, entries.length) }, worker),
    );

    if (state.failure) {
      return { ok: false as const, message: state.failure.message, partialRepoUrl: htmlUrl };
    }
    return { ok: true as const, repoUrl: htmlUrl };
  });
