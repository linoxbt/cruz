import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTxComposer, type ComposerInput } from "@/hooks/useTxComposer";
import { PageHeader } from "@/components/shared/PageHeader";
import { AssetPicker } from "@/components/studio/composer/AssetPicker";
import { PreviewPanel } from "@/components/studio/composer/PreviewPanel";
import { ExportCodePanel } from "@/components/studio/composer/ExportCodePanel";
import { RecentTransactions } from "@/components/studio/composer/RecentTransactions";

export const Route = createFileRoute("/composer")({
  head: () => ({ meta: [{ title: "Transaction Composer — CRUZ" }] }),
  component: ComposerPage,
});

function ComposerPage() {
  const { status, error, transaction, lastInput, txId, canCompose, preview, execute } =
    useTxComposer();
  const busy = status === "previewing" || status === "executing";

  // "Load" from RecentTransactions feeds a past input back into AssetPicker.
  // Bumping `nonce` on every load (not just changing `input`) means clicking
  // the same history entry twice still re-applies it.
  const [prefill, setPrefill] = useState<{ input: ComposerInput; nonce: number } | null>(null);
  const loadFromHistory = (input: ComposerInput) =>
    setPrefill((p) => ({ input, nonce: (p?.nonce ?? 0) + 1 }));

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
            <AssetPicker
              busy={busy}
              disabled={!canCompose}
              onCompose={preview}
              prefill={prefill ?? undefined}
            />
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

        <RecentTransactions onLoad={loadFromHistory} />
      </div>
    </div>
  );
}
