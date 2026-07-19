// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Load .env.local into process.env for EVERY var, not just VITE_-prefixed
// ones. @lovable.dev/vite-tanstack-config's own env handling calls Vite's
// loadEnv(mode, cwd, "VITE_") — that third argument means it only ever loads
// VITE_-prefixed vars into import.meta.env. Server-only vars (ZG_API_KEY,
// AI_PROVIDER, ANTHROPIC_API_KEY, GITHUB_OAUTH_CLIENT_SECRET, MCP_SERVERS,
// ...) never reach process.env any other way — confirmed live: GET /api/ai
// returned {"configured":false} despite .env.local having a real
// AI_PROVIDER/ZG_API_KEY, because the dev server was started via a bare
// `node .../vite dev` rather than `bun run dev` (only Bun auto-loads the
// full .env.local into process.env; a plain node/npm invocation doesn't).
// Loading it explicitly here makes this robust to how the process is
// actually started, instead of silently depending on it. Guarded: real
// hosts (Vercel/Netlify/etc) inject env vars directly and don't ship a
// .env.local file, and process.loadEnvFile() throws on a missing path.
// Node's loadEnvFile never overrides a var that's already set in
// process.env, so this can't clobber a real platform-injected value.
const envLocalPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  process.loadEnvFile(envLocalPath);
}

// Deploy target selection.
//
// The Lovable config defaults to the Cloudflare Workers preset, whose output
// layout neither Vercel nor Netlify can serve as an SSR app — the static client
// is served but the SSR server isn't wired as a function, so deep links and
// refreshes 404 and pages don't render.
//
// We auto-detect the host from its build-time env var and pick the matching
// Nitro preset, which emits that host's expected output (static assets + an SSR
// function with a catch-all route for every path). Set NITRO_PRESET to override
// (e.g. "node-server", "cloudflare-module", "bun") for self-hosting.
const env = process.env;
const preset =
  env.NITRO_PRESET ||
  (env.NETLIFY ? "netlify" : undefined) ||
  (env.VERCEL ? "vercel" : undefined) ||
  // Default for manual/local production builds. Change if your primary host differs.
  "vercel";

export default defineConfig({
  nitro: { preset },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Local-only: allow the cloudflared quick-tunnel hostname through Vite's dev
  // server Host-header check so the mobile-preview tunnel can reach it.
  vite: {
    server: { allowedHosts: true },
    // @particle-network/universal-account-sdk ships pre-minified, and its
    // UniversalAccount constructor unconditionally reads
    // `process.env.UNIVERSAL_ACCOUNT_VERSION` as a default-value expression
    // inside an object literal — evaluated eagerly every time, even though
    // CRUZ always overrides `version` explicitly afterward (see
    // universalAccountInit.ts/particle.ts). `process` doesn't exist in a
    // browser bundle, so every `new UniversalAccount(...)` threw
    // "process is not defined" the instant it ran in a real browser — the
    // dashboard's balance card was just the first place that actually
    // exercised this path.
    //
    // Defining the dotted key "process.env" does NOT fix this: the SDK's own
    // minifier rewrote the access to computed bracket notation
    // (`process[t(349)]`, `t(349)` resolving to "env" via an internal string
    // table at runtime), and esbuild's `define` only rewrites literal dotted
    // identifier chains (`process.env.FOO` written as such in source) — it
    // can't see through a computed property lookup. Confirmed by rebuilding
    // with only the dotted define and re-grepping the output bundle
    // (`.vercel/output/static/assets/particle-*.js`): the bare `process[`
    // reference was still there, byte-for-byte unchanged.
    //
    // Defining the bare identifier `process` instead works regardless of how
    // it's subscripted afterward, because esbuild's define replaces every
    // free reference to the identifier itself, not a specific access chain —
    // `process[t(349)]` becomes `{"env":{}}[t(349)]`, which safely evaluates
    // to `undefined` instead of throwing, and the SDK's own `||` fallback
    // then supplies its hardcoded default (CRUZ's explicit override still
    // wins either way).
    //
    // CRITICAL: this must be scoped to the CLIENT environment only, not a
    // top-level `define` (which applies to every environment, including the
    // SSR/server-fn build). A top-level define was the actual root cause of
    // the AI Builder being "unresponsive"/"failed to fetch": every server
    // function (api.ai.ts, api.oauth.github.callback.ts, studio.functions.ts,
    // ...) reads real env vars via `process.env.X`, and esbuild's define does
    // a blind textual substitution of every free `process` reference — so
    // `process.env.ZG_API_KEY` in SERVER code was ALSO being rewritten to
    // `({env:{}}).env.ZG_API_KEY` (always undefined) at build time, no matter
    // what was actually in the environment. Confirmed live: GET /api/ai
    // returned {"configured":false} with a real ZG_API_KEY set, and a direct
    // diagnostic inside api.ai.ts's handler threw
    // `TypeError: define_process_default.cwd is not a function` — proof
    // `process` itself had been replaced by the define's plain object literal
    // in that execution context. `environments.client` (Vite's per-environment
    // config, already used one line below by the base config for its own
    // NODE_ENV define) scopes this to the browser bundle only, leaving every
    // server-side `process.env` read genuinely reading the real environment.
    environments: {
      client: { define: { process: JSON.stringify({ env: {} }) } },
    },
  },
});
