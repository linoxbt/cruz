import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Module 3 (Starter App Scaffolder) delivery paths: push the generated files
// to a new GitHub repo, and/or deploy them to Vercel. Both need a genuinely
// server-side step (the user's token must never reach the client bundle logs
// or be persisted), so — matching explorer.functions.ts/verify.functions.ts —
// these are plain-fetch createServerFns, no GitHub/Vercel SDK dependency.
//
// Tokens are passed once, per call, straight through to the provider API —
// never written to disk, a database, or logs on this server.

const filesSchema = z.record(z.string(), z.string());

// Web-standard base64 (works under Node, Vercel/Netlify functions, and edge
// runtimes alike) rather than Node's Buffer, matching the rest of this file's
// plain-fetch, no-Node-specific-API style.
function toBase64(content: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(content)));
}

// ---- GitHub: create a repo and push the generated files -------------------

const githubInput = z.object({
  token: z.string().min(1),
  repoName: z.string().min(1),
  files: filesSchema,
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
    const { token, repoName, files } = data;

    let owner: string;
    let htmlUrl: string;
    try {
      const createResp = await fetch("https://api.github.com/user/repos", {
        method: "POST",
        headers: githubHeaders(token),
        body: JSON.stringify({ name: repoName, private: false, auto_init: false }),
      });
      if (!createResp.ok) {
        const body = await createResp.text().catch(() => "");
        return {
          ok: false as const,
          message: `GitHub repo creation failed (${createResp.status}): ${body.slice(0, 300)}`,
        };
      }
      const created = (await createResp.json()) as { owner: { login: string }; html_url: string };
      owner = created.owner.login;
      htmlUrl = created.html_url;
    } catch (e) {
      return {
        ok: false as const,
        message: e instanceof Error ? e.message : "Repo creation failed",
      };
    }

    // One "create file" call per file — simple and reliable for a template-sized
    // file set; no Git Data API tree/blob juggling needed at this scale.
    for (const [path, content] of Object.entries(files)) {
      try {
        const resp = await fetch(
          `https://api.github.com/repos/${owner}/${repoName}/contents/${path}`,
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
          return {
            ok: false as const,
            message: `Failed to push ${path} (${resp.status}): ${body.slice(0, 300)}`,
            partialRepoUrl: htmlUrl,
          };
        }
      } catch (e) {
        return {
          ok: false as const,
          message: e instanceof Error ? e.message : `Failed to push ${path}`,
          partialRepoUrl: htmlUrl,
        };
      }
    }

    return { ok: true as const, repoUrl: htmlUrl };
  });

// ---- Vercel: deploy the generated files ------------------------------------

const vercelInput = z.object({
  token: z.string().min(1),
  projectName: z.string().min(1),
  files: filesSchema,
});

export const deployToVercel = createServerFn({ method: "POST" })
  .inputValidator(vercelInput)
  .handler(async ({ data }) => {
    const { token, projectName, files } = data;
    try {
      const resp = await fetch("https://api.vercel.com/v13/deployments", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: projectName,
          target: "production",
          projectSettings: { framework: null },
          files: Object.entries(files).map(([file, content]) => ({ file, data: content })),
        }),
      });
      const text = await resp.text();
      if (!resp.ok) {
        return {
          ok: false as const,
          message: `Vercel deploy failed (${resp.status}): ${text.slice(0, 300)}`,
        };
      }
      const json = JSON.parse(text) as { url?: string; id?: string };
      return {
        ok: true as const,
        url: json.url ? `https://${json.url}` : null,
        deploymentId: json.id ?? null,
      };
    } catch (e) {
      return {
        ok: false as const,
        message: e instanceof Error ? e.message : "Deploy request failed",
      };
    }
  });
