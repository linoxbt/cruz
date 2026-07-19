import { Loader2, ShieldCheck, ShieldX } from "lucide-react";
import { useDelegationStatus } from "@/hooks/useDelegationStatus";
import { truncateAddress } from "@/lib/wallet";
import { CodeBlock } from "@/components/shared/CodeBlock";

export function DelegationProofPanel({ address }: { address: string | undefined }) {
  const { data, isLoading, isError } = useDelegationStatus(address);

  if (!address) return null;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-sm border border-border bg-surface p-4 font-mono text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading account code on Arbitrum One…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-sm border border-destructive/40 bg-destructive/5 p-4 font-mono text-xs text-destructive">
        Couldn&apos;t read the account&apos;s code from Arbitrum One.
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        {data.isUpgraded ? (
          <ShieldCheck className="h-4 w-4 text-success" />
        ) : (
          <ShieldX className="h-4 w-4 text-meta" />
        )}
        <span className="font-mono text-sm font-bold text-foreground">
          {data.isUpgraded ? "Upgraded: EIP-7702 Universal Account" : "Plain EOA, not upgraded"}
        </span>
      </div>

      <p className="mt-2 font-mono text-xs leading-relaxed text-muted-foreground">
        {data.isUpgraded
          ? "This address's on-chain code carries the EIP-7702 delegation designator (0xef0100 + delegate address), proof it has been upgraded to a chain-abstracted Universal Account."
          : "eth_getCode returns empty bytecode, this is an ordinary externally-owned account with no delegation set."}
      </p>

      {data.isUpgraded && data.delegateAddress && (
        <div className="mt-2 font-mono text-xs text-muted-foreground">
          Delegate: <span className="text-foreground">{truncateAddress(data.delegateAddress)}</span>
        </div>
      )}

      <div className="mt-3">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-meta">
          Raw eth_getCode result
        </div>
        <CodeBlock code={data.rawCode || "0x"} language="text" />
      </div>
    </div>
  );
}
