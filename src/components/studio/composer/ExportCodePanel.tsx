import { CodeBlock } from "@/components/shared/CodeBlock";
import { generateExportSnippet } from "@/lib/studio/exportSnippet";
import type { ComposerInput } from "@/hooks/useTxComposer";

export function ExportCodePanel({ input }: { input: ComposerInput | null }) {
  if (!input) return null;

  return (
    <div className="rounded border border-border bg-surface p-4">
      <div className="font-mono text-xs uppercase tracking-wider text-meta">
        Export — drop into a clean project
      </div>
      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
        Complete TypeScript reproducing this exact transaction. Substitute your own Particle project
        credentials and private key.
      </p>
      <div className="mt-3">
        <CodeBlock code={generateExportSnippet(input)} language="typescript" maxHeight="20rem" />
      </div>
    </div>
  );
}
