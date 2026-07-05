import { Loader2 } from "lucide-react";
import type { ITransaction } from "@particle-network/universal-account-sdk";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/shared/CodeBlock";
import type { ComposerStatus } from "@/hooks/useTxComposer";

export function PreviewPanel({
  status,
  error,
  transaction,
  txId,
  onExecute,
}: {
  status: ComposerStatus;
  error: string | null;
  transaction: ITransaction | null;
  txId: string | null;
  onExecute: () => void;
}) {
  if (status === "idle") return null;

  if (status === "previewing") {
    return (
      <div className="flex items-center gap-2 rounded border border-border bg-surface p-4 font-mono text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Resolving routing…
      </div>
    );
  }

  if (status === "error" && error) {
    return (
      <div className="rounded border border-destructive/40 bg-destructive/5 p-4 font-mono text-xs text-destructive">
        {error}
      </div>
    );
  }

  if (!transaction) return null;

  return (
    <div className="rounded border border-border bg-surface p-4">
      <div className="font-mono text-xs uppercase tracking-wider text-meta">
        Preview — no funds moved yet
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 font-mono text-xs">
        <Stat label="Total deposit (USD)" value={`$${transaction.totalDepositTokenAmountInUSD}`} />
        <Stat
          label="Service fee (USD)"
          value={`$${transaction.transactionFees.transactionServiceFeeAmountInUSD}`}
        />
        <Stat label="Gasless" value={transaction.transactionFees.freeGasFee ? "Yes" : "No"} />
        <Stat label="Chain" value="Arbitrum One (42161)" />
      </div>

      {transaction.tokenChanges && (
        <div className="mt-4 space-y-1 font-mono text-[11px] text-muted-foreground">
          <div>From: {transaction.tokenChanges.from}</div>
          <div>To: {transaction.tokenChanges.to}</div>
          <div>Total fee (USD): ${transaction.tokenChanges.totalFeeInUSD}</div>
        </div>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer font-mono text-[11px] text-meta hover:text-foreground">
          Raw transaction response
        </summary>
        <div className="mt-2">
          <CodeBlock
            code={JSON.stringify(transaction, null, 2)}
            language="json"
            maxHeight="16rem"
          />
        </div>
      </details>

      {status === "done" && txId ? (
        <div className="mt-4 rounded border border-success/40 bg-success/5 p-3 font-mono text-xs text-success">
          Executed — transaction {txId}
        </div>
      ) : (
        <Button className="mt-4" onClick={onExecute} disabled={status === "executing"}>
          {status === "executing" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Executing…
            </>
          ) : (
            "Execute"
          )}
        </Button>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-meta">{label}</div>
      <div className="mt-0.5 font-bold text-foreground">{value}</div>
    </div>
  );
}
