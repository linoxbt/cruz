import { useState } from "react";
import { ZeroAddress } from "@particle-network/universal-account-sdk";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { ComposerInput } from "@/hooks/useTxComposer";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function AssetPicker({
  busy,
  onCompose,
}: {
  busy: boolean;
  onCompose: (input: ComposerInput) => void;
}) {
  const [mode, setMode] = useState<"transfer" | "contract-call">("transfer");

  // Transfer fields
  const [tokenAddress, setTokenAddress] = useState(ZeroAddress);
  const [amount, setAmount] = useState("");
  const [receiver, setReceiver] = useState("");

  // Contract-call fields
  const [targetAddress, setTargetAddress] = useState("");
  const [value, setValue] = useState("0");
  const [functionAbi, setFunctionAbi] = useState("function transfer(address to, uint256 amount)");
  const [argsText, setArgsText] = useState("");

  const transferValid = ADDRESS_RE.test(tokenAddress) && ADDRESS_RE.test(receiver) && !!amount;
  const callValid =
    ADDRESS_RE.test(targetAddress) && /^function\s+\w+\s*\(/.test(functionAbi.trim());

  const submit = () => {
    if (mode === "transfer") {
      if (!transferValid) return;
      onCompose({
        mode: "transfer",
        tokenAddress: tokenAddress as `0x${string}`,
        amount,
        receiver: receiver as `0x${string}`,
      });
    } else {
      if (!callValid) return;
      // Param names, in signature order, mapped to comma-separated values.
      const paramNames = (functionAbi.match(/\(([^)]*)\)/)?.[1] ?? "")
        .split(",")
        .map((p) => p.trim().split(/\s+/).pop())
        .filter((n): n is string => !!n);
      const values = argsText.split(",").map((v) => v.trim());
      const argValues = Object.fromEntries(paramNames.map((n, i) => [n, values[i] ?? ""]));
      onCompose({
        mode: "contract-call",
        targetAddress: targetAddress as `0x${string}`,
        value: value || "0",
        functionAbi: functionAbi.trim(),
        argValues,
      });
    }
  };

  return (
    <div className="rounded border border-border bg-surface p-4">
      <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
        <TabsList>
          <TabsTrigger value="transfer">Send token</TabsTrigger>
          <TabsTrigger value="contract-call">Call contract</TabsTrigger>
        </TabsList>

        <TabsContent value="transfer" className="mt-4 space-y-3">
          <div>
            <Label className="font-mono text-xs">Token address (ZeroAddress = native ETH)</Label>
            <Input
              value={tokenAddress}
              onChange={(e) => setTokenAddress(e.target.value)}
              className="mt-1 font-mono text-xs"
            />
          </div>
          <div>
            <Label className="font-mono text-xs">Amount</Label>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.1"
              className="mt-1 font-mono text-xs"
            />
          </div>
          <div>
            <Label className="font-mono text-xs">Receiver</Label>
            <Input
              value={receiver}
              onChange={(e) => setReceiver(e.target.value)}
              placeholder="0x…"
              className="mt-1 font-mono text-xs"
            />
          </div>
        </TabsContent>

        <TabsContent value="contract-call" className="mt-4 space-y-3">
          <div>
            <Label className="font-mono text-xs">Target contract address</Label>
            <Input
              value={targetAddress}
              onChange={(e) => setTargetAddress(e.target.value)}
              placeholder="0x…"
              className="mt-1 font-mono text-xs"
            />
          </div>
          <div>
            <Label className="font-mono text-xs">Native value (ETH)</Label>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="mt-1 font-mono text-xs"
            />
          </div>
          <div>
            <Label className="font-mono text-xs">Function signature</Label>
            <Textarea
              value={functionAbi}
              onChange={(e) => setFunctionAbi(e.target.value)}
              rows={2}
              className="mt-1 font-mono text-xs"
            />
          </div>
          <div>
            <Label className="font-mono text-xs">Arguments (comma-separated, in order)</Label>
            <Input
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              placeholder="0xRecipient…, 1000000000000000000"
              className="mt-1 font-mono text-xs"
            />
          </div>
        </TabsContent>
      </Tabs>

      <Button
        className="mt-4"
        disabled={busy || (mode === "transfer" ? !transferValid : !callValid)}
        onClick={submit}
      >
        Preview
      </Button>
    </div>
  );
}
