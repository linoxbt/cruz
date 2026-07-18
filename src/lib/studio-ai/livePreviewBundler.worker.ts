// Bundles the AI Builder's generated project files in-browser via esbuild-wasm
// — same pattern as compiler.worker.ts's in-browser solc (a WASM tool fetched
// once, then everything runs client-side), just a different tool for a
// different job (bundling TS/TSX instead of compiling Solidity).
//
// Local project files are resolved from the virtual file map the main thread
// sends over; npm-package imports (react, the Particle SDK, etc.) are left
// external — the preview HTML resolves those via a browser <script
// type="importmap"> pointing at a CDN, so this bundler only ever needs to
// understand the AI-generated project's own files.
import * as esbuild from "esbuild-wasm";
// Vite asset import: esbuild.wasm ships in the installed package and is
// served from CRUZ's own origin, not fetched from a third-party CDN.
import wasmURL from "esbuild-wasm/esbuild.wasm?url";

let initPromise: Promise<void> | null = null;
function ensureInitialized(): Promise<void> {
  if (!initPromise) initPromise = esbuild.initialize({ wasmURL });
  return initPromise;
}

function normalize(path: string): string {
  const stack: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

function resolveLocal(
  importer: string,
  importPath: string,
  files: Record<string, string>,
): string | null {
  const importerDir = importer.includes("/") ? importer.slice(0, importer.lastIndexOf("/")) : "";
  const base = normalize(importerDir ? `${importerDir}/${importPath}` : importPath);
  const candidates = [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    `${base}.jsx`,
    `${base}.js`,
    `${base}.css`,
    `${base}.json`,
    `${base}/index.tsx`,
    `${base}/index.ts`,
  ];
  for (const c of candidates) {
    if (files[c] !== undefined) return c;
  }
  return null;
}

const LOADERS: Record<string, esbuild.Loader> = {
  tsx: "tsx",
  ts: "ts",
  jsx: "jsx",
  js: "js",
  css: "css",
  json: "json",
};

function virtualFsPlugin(files: Record<string, string>): esbuild.Plugin {
  return {
    name: "cruz-virtual-fs",
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === "entry-point") return { path: args.path, namespace: "cruz-virtual" };
        if (args.path.startsWith(".")) {
          const resolved = resolveLocal(args.importer, args.path, files);
          if (resolved) return { path: resolved, namespace: "cruz-virtual" };
          return { errors: [{ text: `Cannot resolve "${args.path}" from "${args.importer}"` }] };
        }
        // Bare specifier (an npm package) — left external, resolved in the
        // browser by the preview HTML's import map.
        return { path: args.path, external: true };
      });
      build.onLoad({ filter: /.*/, namespace: "cruz-virtual" }, (args) => {
        const content = files[args.path];
        if (content === undefined) return { errors: [{ text: `Missing file: ${args.path}` }] };
        const ext = args.path.split(".").pop() ?? "";
        return { contents: content, loader: LOADERS[ext] ?? "text", resolveDir: "" };
      });
    },
  };
}

interface BundleRequest {
  id: number;
  files: Record<string, string>;
  entry: string;
}

self.addEventListener("message", async (e: MessageEvent<BundleRequest>) => {
  const { id, files, entry } = e.data;
  try {
    await ensureInitialized();
    const result = await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      format: "esm",
      jsx: "automatic",
      logLevel: "silent",
      plugins: [virtualFsPlugin(files)],
    });

    let js = "";
    let css = "";
    for (const f of result.outputFiles ?? []) {
      if (f.path.endsWith(".css")) css += f.text;
      else js += f.text;
    }
    self.postMessage({ id, ok: true, js, css });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err && "errors" in err
          ? JSON.stringify((err as { errors: unknown }).errors)
          : String(err);
    self.postMessage({ id, ok: false, error: message });
  }
});
