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
      // GitHub may normalize the requested name (e.g. stripping characters) —
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

    // One "create file" call per file, a few in flight at once — bounded
    // concurrency cuts wall-clock delivery time for larger templates without
    // tripping GitHub's secondary rate limits the way full parallelism could.
    const FILE_PUSH_CONCURRENCY = 4;
    const entries = Object.entries(files);
    let cursor = 0;
    const state: { failure: { message: string } | null } = { failure: null };

    async function pushOne(path: string, content: string) {
      // Encode each path segment individually — encoding the whole path
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
          // The scaffolded template is a plain Vite app (`vite build` → `dist/`,
          // see studio-templates/unifiedWallet.ts's package.json/vite.config.ts).
          // `framework: null` with no build step would ship raw, unbundled
          // `.tsx` that no browser can execute — set Vercel's Vite preset
          // explicitly (and back it with explicit commands, since zero-config
          // detection isn't guaranteed on Files-API deployments the way it is
          // for git-based imports).
          projectSettings: {
            framework: "vite",
            buildCommand: "npm run build",
            outputDirectory: "dist",
            installCommand: "npm install",
          },
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

// ---- Netlify: deploy the generated files -----------------------------------
//
// Netlify's deploy API is a two-step "file digest" flow (see
// docs.netlify.com/deploy/create-deploys): create a deploy by sending a map
// of path -> SHA1, Netlify replies with which hashes it doesn't already have
// (`required`), then each of those files' raw content is PUT individually.
// SHA1 here is content-addressing for Netlify's CDN dedup, not a security
// hash — Web Crypto's subtle.digest covers it with no new dependency.

const netlifyInput = z.object({
  token: z.string().min(1),
  siteName: z.string().min(1),
  files: filesSchema,
});

async function sha1Hex(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function netlifyHeaders(token: string, contentType?: string) {
  const h: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (contentType) h["Content-Type"] = contentType;
  return h;
}

export const deployToNetlify = createServerFn({ method: "POST" })
  .inputValidator(netlifyInput)
  .handler(async ({ data }) => {
    const { token, siteName, files } = data;

    // 1. Create the site. If the requested subdomain is taken, retry once
    // letting Netlify auto-assign a name rather than failing outright.
    let siteId: string;
    let siteUrl: string;
    try {
      let createResp = await fetch("https://api.netlify.com/api/v1/sites", {
        method: "POST",
        headers: netlifyHeaders(token, "application/json"),
        body: JSON.stringify({ name: siteName }),
      });
      if (!createResp.ok) {
        createResp = await fetch("https://api.netlify.com/api/v1/sites", {
          method: "POST",
          headers: netlifyHeaders(token, "application/json"),
          body: JSON.stringify({}),
        });
      }
      if (!createResp.ok) {
        const body = await createResp.text().catch(() => "");
        return {
          ok: false as const,
          message: `Netlify site creation failed (${createResp.status}): ${body.slice(0, 300)}`,
        };
      }
      const created = (await createResp.json()) as { id: string; url?: string; ssl_url?: string };
      siteId = created.id;
      siteUrl = created.ssl_url ?? created.url ?? "";
    } catch (e) {
      return {
        ok: false as const,
        message: e instanceof Error ? e.message : "Site creation failed",
      };
    }

    // 2. Digest every file, keyed by its Netlify-required leading-slash path.
    const digestEntries = await Promise.all(
      Object.entries(files).map(async ([path, content]) => {
        const key = path.startsWith("/") ? path : `/${path}`;
        return [key, await sha1Hex(content)] as const;
      }),
    );
    const digestMap = Object.fromEntries(digestEntries);
    const hashToPath = new Map(digestEntries.map(([path, hash]) => [hash, path]));
    const pathToContent = new Map(
      Object.entries(files).map(([p, c]) => [p.startsWith("/") ? p : `/${p}`, c]),
    );

    let deployId: string;
    let required: string[];
    try {
      const deployResp = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/deploys`, {
        method: "POST",
        headers: netlifyHeaders(token, "application/json"),
        body: JSON.stringify({ files: digestMap }),
      });
      if (!deployResp.ok) {
        const body = await deployResp.text().catch(() => "");
        return {
          ok: false as const,
          message: `Netlify deploy creation failed (${deployResp.status}): ${body.slice(0, 300)}`,
        };
      }
      const deployJson = (await deployResp.json()) as { id: string; required?: string[] };
      deployId = deployJson.id;
      required = deployJson.required ?? [];
    } catch (e) {
      return {
        ok: false as const,
        message: e instanceof Error ? e.message : "Deploy creation failed",
      };
    }

    // 3. Upload exactly the files Netlify doesn't already have, a few at once.
    const UPLOAD_CONCURRENCY = 4;
    let cursor = 0;
    const state: { failure: string | null } = { failure: null };

    async function uploadOne(hash: string) {
      const path = hashToPath.get(hash);
      const content = path ? pathToContent.get(path) : undefined;
      if (!path || content === undefined) return;
      const encodedPath = path.split("/").map(encodeURIComponent).join("/");
      const resp = await fetch(
        `https://api.netlify.com/api/v1/deploys/${deployId}/files${encodedPath}`,
        {
          method: "PUT",
          headers: netlifyHeaders(token, "application/octet-stream"),
          body: content,
        },
      );
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`Failed to upload ${path} (${resp.status}): ${body.slice(0, 300)}`);
      }
    }

    async function worker() {
      while (cursor < required.length && !state.failure) {
        const hash = required[cursor++];
        try {
          await uploadOne(hash);
        } catch (e) {
          state.failure = e instanceof Error ? e.message : "Upload failed";
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(UPLOAD_CONCURRENCY, required.length) }, worker),
    );

    if (state.failure) {
      return { ok: false as const, message: state.failure, partialSiteUrl: siteUrl };
    }

    // 4. Short bounded poll for "ready" — Netlify usually finishes small
    // static deploys in a couple seconds; don't hold the request open
    // indefinitely if it doesn't (serverless functions have their own
    // execution-time limits), just report what state we last saw.
    let finalState = "uploaded";
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const statusResp = await fetch(`https://api.netlify.com/api/v1/deploys/${deployId}`, {
          headers: netlifyHeaders(token),
        });
        if (statusResp.ok) {
          const statusJson = (await statusResp.json()) as { state?: string };
          finalState = statusJson.state ?? finalState;
          if (finalState === "ready") break;
        }
      } catch {
        /* keep last known state, not fatal */
      }
    }

    return { ok: true as const, url: siteUrl || null, deployId, state: finalState };
  });
