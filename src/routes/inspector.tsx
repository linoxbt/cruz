import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAccount } from "wagmi";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { BalanceBreakdown } from "@/components/studio/inspector/BalanceBreakdown";
import { DelegationProofPanel } from "@/components/studio/inspector/DelegationProofPanel";
import { UpgradeFlow } from "@/components/studio/inspector/UpgradeFlow";

export const Route = createFileRoute("/inspector")({
  head: () => ({ meta: [{ title: "Account Inspector — CRUZ" }] }),
  component: InspectorPage,
});

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function InspectorPage() {
  const { address: connectedAddress } = useAccount();
  const [input, setInput] = useState("");
  const [inspected, setInspected] = useState<string | undefined>(undefined);

  const useConnected = () => {
    if (connectedAddress) {
      setInput(connectedAddress);
      setInspected(connectedAddress);
    }
  };

  const submit = () => {
    if (ADDRESS_RE.test(input.trim())) setInspected(input.trim());
  };

  return (
    <div>
      <PageHeader
        breadcrumb={["CRUZ", "Account Inspector"]}
        title="Universal Account Inspector"
        subtitle="Paste any address to inspect its unified cross-chain balance and EIP-7702 delegation status, or use the connected wallet."
      />
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="0x…"
            className="max-w-md font-mono text-xs"
          />
          <Button onClick={submit} disabled={!ADDRESS_RE.test(input.trim())}>
            Inspect
          </Button>
          {connectedAddress && (
            <Button variant="outline" onClick={useConnected}>
              Use connected wallet
            </Button>
          )}
        </div>

        {inspected && (
          <div className="grid gap-4 lg:grid-cols-2">
            <BalanceBreakdown address={inspected} />
            <DelegationProofPanel address={inspected} />
          </div>
        )}

        {inspected && connectedAddress?.toLowerCase() === inspected.toLowerCase() && (
          <UpgradeFlow />
        )}
      </div>
    </div>
  );
}
