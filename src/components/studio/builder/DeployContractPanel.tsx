import { useEffect, useMemo, useState } from "react";
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import {
  createPublicClient,
  createWalletClient,
  encodeDeployData,
  formatEther,
  http,
  type Abi,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  AlertTriangle,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  Loader2,
  RefreshCw,
  Rocket,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { compile, DEFAULT_SOLC_VERSION, type CompileOutput } from "@/lib/compiler";
import { parseArgs } from "@/lib/abiArgParser";
import { arbitrumOne, chainConfig } from "@/lib/chains";
import { truncateAddress } from "@/lib/wallet";

interface Props {
  files: Record<string, string>;
}

type Stage =
  | { name: "idle" }
  | { name: "compiling" }
  | { name: "ready"; result: CompileOutput; contractName: string }
  | { name: "error"; message: string };

type SignerMode = "magic" | "generated";

/**
 * Compiles and deploys a Solidity contract from the applied file set. Two
 * signer options:
 *
 *  - "magic" (default): the already-connected Magic wallet — CRUZ's one and
 *    only signer everywhere else in the app.
 *  - "generated": an explicit opt-in, separate local burner wallet (a plain
 *    viem account, private key held only in this component's in-memory state
 *    — never persisted, never sent anywhere) for when someone wants a
 *    deployer key that isn't their main CRUZ account. Gated behind an
 *    explicit disclosure + checkbox, because unlike the Magic wallet this key
 *    has no recovery: losing the tab loses it, same as any other browser
 *    burner wallet.
 *
 * Either way this is a plain EOA contract-creation transaction (no Particle
 * Universal Account routing — deployment doesn't need cross-chain
 * aggregation), reusing the same compiler.ts/abiArgParser.ts already proven
 * in the Contract Editor and Composer. Arbitrum One is mainnet — this costs
 * real gas, no faucet — so nothing here ever sends without an explicit
 * Deploy click on a review screen that shows exactly what's about to happen.
 */
export function DeployContractPanel({ files }: Props) {
  const { address, isConnected } = useAccount();
  const [stage, setStage] = useState<Stage>({ name: "idle" });
  const [argValues, setArgValues] = useState<Record<string, string>>({});

  const [signerMode, setSignerMode] = useState<SignerMode>("magic");
  const [genApproved, setGenApproved] = useState(false);
  const [genAccount, setGenAccount] = useState<{ address: `0x${string}`; privateKey: Hex } | null>(
    null,
  );
  const [revealKey, setRevealKey] = useState(false);
  const [genBalance, setGenBalance] = useState<bigint | null>(null);
  const [genBalanceLoading, setGenBalanceLoading] = useState(false);
  const [manualSending, setManualSending] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualTxHash, setManualTxHash] = useState<Hex | null>(null);
  const [manualReceipt, setManualReceipt] = useState<{ contractAddress?: string | null } | null>(
    null,
  );

  const publicClient = useMemo(
    () => createPublicClient({ chain: arbitrumOne, transport: http() }),
    [],
  );

  const solFiles = useMemo(
    () => Object.entries(files).filter(([p]) => p.endsWith(".sol")),
    [files],
  );

  const {
    sendTransaction,
    data: txHash,
    isPending: sending,
    error: sendError,
    reset: resetSend,
  } = useSendTransaction();
  const { data: receipt, isLoading: waitingForReceipt } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: arbitrumOne.id,
  });

  const refreshGenBalance = async () => {
    if (!genAccount) return;
    setGenBalanceLoading(true);
    try {
      setGenBalance(await publicClient.getBalance({ address: genAccount.address }));
    } catch {
      /* leave last known balance */
    } finally {
      setGenBalanceLoading(false);
    }
  };

  useEffect(() => {
    if (genAccount) void refreshGenBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genAccount]);

  const generateWallet = () => {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    setGenAccount({ address: account.address, privateKey });
  };

  const activeAddress = signerMode === "magic" ? address : genAccount?.address;
  const signerReady = signerMode === "magic" ? isConnected : !!genAccount;

  if (solFiles.length === 0) return null;

  const runCompile = async () => {
    setStage({ name: "compiling" });
    try {
      const sources = Object.fromEntries(solFiles);
      const mainFile = solFiles[0][0];
      const result = await compile({ sources, version: DEFAULT_SOLC_VERSION, mainFile });
      if (result.status === "error" || Object.keys(result.contracts).length === 0) {
        setStage({
          name: "error",
          message:
            result.errors[0]?.formattedMessage ?? "Compilation produced no deployable contract.",
        });
        return;
      }
      const contractName = Object.keys(result.contracts)[0];
      setStage({ name: "ready", result, contractName });
      setArgValues({});
    } catch (e) {
      setStage({ name: "error", message: e instanceof Error ? e.message : "Compilation failed." });
    }
  };

  const ready = stage.name === "ready" ? stage : null;
  const contract = ready ? ready.result.contracts[ready.contractName] : null;
  const constructorAbi = (contract?.abi as Abi | undefined)?.find(
    (item): item is Extract<Abi[number], { type: "constructor" }> => item.type === "constructor",
  );
  const constructorInputs = (constructorAbi?.inputs ?? []).map((p, i) => ({
    name: p.name || `arg${i}`,
    type: p.type,
  }));

  const doDeploy = async () => {
    if (!contract) return;
    let data: Hex;
    try {
      const args = constructorInputs.length > 0 ? parseArgs(constructorInputs, argValues) : [];
      data = encodeDeployData({
        abi: contract.abi as Abi,
        bytecode: contract.bytecode,
        args: args as never,
      });
    } catch (e) {
      setStage({
        name: "error",
        message: e instanceof Error ? e.message : "Failed to encode constructor arguments.",
      });
      return;
    }

    if (signerMode === "magic") {
      sendTransaction({ data, value: 0n });
      return;
    }

    if (!genAccount) return;
    setManualSending(true);
    setManualError(null);
    try {
      const walletClient = createWalletClient({
        account: privateKeyToAccount(genAccount.privateKey),
        chain: arbitrumOne,
        transport: http(),
      });
      const hash = await walletClient.sendTransaction({ data, value: 0n });
      setManualTxHash(hash);
      const txReceipt = await publicClient.waitForTransactionReceipt({ hash });
      setManualReceipt({ contractAddress: txReceipt.contractAddress });
    } catch (e) {
      setManualError(e instanceof Error ? e.message : "Deployment failed.");
    } finally {
      setManualSending(false);
    }
  };

  const explorer = chainConfig(arbitrumOne.id).explorerUrl;
  const activeTxHash = signerMode === "magic" ? txHash : (manualTxHash ?? undefined);
  const activeReceipt = signerMode === "magic" ? receipt : manualReceipt;
  const activeSending = signerMode === "magic" ? sending : manualSending;
  const activeSendError = signerMode === "magic" ? sendError?.message : manualError;
  const activeWaiting =
    signerMode === "magic" ? waitingForReceipt : manualSending && !!manualTxHash;

  return (
    <div className="space-y-3 rounded-sm border border-border bg-surface p-4">
      <div className="flex items-center gap-2 font-mono text-xs font-bold text-foreground">
        <Rocket className="h-4 w-4" /> Deploy a contract from this app
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setSignerMode("magic")}
            className={`flex items-center gap-2 rounded-sm border px-3 py-2 text-left font-mono text-xs transition ${
              signerMode === "magic"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50"
            }`}
          >
            <Wallet className="h-3.5 w-3.5 shrink-0" />
            <span>
              Connected wallet
              <span className="block text-[10px] text-meta">Magic — CRUZ&apos;s account</span>
            </span>
          </button>
          <button
            onClick={() => setSignerMode("generated")}
            className={`flex items-center gap-2 rounded-sm border px-3 py-2 text-left font-mono text-xs transition ${
              signerMode === "generated"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50"
            }`}
          >
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
            <span>
              Generate deployer wallet
              <span className="block text-[10px] text-meta">Separate, browser-only key</span>
            </span>
          </button>
        </div>

        {signerMode === "magic" && !isConnected && (
          <p className="rounded-sm border border-warning/40 bg-warning/5 p-3 font-mono text-[11px] text-muted-foreground">
            Connect your CRUZ wallet (Magic) to deploy — same requirement as everywhere else in
            CRUZ. Deployment is always signed by your connected wallet; CRUZ never generates or
            holds a separate key for this.
          </p>
        )}

        {signerMode === "generated" && !genAccount && (
          <div className="space-y-2 rounded-sm border border-warning/40 bg-warning/5 p-3 font-mono text-[11px] text-muted-foreground">
            <div className="flex items-center gap-1.5 font-bold text-warning">
              <ShieldAlert className="h-3.5 w-3.5" /> This is a different wallet from your CRUZ
              account
            </div>
            <p>
              Generates a plain local key pair, held only in this browser tab&apos;s memory — never
              sent anywhere, never persisted. It starts with 0 ETH; you fund it yourself (no faucet,
              Arbitrum One is mainnet). If you close or reload this tab before exporting the private
              key, it — and anything sent to it — is unrecoverable. CRUZ cannot recover it either
              way.
            </p>
            <label className="flex cursor-pointer items-center gap-2 pt-1 text-foreground">
              <input
                type="checkbox"
                checked={genApproved}
                onChange={(e) => setGenApproved(e.target.checked)}
                className="h-3 w-3"
              />
              I understand this wallet has no recovery and it&apos;s my responsibility to fund and
              back it up
            </label>
            <Button variant="outline" onClick={generateWallet} disabled={!genApproved}>
              Generate wallet
            </Button>
          </div>
        )}

        {signerMode === "generated" && genAccount && (
          <div className="space-y-2 rounded-sm border border-border bg-background p-3 font-mono text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Deployer address</span>
              <button
                onClick={() => navigator.clipboard.writeText(genAccount.address)}
                className="flex items-center gap-1 text-meta hover:text-foreground"
                title="Copy address"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
            <div className="break-all text-foreground">{genAccount.address}</div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-muted-foreground">
                Balance: {genBalance !== null ? `${formatEther(genBalance)} ETH` : "—"}
              </span>
              <button
                onClick={() => void refreshGenBalance()}
                disabled={genBalanceLoading}
                className="flex items-center gap-1 text-meta hover:text-foreground disabled:opacity-40"
                title="Refresh balance"
              >
                <RefreshCw className={`h-3 w-3 ${genBalanceLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
            {genBalance === 0n && (
              <p className="text-warning">
                0 balance — send ETH to this address on Arbitrum One before deploying.
              </p>
            )}
            <div className="border-t border-border pt-2">
              <button
                onClick={() => setRevealKey((r) => !r)}
                className="flex items-center gap-1 text-meta hover:text-foreground"
              >
                {revealKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {revealKey ? "Hide" : "Reveal"} private key
              </button>
              {revealKey && (
                <div className="mt-1 flex items-center gap-2">
                  <span className="break-all text-destructive">{genAccount.privateKey}</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(genAccount.privateKey)}
                    className="shrink-0 text-meta hover:text-foreground"
                    title="Copy private key"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {signerReady && stage.name === "idle" && (
        <Button onClick={runCompile} variant="outline">
          Compile {solFiles.length > 1 ? `${solFiles.length} contracts` : solFiles[0][0]}
        </Button>
      )}

      {stage.name === "compiling" && (
        <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Compiling…
        </div>
      )}

      {stage.name === "error" && (
        <div className="flex items-start gap-2 rounded-sm border border-destructive/40 bg-destructive/5 p-3 font-mono text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="whitespace-pre-wrap break-all">{stage.message}</span>
        </div>
      )}

      {ready && contract && signerReady && !activeTxHash && (
        <div className="space-y-3">
          {Object.keys(ready.result.contracts).length > 1 && (
            <div>
              <Label className="font-mono text-xs">Contract</Label>
              <select
                value={ready.contractName}
                onChange={(e) => setStage({ ...ready, contractName: e.target.value })}
                className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground"
              >
                {Object.keys(ready.result.contracts).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {constructorInputs.length > 0 && (
            <div className="space-y-2">
              <Label className="font-mono text-xs">Constructor arguments</Label>
              {constructorInputs.map((inp) => (
                <div key={inp.name}>
                  <Label className="font-mono text-[10px] text-meta">
                    {inp.name} <span className="text-meta/70">({inp.type})</span>
                  </Label>
                  <Input
                    value={argValues[inp.name] ?? ""}
                    onChange={(e) => setArgValues((p) => ({ ...p, [inp.name]: e.target.value }))}
                    className="mt-1 font-mono text-xs"
                  />
                </div>
              ))}
            </div>
          )}

          <div className="rounded-sm border border-warning/40 bg-warning/5 p-3 font-mono text-[11px] text-muted-foreground">
            <div className="font-bold text-warning">This costs real gas on Arbitrum One.</div>
            Deploying <span className="text-foreground">{ready.contractName}</span> (
            {(contract.bytecode.length - 2) / 2} bytes) from{" "}
            <span className="text-foreground">
              {activeAddress && truncateAddress(activeAddress)}
            </span>
            . There is no testnet or faucet — review before confirming.
          </div>

          {activeSendError && (
            <div className="rounded-sm border border-destructive/40 bg-destructive/5 p-2 font-mono text-xs text-destructive">
              {activeSendError}
            </div>
          )}

          <Button onClick={() => void doDeploy()} disabled={activeSending}>
            {activeSending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />{" "}
                {signerMode === "magic" ? "Confirm in wallet…" : "Deploying…"}
              </>
            ) : (
              "Deploy"
            )}
          </Button>
        </div>
      )}

      {activeTxHash && (
        <div className="space-y-2">
          {activeWaiting && (
            <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for confirmation…
            </div>
          )}
          {activeReceipt?.contractAddress && (
            <div className="rounded-sm border border-success/40 bg-success/5 p-3 font-mono text-xs text-success">
              Deployed to {activeReceipt.contractAddress}
            </div>
          )}
          <a
            href={`${explorer}/tx/${activeTxHash}`}
            target="_blank"
            rel="noreferrer"
            className="flex w-fit items-center gap-1 font-mono text-xs text-primary hover:underline"
          >
            View on Arbiscan <ExternalLink className="h-3 w-3" />
          </a>
          <Button
            variant="outline"
            onClick={() => {
              resetSend();
              setManualTxHash(null);
              setManualReceipt(null);
              setManualError(null);
              setStage({ name: "idle" });
            }}
          >
            Deploy another
          </Button>
        </div>
      )}
    </div>
  );
}
