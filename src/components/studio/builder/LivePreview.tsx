import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  TerminalSquare,
} from "lucide-react";
import { bundleForPreview } from "@/lib/studio-ai/livePreviewBundler";
import { TerminalOutput, type TerminalLine } from "@/components/shared/TerminalOutput";
import { cn } from "@/lib/utils";

interface Props {
  files: Record<string, string>;
  entry?: string;
}

// Neutralizes a closing tag sequence so injecting arbitrary bundled JS/CSS
// into an HTML <script>/<style> block can't have the HTML parser terminate
// the tag early. Standard, well-known technique — safe because none of the
// generated app code has any legitimate reason to contain a literal
// "</script"/"</style" substring outside of a string, and even there this
// only inserts a backslash, which doesn't change runtime behavior.
function escapeClosingTag(code: string, tag: string): string {
  return code.replace(new RegExp(`</${tag}`, "gi"), `<\\/${tag}`);
}

function packageSpecParts(spec: string): { pkg: string; subpath: string } {
  const isScoped = spec.startsWith("@");
  const firstSlash = spec.indexOf("/");
  if (!isScoped) {
    return firstSlash === -1
      ? { pkg: spec, subpath: "" }
      : { pkg: spec.slice(0, firstSlash), subpath: spec.slice(firstSlash) };
  }
  const secondSlash = spec.indexOf("/", firstSlash + 1);
  return secondSlash === -1
    ? { pkg: spec, subpath: "" }
    : { pkg: spec.slice(0, secondSlash), subpath: spec.slice(secondSlash) };
}

function versionFor(pkg: string, packageJsonRaw?: string): string | undefined {
  if (!packageJsonRaw) return undefined;
  try {
    const pkgJson = JSON.parse(packageJsonRaw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const v = pkgJson.dependencies?.[pkg] ?? pkgJson.devDependencies?.[pkg];
    return typeof v === "string" ? v.replace(/^[~^]/, "") : undefined;
  } catch {
    return undefined;
  }
}

// Scans the bundled output for the npm-package imports esbuild left external,
// and maps each to esm.sh (pinned to the generated project's own
// package.json version when known) — a browser-native import map, no bundler
// needed for third-party packages.
function buildImportMap(js: string, packageJsonRaw?: string): string {
  const specs = new Set<string>();
  const re = /\bfrom\s*["']([^"'./][^"']*)["']|(?:^|[\s;])import\s*["']([^"'./][^"']*)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(js))) {
    const spec = m[1] ?? m[2];
    if (spec) specs.add(spec);
  }
  const imports: Record<string, string> = {};
  for (const spec of specs) {
    const { pkg, subpath } = packageSpecParts(spec);
    const version = versionFor(pkg, packageJsonRaw);
    imports[spec] = `https://esm.sh/${pkg}${version ? `@${version}` : ""}${subpath}`;
  }
  return JSON.stringify({ imports });
}

function buildPreviewDocument(js: string, css: string, packageJsonRaw?: string): string {
  const importMap = buildImportMap(js, packageJsonRaw);
  const safeJs = escapeClosingTag(js, "script");
  const safeCss = escapeClosingTag(css, "style");
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>body{margin:0;font-family:system-ui,-apple-system,sans-serif;}${safeCss}</style>
<script type="importmap">${importMap}</script>
</head>
<body>
<div id="root"></div>
<script>
window.addEventListener("error", (e) => {
  parent.postMessage({ source: "cruz-live-preview", type: "error", message: String((e.error && e.error.message) || e.message) }, "*");
});
window.addEventListener("unhandledrejection", (e) => {
  parent.postMessage({ source: "cruz-live-preview", type: "error", message: String((e.reason && e.reason.message) || e.reason) }, "*");
});
</script>
<script type="module">
${safeJs}
</script>
</body>
</html>`;
}

/**
 * Renders the AI Builder's generated app for real — bundled client-side with
 * esbuild-wasm (local files only; npm packages resolve via a browser import
 * map against esm.sh), then loaded into a `sandbox="allow-scripts"` iframe
 * with NO `allow-same-origin`. That combination gives the generated code a
 * real DOM to render into while keeping it in a fully isolated opaque
 * origin — it cannot read CRUZ's cookies, localStorage, or parent DOM, even
 * though nothing here has been reviewed by a human yet. `postMessage` still
 * works across that boundary (it isn't gated by `allow-same-origin`), which
 * is how runtime errors surface below without weakening the sandbox.
 */
export function LivePreview({ files, entry = "src/main.tsx" }: Props) {
  const [srcDoc, setSrcDoc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [log, setLog] = useState<TerminalLine[]>([]);
  const [logOpen, setLogOpen] = useState(true);

  const filesKey = useMemo(() => JSON.stringify(files), [files]);

  useEffect(() => {
    if (Object.keys(files).length === 0) {
      setSrcDoc(null);
      return;
    }
    let cancelled = false;
    setBuilding(true);
    setError(null);
    setRuntimeError(null);

    const fileCount = Object.keys(files).length;
    const appendLog = (line: TerminalLine) => {
      if (!cancelled) setLog((prev) => [...prev, line]);
    };
    setLog([{ text: `$ resolving ${fileCount} project file(s)`, status: "info" }]);
    appendLog({
      text: `$ esbuild --bundle ${entry} (esbuild-wasm, in-browser)`,
      status: "pending",
    });

    const startedAt = performance.now();
    bundleForPreview(files, entry)
      .then(({ js, css }) => {
        if (cancelled) return;
        const ms = Math.round(performance.now() - startedAt);
        const kb = ((js.length + css.length) / 1024).toFixed(1);
        appendLog({ text: `✓ bundled in ${ms}ms (${kb} KB)`, status: "success" });
        const externalCount = (js.match(/\bfrom\s*["'][^"'./][^"']*["']/g) ?? []).length;
        if (externalCount > 0) {
          appendLog({
            text: `$ mapping ${externalCount} package import(s) to esm.sh`,
            status: "info",
          });
        }
        appendLog({ text: "✓ preview ready", status: "success" });
        setSrcDoc(buildPreviewDocument(js, css, files["package.json"]));
      })
      .catch((e) => {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : "Bundling failed.";
        appendLog({ text: `✗ ${message}`, status: "error" });
        setError(message);
      })
      .finally(() => {
        if (!cancelled) setBuilding(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesKey, entry, nonce]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.source === "cruz-live-preview" && e.data.type === "error") {
        setRuntimeError(String(e.data.message));
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (Object.keys(files).length === 0) {
    return (
      <div className="flex h-full items-center justify-center font-mono text-xs text-meta">
        Nothing to preview yet.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Live Preview
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setLogOpen((o) => !o)}
            className="flex items-center gap-1 rounded p-1 text-meta hover:text-foreground"
            title={logOpen ? "Hide build log" : "Show build log"}
          >
            <TerminalSquare className="h-3 w-3" />
            {logOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          <button
            onClick={() => setNonce((n) => n + 1)}
            disabled={building}
            className="rounded p-1 text-meta hover:text-foreground disabled:opacity-40"
            title="Rebuild preview"
          >
            <RefreshCw className={cn("h-3 w-3", building && "animate-spin")} />
          </button>
        </div>
      </div>
      {logOpen && log.length > 0 && (
        <TerminalOutput
          lines={log}
          instant
          className="max-h-28 overflow-y-auto rounded-none border-x-0 border-t-0 text-[10px]"
        />
      )}
      {building && (
        <div className="flex items-center gap-2 px-3 py-2 font-mono text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Bundling…
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 border-b border-destructive/40 bg-destructive/5 px-3 py-2 font-mono text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="whitespace-pre-wrap break-all">{error}</span>
        </div>
      )}
      {runtimeError && (
        <div className="flex items-start gap-2 border-b border-warning/40 bg-warning/10 px-3 py-2 font-mono text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="whitespace-pre-wrap break-all">Runtime error: {runtimeError}</span>
        </div>
      )}
      {srcDoc && (
        <iframe
          key={nonce}
          title="AI Builder live preview"
          srcDoc={srcDoc}
          sandbox="allow-scripts"
          className="flex-1 border-0 bg-white"
        />
      )}
    </div>
  );
}
