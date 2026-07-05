import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { ClientOnly } from "@/components/shared/ClientOnly";
import { CodeBlock } from "@/components/shared/CodeBlock";
import { SolidityEditor } from "@/components/editor/SolidityEditor";
import { compile, DEFAULT_SOLC_VERSION, type CompileOutput } from "@/lib/compiler";
import { useEditorIntake } from "@/lib/editor-intake";

// CRUZ contract editor. Reuses the generic SolidityEditor component and
// compiler.ts's compile() (both mode-agnostic). Edit + compile only, no deploy
// step — CRUZ doesn't ship a full deploy pipeline, just a way to review the
// demo / generated contracts the Scaffolder produces.
export const Route = createFileRoute("/editor")({
  head: () => ({ meta: [{ title: "Contract Editor — CRUZ" }] }),
  component: EditorPage,
});

const DEFAULT_SOURCE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Demo {
    string public greeting = "Hello from CRUZ";
}
`;

function EditorPage() {
  const consume = useEditorIntake((s) => s.consume);
  const [filename, setFilename] = useState("Contract.sol");
  const [source, setSource] = useState(DEFAULT_SOURCE);
  const [compiling, setCompiling] = useState(false);
  const [result, setResult] = useState<CompileOutput | null>(null);

  // One-shot: pick up a pending hand-off (e.g. the Scaffolder's demo
  // contract) if present, else keep the default sample.
  useEffect(() => {
    const pending = consume();
    if (pending) {
      setFilename(pending.filename);
      setSource(pending.content);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runCompile = async () => {
    setCompiling(true);
    try {
      const output = await compile({
        sources: { [filename]: source },
        version: DEFAULT_SOLC_VERSION,
        mainFile: filename,
      });
      setResult(output);
    } catch (e) {
      setResult({
        status: "error",
        contracts: {},
        errors: [
          {
            severity: "error",
            message: e instanceof Error ? e.message : "Compile failed",
            formattedMessage: e instanceof Error ? e.message : "Compile failed",
          },
        ],
        warnings: [],
        resolvedImports: [],
        importErrors: [],
        standardJsonInput: "",
        timeMs: 0,
      });
    } finally {
      setCompiling(false);
    }
  };

  return (
    <div>
      <PageHeader
        breadcrumb={["CRUZ", "Contract Editor"]}
        title="Contract Editor"
        subtitle="Edit and compile a Solidity contract — for reviewing demo and generated contracts. No deploy step here."
      />
      <div className="grid gap-4 p-6 lg:grid-cols-2">
        <div
          className="flex flex-col rounded border border-border bg-surface"
          style={{ height: "70vh" }}
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="font-mono text-xs text-muted-foreground">{filename}</span>
            <Button size="sm" onClick={runCompile} disabled={compiling}>
              {compiling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Compile"}
            </Button>
          </div>
          <div className="flex-1 overflow-hidden">
            <ClientOnly
              fallback={
                <div className="flex h-full items-center justify-center font-mono text-xs text-meta">
                  Loading editor…
                </div>
              }
            >
              <SolidityEditor
                value={source}
                filename={filename}
                onChange={setSource}
                diagnostics={[...(result?.errors ?? []), ...(result?.warnings ?? [])]}
              />
            </ClientOnly>
          </div>
        </div>

        <div className="space-y-3">
          {!result && (
            <div className="rounded border border-border bg-surface p-4 font-mono text-xs text-muted-foreground">
              Compile to see results here.
            </div>
          )}
          {result && result.status === "success" && (
            <div className="rounded border border-success/40 bg-success/5 p-4 font-mono text-xs text-success">
              Compiled successfully in {result.timeMs}ms.
              {Object.keys(result.contracts).length > 0 && (
                <ul className="mt-2 space-y-1">
                  {Object.entries(result.contracts).map(([name, c]) => (
                    <li key={name}>
                      {name} — {(c.bytecode.length - 2) / 2} bytes
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {result && result.errors.length > 0 && (
            <div className="rounded border border-destructive/40 bg-destructive/5 p-4">
              <div className="font-mono text-xs font-bold text-destructive">Errors</div>
              <div className="mt-2 space-y-2">
                {result.errors.map((e, i) => (
                  <CodeBlock key={i} code={e.formattedMessage || e.message} language="text" />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
