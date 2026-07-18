import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Code2,
  FilePlus,
  FolderPlus,
  Folder,
  FolderInput,
  GripHorizontal,
  Play,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { ClientOnly } from "@/components/shared/ClientOnly";
import { SolidityEditor } from "@/components/editor/SolidityEditor";
import { EditorTerminal } from "@/components/editor/EditorTerminal";
import { FileTree } from "@/components/editor/FileTree";
import { useWorkspace } from "@/hooks/useWorkspace";
import { compile, type CompileOutput, type CompileError, SOLC_VERSIONS, DEFAULT_SOLC_VERSION } from "@/lib/compiler";
import { useEditorIntake } from "@/lib/editor-intake";
import type { TerminalLine } from "@/components/shared/TerminalOutput";

// CRUZ contract editor. Reuses the generic SolidityEditor component and
// compiler.ts's compile() (both mode-agnostic, unchanged by this workspace
// port — compiler.ts already accepts a multi-file sources map, this route
// just now feeds it one). Edit + compile only, no deploy step — CRUZ doesn't
// ship a full deploy pipeline, just a way to review the demo/generated
// contracts the Scaffolder produces.
export const Route = createFileRoute("/editor")({
  head: () => ({ meta: [{ title: "Contract Editor — CRUZ" }] }),
  component: EditorPage,
});

function EditorPage() {
  const ws = useWorkspace();

  // One-shot: pick up a pending "Open in Editor" hand-off (e.g. the
  // Scaffolder's demo contract) if present.
  const consumeIntake = useEditorIntake((s) => s.consume);
  useEffect(() => {
    const pending = consumeIntake();
    if (pending) {
      const path = pending.filename.includes("/") ? pending.filename : `contracts/${pending.filename}`;
      ws.setContent(path, pending.content);
      ws.openFile(path);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [version, setVersion] = useState(DEFAULT_SOLC_VERSION);
  const [autoCompile, setAutoCompile] = useState(true);
  const [compiling, setCompiling] = useState(false);
  const [lastResult, setLastResult] = useState<CompileOutput | null>(null);
  const [terminalHeight, setTerminalHeight] = useState(220);
  const [terminalCollapsed, setTerminalCollapsed] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [lines, setLines] = useState<TerminalLine[]>(() => [
    { text: "[CRUZ] Editor ready.", status: "success" },
    { text: "[CRUZ] Open a .sol file to edit. Auto-compile runs 800ms after you stop typing.", status: "pending" },
  ]);

  const dragRef = useRef<number | null>(null);
  const activeSol = ws.activePath.endsWith(".sol") ? ws.activeContent : "";

  function logT(line: TerminalLine) {
    setLines((p) => [...p, line]);
  }

  const runCompile = useCallback(
    async (source?: string) => {
      const src = source ?? activeSol;
      if (!src.trim()) return;
      setCompiling(true);
      const ts = new Date().toLocaleTimeString();
      logT({ text: `[${ts}] [Compiler] Compiling ${ws.activePath} with solc ${version}...`, status: "pending" });
      try {
        const sources: Record<string, string> = {};
        for (const f of ws.solFiles) sources[f.path] = f.content;
        const result = await compile({
          sources,
          version,
          mainFile: ws.activePath,
          optimize: false,
          optimizerRuns: 200,
        });
        setLastResult(result);

        for (const imp of result.resolvedImports) {
          logT({ text: `[${ts}] [Compiler] ✓ Resolved ${imp.path} via CDN (OpenZeppelin v5.0.2)`, status: "success" });
        }
        for (const bad of result.importErrors) {
          logT({ text: `[${ts}] [Error] Failed to resolve import: ${bad}`, status: "error" });
          logT({
            text: `[${ts}] [Hint] Check the path matches OpenZeppelin v5.0.2 exactly (case-sensitive). Browse: github.com/OpenZeppelin/openzeppelin-contracts/tree/v5.0.2/contracts`,
            status: "warning",
          });
        }

        if (result.status === "error") {
          for (const err of result.errors) {
            logT({ text: `[${ts}] [Error] ${err.formattedMessage}`, status: "error" });
          }
        } else {
          const count = Object.keys(result.contracts).length;
          logT({
            text: `[${ts}] [Compiler] ✓ Compiled successfully — ${count} contract${count !== 1 ? "s" : ""} (${result.timeMs}ms)`,
            status: "success",
          });
          for (const w of result.warnings) {
            logT({ text: `[${ts}] [Warning] ${w.formattedMessage}`, status: "warning" });
          }
        }
      } catch (err) {
        logT({ text: `[${ts}] [Error] ${err instanceof Error ? err.message : "Compilation failed"}`, status: "error" });
      } finally {
        setCompiling(false);
      }
    },
    [activeSol, ws.activePath, ws.solFiles, version],
  );

  // Auto-compile on content change (debounced 800ms).
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!autoCompile || !activeSol.trim()) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runCompile(activeSol), 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [activeSol, autoCompile, runCompile]);

  // Terminal resize drag.
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragRef.current = e.clientY;
    const onMove = (ev: PointerEvent) => {
      if (dragRef.current === null) return;
      const delta = dragRef.current - ev.clientY;
      setTerminalHeight((h) => Math.min(Math.max(h + delta, 80), window.innerHeight * 0.6));
      dragRef.current = ev.clientY;
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);
  const resetTermHeight = () => setTerminalHeight(220);
  const clearTerminal = () => setLines([]);

  // Interactive terminal command set (Remix-like) — drives the same actions
  // as the toolbar without leaving the keyboard. No `deploy`: CRUZ's editor
  // deliberately has no deploy step (see README/route comment above), so
  // that command gets an explicit, on-brand message instead of either
  // silently doing nothing or erroring as unrecognized.
  const runTerminalCommand = useCallback(
    (raw: string) => {
      const ts = new Date().toLocaleTimeString();
      logT({ text: `[${ts}] > ${raw}` });
      const [name, ...rest] = raw.trim().split(/\s+/);
      const arg = rest.join(" ");
      const print = (text: string, status?: TerminalLine["status"]) => logT({ text, status });

      switch (name.toLowerCase()) {
        case "help":
          print("Commands:");
          print("  compile             Compile the active contract");
          print("  solc <version>      Set the solc version (e.g. solc 0.8.20)");
          print("  solc                Show the current solc version");
          print("  versions            List available solc versions");
          print("  ls | files          List workspace files");
          print("  cat <path>          Print a file's contents");
          print("  open <path>         Open a file in the editor");
          print("  active              Show the active file");
          print("  deploy              Why there's no deploy command here");
          print("  clear               Clear the terminal");
          break;
        case "clear":
          clearTerminal();
          break;
        case "compile":
          void runCompile();
          break;
        case "solc":
        case "version":
          if (!arg) {
            print(`solc ${version}`);
          } else if ((SOLC_VERSIONS as readonly string[]).includes(arg)) {
            setVersion(arg);
            print(`[Compiler] solc set to ${arg}`, "success");
          } else {
            print(`Unknown solc version "${arg}". Try: versions`, "error");
          }
          break;
        case "versions":
          print((SOLC_VERSIONS as readonly string[]).join("  "));
          break;
        case "ls":
        case "files":
          if (ws.solFiles.length === 0) print("(no .sol files)");
          for (const f of ws.solFiles) print(`  ${f.path}`);
          break;
        case "active":
          print(ws.activePath || "(none)");
          break;
        case "cat": {
          if (!arg) return print("usage: cat <path>", "warning");
          const file = ws.solFiles.find((f) => f.path === arg);
          if (!file) return print(`No such file: ${arg}`, "error");
          for (const ln of file.content.split("\n")) print(ln);
          break;
        }
        case "open": {
          if (!arg) return print("usage: open <path>", "warning");
          if (!ws.solFiles.some((f) => f.path === arg)) return print(`No such file: ${arg}`, "error");
          ws.openFile(arg);
          print(`Opened ${arg}`, "success");
          break;
        }
        case "deploy":
          print(
            "CRUZ's Contract Editor has no deploy step by design — see the README. Use the Scaffolder's GitHub/Vercel delivery for a runnable app, or your own toolchain to deploy this contract.",
            "warning",
          );
          break;
        default:
          print(`Unknown command: ${name}. Type "help".`, "error");
      }
    },
    [runCompile, version, ws],
  );

  const diagnostics: CompileError[] = useMemo(() => {
    if (!lastResult) return [];
    return [...lastResult.errors, ...lastResult.warnings].filter((e) => e.sourceLocation);
  }, [lastResult]);

  // ── File explorer operations ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const newFileIn = (dir: string) => {
    const name = window.prompt("New file name", "Untitled.sol");
    if (!name) return;
    ws.addFile(dir ? `${dir}/${name}` : name);
  };
  const newFolderIn = (dir: string) => {
    const name = window.prompt("New folder name", "new-folder");
    if (!name) return;
    ws.addFolder(dir ? `${dir}/${name}` : name);
  };
  const renamePath = (path: string) => {
    const cur = path.split("/").pop() ?? path;
    const name = window.prompt("Rename to", cur);
    if (!name || name === cur) return;
    const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    ws.renameFile(path, parent ? `${parent}/${name}` : name);
  };
  const deletePath = (path: string, isDir: boolean) => {
    if (window.confirm(`Delete ${isDir ? "folder" : "file"} "${path}" and its contents?`)) {
      ws.deleteFile(path);
    }
  };
  const onImport = async (list: FileList | null, asFolder: boolean) => {
    if (!list || list.length === 0) return;
    const entries: Array<{ path: string; content: string }> = [];
    for (const f of Array.from(list)) {
      if (f.size > 1_000_000) continue; // text-only editor, skip obvious binaries
      const rel = (asFolder ? (f as File & { webkitRelativePath?: string }).webkitRelativePath : "") || f.name;
      entries.push({ path: rel, content: await f.text() });
    }
    if (entries.length) {
      ws.importEntries(entries);
      toast.success(`Imported ${entries.length} file${entries.length !== 1 ? "s" : ""}`);
    }
  };

  return (
    <div>
      <PageHeader
        breadcrumb={["CRUZ", "Contract Editor"]}
        title="Contract Editor"
        subtitle="Edit and compile Solidity in a multi-file workspace — for reviewing demo and generated contracts. No deploy step here."
      />
      <div className="flex flex-col overflow-hidden border-t border-border" style={{ height: "80vh" }}>
        {/* Toolbar */}
        <div className="flex h-[44px] shrink-0 items-center gap-3 border-b border-border bg-surface px-3">
          <select
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground"
          >
            {SOLC_VERSIONS.map((v) => (
              <option key={v} value={v}>
                solc {v}
              </option>
            ))}
          </select>

          <label className="flex cursor-pointer items-center gap-1.5 font-mono text-[11px] text-meta">
            <input
              type="checkbox"
              checked={autoCompile}
              onChange={(e) => setAutoCompile(e.target.checked)}
              className="h-3 w-3"
            />
            Auto
          </label>

          <button
            onClick={() => runCompile()}
            disabled={compiling || !activeSol.trim()}
            className="flex items-center gap-1 rounded border border-primary px-2.5 py-1 font-mono text-[11px] text-primary hover:bg-primary/10 disabled:opacity-40"
          >
            <Play className="h-3 w-3" />
            Compile
          </button>

          <div className="flex-1" />
          <span className="font-mono text-[11px] text-muted-foreground">{ws.activePath}</span>
        </div>

        {/* Panels */}
        <div className="flex flex-1 overflow-hidden">
          {/* File explorer */}
          {!sidebarCollapsed && (
            <aside className="flex w-[200px] shrink-0 flex-col border-r border-border bg-surface">
              <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Files
                </span>
                <div className="flex gap-0.5">
                  <button onClick={() => newFileIn("")} title="New file" className="rounded p-1 text-meta hover:text-foreground">
                    <FilePlus className="h-3 w-3" />
                  </button>
                  <button onClick={() => newFolderIn("")} title="New folder" className="rounded p-1 text-meta hover:text-foreground">
                    <FolderPlus className="h-3 w-3" />
                  </button>
                  <button onClick={() => fileInputRef.current?.click()} title="Import file(s)" className="rounded p-1 text-meta hover:text-foreground">
                    <Upload className="h-3 w-3" />
                  </button>
                  <button onClick={() => folderInputRef.current?.click()} title="Import folder" className="rounded p-1 text-meta hover:text-foreground">
                    <FolderInput className="h-3 w-3" />
                  </button>
                  <button onClick={() => setSidebarCollapsed(true)} title="Hide files" className="rounded p-1 text-meta hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  void onImport(e.target.files, false);
                  e.target.value = "";
                }}
              />
              <input
                ref={folderInputRef}
                type="file"
                className="hidden"
                // @ts-expect-error non-standard but widely supported folder upload
                webkitdirectory=""
                directory=""
                multiple
                onChange={(e) => {
                  void onImport(e.target.files, true);
                  e.target.value = "";
                }}
              />
              <div className="flex-1 overflow-y-auto px-1 py-1">
                <FileTree
                  node={ws.tree}
                  activePath={ws.activePath}
                  onOpen={ws.openFile}
                  onDelete={deletePath}
                  onRename={renamePath}
                  onNewFile={newFileIn}
                  onNewFolder={newFolderIn}
                />
              </div>
            </aside>
          )}

          {/* Editor area */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {sidebarCollapsed && (
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="flex items-center gap-1 border-b border-border px-2 py-1 font-mono text-[10px] text-meta hover:text-foreground"
              >
                <Folder className="h-3 w-3" /> Show files
              </button>
            )}
            <div className="flex-1 overflow-hidden">
              {ws.activePath.endsWith(".sol") ? (
                <ClientOnly
                  fallback={
                    <div className="flex h-full items-center justify-center font-mono text-xs text-meta">
                      Loading editor…
                    </div>
                  }
                >
                  <SolidityEditor
                    value={activeSol}
                    filename={ws.activePath}
                    onChange={(v) => ws.setContent(ws.activePath, v)}
                    diagnostics={diagnostics}
                  />
                </ClientOnly>
              ) : (
                <div className="flex h-full items-center justify-center font-mono text-xs text-muted-foreground">
                  {ws.activePath ? `${ws.activePath} (not a .sol file)` : "Select a file to edit"}
                </div>
              )}
            </div>

            {/* Terminal resize handle */}
            <div
              onPointerDown={onPointerDown}
              onDoubleClick={resetTermHeight}
              className="flex h-[6px] shrink-0 cursor-row-resize items-center justify-center bg-surface-2 hover:bg-primary/30"
            >
              <GripHorizontal className="h-3 w-3 text-meta" />
            </div>

            {!terminalCollapsed && (
              <div style={{ height: terminalHeight }} className="shrink-0">
                <EditorTerminal
                  lines={lines}
                  onClear={clearTerminal}
                  onCollapse={() => setTerminalCollapsed(true)}
                  onCommand={runTerminalCommand}
                />
              </div>
            )}
            {terminalCollapsed && (
              <button
                onClick={() => setTerminalCollapsed(false)}
                className="flex items-center gap-1 border-t border-border px-2 py-1 font-mono text-[10px] text-meta hover:text-foreground"
              >
                <Code2 className="h-3 w-3" /> Show terminal
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
