import { useEffect, useMemo, useState } from "react";
import { parseAbiItem, type AbiFunction } from "viem";
import { ZeroAddress } from "@particle-network/universal-account-sdk";
import { Plus, Trash2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { ComposerInput, ContractCall } from "@/hooks/useTxComposer";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

// Mirrors buildContractCallData's own name derivation in useTxComposer.ts, so
// the argValues keys produced here line up with the inputs it re-derives from
// the same functionAbi string.
function namedInputs(fn: AbiFunction) {
  return fn.inputs.map((p, i) => ({ name: p.name || `arg${i}`, type: p.type }));
}

function blankCall(): ContractCall {
  return {
    targetAddress: "" as `0x${string}`,
    value: "0",
    functionAbi: "function transfer(address to, uint256 amount)",
    argValues: {},
  };
}

function isCallValid(call: ContractCall): boolean {
  if (!ADDRESS_RE.test(call.targetAddress)) return false;
  try {
    return parseAbiItem(call.functionAbi.trim()).type === "function";
  } catch {
    return false;
  }
}

// Quick-fill presets for common calls — click one to prefill the function
// signature (and clear stale args from whatever signature was there before)
// instead of hand-typing it every time.
const PRESETS: { label: string; abi: string }[] = [
  { label: "ERC-20 transfer", abi: "function transfer(address to, uint256 amount)" },
  { label: "ERC-20 approve", abi: "function approve(address spender, uint256 amount)" },
  {
    label: "ERC-721 transfer",
    abi: "function safeTransferFrom(address from, address to, uint256 tokenId)",
  },
  {
    label: "ERC-1155 transfer",
    abi: "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",
  },
  { label: "WETH deposit", abi: "function deposit() payable" },
  { label: "WETH withdraw", abi: "function withdraw(uint256 amount)" },
];

/** Target/value/signature/args fields for one contract call — shared by the
 *  single "Call contract" tab and each entry in the "Batch calls" tab so
 *  there's exactly one place that renders/parses a call. */
function ContractCallFields({
  call,
  onChange,
}: {
  call: ContractCall;
  onChange: (next: ContractCall) => void;
}) {
  const parsedFn = useMemo(() => {
    try {
      const item = parseAbiItem(call.functionAbi.trim());
      return item.type === "function" ? item : null;
    } catch {
      return null;
    }
  }, [call.functionAbi]);
  const abiInputs = useMemo(() => (parsedFn ? namedInputs(parsedFn) : []), [parsedFn]);

  return (
    <div className="space-y-3">
      <div>
        <Label className="font-mono text-xs">Target contract address</Label>
        <Input
          value={call.targetAddress}
          onChange={(e) => onChange({ ...call, targetAddress: e.target.value as `0x${string}` })}
          placeholder="0x…"
          className="mt-1 font-mono text-xs"
        />
      </div>
      <div>
        <Label className="font-mono text-xs">Native value (ETH)</Label>
        <Input
          value={call.value}
          onChange={(e) => onChange({ ...call, value: e.target.value })}
          className="mt-1 font-mono text-xs"
        />
      </div>
      <div>
        <Label className="font-mono text-xs">Function signature</Label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange({ ...call, functionAbi: p.abi, argValues: {} })}
              className="rounded border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground hover:border-primary hover:text-primary"
            >
              {p.label}
            </button>
          ))}
        </div>
        <Textarea
          value={call.functionAbi}
          onChange={(e) => onChange({ ...call, functionAbi: e.target.value })}
          rows={2}
          className="mt-1.5 font-mono text-xs"
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
                value={call.argValues[inp.name] ?? ""}
                onChange={(e) =>
                  onChange({
                    ...call,
                    argValues: { ...call.argValues, [inp.name]: e.target.value },
                  })
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
    </div>
  );
}

interface Props {
  busy: boolean;
  /** True when previewing needs something the caller hasn't satisfied yet
   *  (e.g. no wallet connected) — disables Preview instead of letting it run
   *  and immediately fail. */
  disabled?: boolean;
  onCompose: (input: ComposerInput) => void;
  /** Reload a past composed input (from RecentTransactions' "Load") — bump
   *  `nonce` on every load so clicking the same entry twice still re-applies
   *  it even though `input` itself didn't change by reference. */
  prefill?: { input: ComposerInput; nonce: number };
}

export function AssetPicker({ busy, disabled, onCompose, prefill }: Props) {
  const [mode, setMode] = useState<"transfer" | "contract-call" | "batch">("transfer");

  // Transfer fields
  const [tokenAddress, setTokenAddress] = useState(ZeroAddress);
  const [amount, setAmount] = useState("");
  const [receiver, setReceiver] = useState("");

  // Single contract-call fields
  const [call, setCall] = useState<ContractCall>(blankCall());

  // Batch fields
  const [calls, setCalls] = useState<ContractCall[]>([blankCall()]);

  useEffect(() => {
    if (!prefill) return;
    const { input } = prefill;
    if (input.mode === "transfer") {
      setMode("transfer");
      setTokenAddress(input.tokenAddress);
      setAmount(input.amount);
      setReceiver(input.receiver);
    } else if (input.mode === "contract-call") {
      setMode("contract-call");
      setCall({
        targetAddress: input.targetAddress,
        value: input.value,
        functionAbi: input.functionAbi,
        argValues: input.argValues,
      });
    } else {
      setMode("batch");
      setCalls(input.calls.length > 0 ? input.calls : [blankCall()]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.nonce]);

  const transferValid = ADDRESS_RE.test(tokenAddress) && ADDRESS_RE.test(receiver) && !!amount;
  const callValid = isCallValid(call);
  const batchValid = calls.length > 0 && calls.every(isCallValid);

  const submit = () => {
    if (mode === "transfer") {
      if (!transferValid) return;
      onCompose({
        mode: "transfer",
        tokenAddress: tokenAddress as `0x${string}`,
        amount,
        receiver: receiver as `0x${string}`,
      });
    } else if (mode === "contract-call") {
      if (!callValid) return;
      onCompose({ mode: "contract-call", ...call, targetAddress: call.targetAddress });
    } else {
      if (!batchValid) return;
      onCompose({ mode: "batch", calls });
    }
  };

  const submitDisabled =
    busy ||
    disabled ||
    (mode === "transfer" ? !transferValid : mode === "contract-call" ? !callValid : !batchValid);

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
        <TabsList>
          <TabsTrigger value="transfer">Send token</TabsTrigger>
          <TabsTrigger value="contract-call">Call contract</TabsTrigger>
          <TabsTrigger value="batch">Batch calls</TabsTrigger>
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

        <TabsContent value="contract-call" className="mt-4">
          <ContractCallFields call={call} onChange={setCall} />
        </TabsContent>

        <TabsContent value="batch" className="mt-4 space-y-4">
          {calls.map((c, i) => (
            <div key={i} className="rounded border border-border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-wider text-meta">
                  Call {i + 1}
                </span>
                {calls.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setCalls((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-meta hover:text-danger"
                    title="Remove this call"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <ContractCallFields
                call={c}
                onChange={(next) =>
                  setCalls((prev) => prev.map((p, idx) => (idx === i ? next : p)))
                }
              />
            </div>
          ))}
          <Button variant="outline" onClick={() => setCalls((prev) => [...prev, blankCall()])}>
            <Plus className="h-3.5 w-3.5" /> Add call
          </Button>
          <p className="font-mono text-[11px] text-meta">
            All calls above are routed and signed as a single Universal Transaction.
          </p>
        </TabsContent>
      </Tabs>

      <Button className="mt-4" disabled={submitDisabled} onClick={submit}>
        Preview
      </Button>
    </div>
  );
}
