import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Powers the "Check health" action on My Projects (src/routes/projects.tsx):
// a lightweight, no-auth check of whether any pinned dependency is now a
// major version (or more) behind the registry's latest — not a real
// vulnerability/advisory scan (that would need a registry with that data,
// e.g. the npm audit API or a paid advisory feed), just a cheap signal that
// something drifted since the app was generated. registry.npmjs.org is a
// fixed, trusted host (not user input), so this doesn't need the SSRF
// hardening inspect.functions.ts has for arbitrary user-supplied URLs.

function registryUrl(name: string): string {
  if (name.startsWith("@")) {
    const [scope, pkg] = name.slice(1).split("/");
    return `https://registry.npmjs.org/@${encodeURIComponent(scope)}%2F${encodeURIComponent(pkg ?? "")}`;
  }
  return `https://registry.npmjs.org/${encodeURIComponent(name)}`;
}

function majorOf(version: string): number | null {
  const cleaned = version.replace(/^[~^=vV\s]+/, "");
  const major = Number.parseInt(cleaned.split(".")[0], 10);
  return Number.isFinite(major) ? major : null;
}

const input = z.object({ dependencies: z.record(z.string(), z.string()) });

export const checkDependencyVersions = createServerFn({ method: "POST" })
  .inputValidator(input)
  .handler(async ({ data }) => {
    const entries = Object.entries(data.dependencies);
    const outdated: string[] = [];

    await Promise.all(
      entries.map(async ([name, pinned]) => {
        const pinnedMajor = majorOf(pinned);
        if (pinnedMajor === null) return;
        try {
          const resp = await fetch(registryUrl(name), {
            headers: { accept: "application/json" },
          });
          if (!resp.ok) return;
          const json = (await resp.json()) as { "dist-tags"?: { latest?: string } };
          const latest = json["dist-tags"]?.latest;
          if (!latest) return;
          const latestMajor = majorOf(latest);
          if (latestMajor !== null && latestMajor > pinnedMajor) {
            outdated.push(`${name} (pinned ${pinned}, latest ${latest})`);
          }
        } catch {
          /* best-effort — a registry hiccup shouldn't fail the whole check */
        }
      }),
    );

    return { ok: true as const, outdatedDeps: outdated };
  });
