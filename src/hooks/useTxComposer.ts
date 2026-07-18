import { useState } from "react";
import { encodeFunctionData, parseAbi, parseEther, type Abi, type AbiFunction } from "viem";
import type { ITransaction } from "@particle-network/universal-account-sdk";
import { getUniversalAccount } from "@/lib/studio/particle";
import { signAndSendWithMagic, useMagic, useMagicAddress } from "@/lib/studio/magicSigner";
import { arbitrumOne } from "@/lib/chains";
import { parseArgs } from "@/lib/abiArgParser";

export interface TransferInput {
  mode: "transfer";
  tokenAddress: `0x${string}`;
  amount: string;
  receiver: `0x${string}`;
}

export interface ContractCallInput {
  mode: "contract-call";
  targetAddress: `0x${string}`;
  /** Native ETH value to send with the call, as a plain decimal string (e.g. "0.01"). */
  value: string;
  /** A single human-readable function signature, e.g. "function transfer(address to, uint256 amount)". */
  functionAbi: string;
  /** Raw string values keyed by parameter name — coerced via the repo's existing abiArgParser. */
  argValues: Record<string, string>;
}

export type ComposerInput = TransferInput | ContractCallInput;

export type ComposerStatus = "idle" | "previewing" | "ready" | "executing" | "done" | "error";

function buildContractCallData(input: ContractCallInput) {
  // parseAbi's type-level parser only validates literal signature strings; a
  // runtime string (user input) can't be inferred at the type level, so we
  // cast — the runtime parser handles any valid signature regardless.
  const abi = parseAbi([input.functionAbi] as readonly [string]) as unknown as Abi;
  const fn = abi.find((f): f is AbiFunction => f.type === "function");
  if (!fn) throw new Error("Not a valid function signature");
  const inputs = fn.inputs.map((p, i) => ({ name: p.name || `arg${i}`, type: p.type }));
  const args = parseArgs(inputs, input.argValues);
  return encodeFunctionData({ abi, functionName: fn.name, args });
}

/**
 * Compose → preview → execute → export for a cross-chain Universal
 * Transaction. "Preview" is just the create*Transaction response itself
 * (routing/fees resolved, nothing submitted) — only sendTransaction commits.
 */
export function useTxComposer() {
  const [status, setStatus] = useState<ComposerStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transaction, setTransaction] = useState<ITransaction | null>(null);
  const [lastInput, setLastInput] = useState<ComposerInput | null>(null);
  const [txId, setTxId] = useState<string | null>(null);

  const magic = useMagic();
  const address = useMagicAddress();
  const canCompose = !!(magic && address);

  async function preview(input: ComposerInput) {
    setError(null);
    setTransaction(null);
    setTxId(null);
    setLastInput(input);

    if (!magic || !address) {
      setError(
        "Connect your CRUZ wallet (Magic) to compose a transaction — you can still export a " +
          "snippet without connecting.",
      );
      setStatus("error");
      return;
    }

    try {
      setStatus("previewing");
      const ua = getUniversalAccount(address);

      const tx =
        input.mode === "transfer"
          ? await ua.createTransferTransaction({
              token: { chainId: arbitrumOne.id, address: input.tokenAddress },
              amount: input.amount,
              receiver: input.receiver,
            })
          : await ua.createUniversalTransaction({
              chainId: arbitrumOne.id,
              expectTokens: [],
              transactions: [
                {
                  to: input.targetAddress,
                  data: buildContractCallData(input),
                  value: parseEther(input.value || "0").toString(),
                },
              ],
            });

      setTransaction(tx);
      setStatus("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
      setStatus("error");
    }
  }

  async function execute() {
    if (!transaction) return;
    if (!magic || !address) {
      setError("Connect your CRUZ wallet (Magic) to execute this transaction.");
      setStatus("error");
      return;
    }
    try {
      setStatus("executing");
      const ua = getUniversalAccount(address);
      const result = await signAndSendWithMagic(ua, transaction, address);
      setTxId((result?.transactionId as string | undefined) ?? transaction.transactionId);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Execution failed");
      setStatus("error");
    }
  }

  function reset() {
    setStatus("idle");
    setError(null);
    setTransaction(null);
    setTxId(null);
    setLastInput(null);
  }

  return { status, error, transaction, lastInput, txId, canCompose, preview, execute, reset };
}
