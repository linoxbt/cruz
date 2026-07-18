import { createFileRoute } from "@tanstack/react-router";
import { useTxComposer } from "@/hooks/useTxComposer";
import { PageHeader } from "@/components/shared/PageHeader";
import { AssetPicker } from "@/components/studio/composer/AssetPicker";
import { PreviewPanel } from "@/components/studio/composer/PreviewPanel";
import { ExportCodePanel } from "@/components/studio/composer/ExportCodePanel";

export const Route = createFileRoute("/composer")({
  head: () => ({ meta: [{ title: "Transaction Composer — CRUZ" }] }),
  component: ComposerPage,
});

function ComposerPage() {
  const { status, error, transaction, lastInput, txId, canCompose, preview, execute } =
    useTxComposer();
  const busy = status === "previewing" || status === "executing";

  return (
    <div>
      <PageHeader
        breadcrumb={["CRUZ", "Transaction Composer"]}
        title="Universal Transaction Composer"
        subtitle="Compose a cross-chain Universal Transaction on Arbitrum One, preview routing and fees with no side effects, execute it, and export a runnable snippet."
      />
      <div className="space-y-6 p-6">
        {!canCompose && (
          <p className="font-mono text-xs text-warning">
            Previewing and executing need a connected CRUZ wallet (Magic) — same requirement as the
            Account Inspector's upgrade flow. You can still fill out a transaction and export it as
            a snippet without connecting.
          </p>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <AssetPicker busy={busy} disabled={!canCompose} onCompose={preview} />
            <ExportCodePanel input={lastInput} />
          </div>
          <PreviewPanel
            status={status}
            error={error}
            transaction={transaction}
            txId={txId}
            onExecute={execute}
          />
        </div>
      </div>
    </div>
  );
}
