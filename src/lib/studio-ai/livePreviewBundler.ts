// Main-thread wrapper around the esbuild-wasm bundler Worker. Mirrors
// compiler.ts's getWorker()/timeout pattern.

export interface BundleResult {
  js: string;
  css: string;
}

let nextId = 0;
let worker: Worker | null = null;

const BUNDLE_TIMEOUT_MS = 30_000;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./livePreviewBundler.worker.ts", import.meta.url), {
      type: "module",
    });
  }
  return worker;
}

export function bundleForPreview(
  files: Record<string, string>,
  entry: string,
): Promise<BundleResult> {
  const id = ++nextId;
  const w = getWorker();

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      w.removeEventListener("message", handler);
      w.terminate();
      worker = null;
      reject(new Error("Bundler timed out — the preview worker didn't respond in time."));
    }, BUNDLE_TIMEOUT_MS);

    const handler = (
      e: MessageEvent<{ id: number; ok: boolean; js?: string; css?: string; error?: string }>,
    ) => {
      if (e.data.id !== id) return;
      clearTimeout(timeoutId);
      w.removeEventListener("message", handler);

      if (!e.data.ok) {
        reject(new Error(e.data.error ?? "Bundling failed"));
        return;
      }
      resolve({ js: e.data.js ?? "", css: e.data.css ?? "" });
    };

    w.addEventListener("message", handler);
    w.postMessage({ id, files, entry });
  });
}
