import { useMemo, useState } from "react";
import { parseAbiItem, type AbiFunction } from "viem";
import { ZeroAddress } from "@particle-network/universal-account-sdk";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { ComposerInput } from "@/hooks/useTxComposer";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

// Mirrors buildContractCallData's own name derivation in useTxComposer.ts, so
// the argValues keys produced here line up with the inputs it re-derives from
// the same functionAbi string.
function namedInputs(fn: AbiFunction) {
  return fn.inputs.map((p, i) => ({ name: p.name || `arg${i}`, type: p.type }));
}

export function AssetPicker({
  busy,
  disabled,
  onCompose,
}: {
  busy: boolean;
  /** True when previewing needs something the caller hasn't satisfied yet
   *  (e.g. no wallet connected) — disables Preview instead of letting it run
   *  and immediately fail. */
  disabled?: boolean;
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
  const [argValues, setArgValues] = useState<Record<string, string>>({});

  const transferValid = ADDRESS_RE.test(tokenAddress) && ADDRESS_RE.test(receiver) && !!amount;

  // Parse the signature with viem's real ABI parser rather than a naive
  // comma split — a manual split misaligns for any type containing a comma
  // internally (arrays, tuples), silently producing wrong encoded calldata.
  const parsedFn = useMemo(() => {
    try {
      const item = parseAbiItem(functionAbi.trim());
      return item.type === "function" ? item : null;
    } catch {
      return null;
    }
  }, [functionAbi]);

  const abiInputs = useMemo(() => (parsedFn ? namedInputs(parsedFn) : []), [parsedFn]);
  const callValid = ADDRESS_RE.test(targetAddress) && !!parsedFn;

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
      const values = Object.fromEntries(
        abiInputs.map((inp) => [inp.name, argValues[inp.name] ?? ""]),
      );
      onCompose({
        mode: "contract-call",
        targetAddress: targetAddress as `0x${string}`,
        value: value || "0",
        functionAbi: functionAbi.trim(),
        argValues: values,
      });
    }
  };

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
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
          {abiInputs.length > 0 ? (
            <div className="space-y-2">
              <Label className="font-mono text-xs">Arguments</Label>
              {abiInputs.map((inp) => (
                <div key={inp.name}>
                  <Label className="font-mono text-[10px] text-meta">
                    {inp.name} <span className="text-meta/70">({inp.type})</span>
                  </Label>
                  <Input
                    value={argValues[inp.name] ?? ""}
                    onChange={(e) =>
                      setArgValues((prev) => ({ ...prev, [inp.name]: e.target.value }))
                    }
                    placeholder={inp.type.endsWith("[]") ? "[1, 2, 3]" : "0x… or a value"}
                    className="mt-1 font-mono text-xs"
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="font-mono text-[11px] text-meta">
              Enter a valid function signature above to fill in its arguments.
            </p>
          )}
        </TabsContent>
      </Tabs>

      <Button
        className="mt-4"
        disabled={busy || disabled || (mode === "transfer" ? !transferValid : !callValid)}
        onClick={submit}
      >
        Preview
      </Button>
    </div>
  );
}
