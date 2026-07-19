import { useState } from "react";
import { encodeFunctionData, parseAbi, parseEther, type Abi, type AbiFunction } from "viem";
import type { ITransaction } from "@particle-network/universal-account-sdk";
import { getUniversalAccount } from "@/lib/studio/particle";
import { signAndSendWithMagic, useMagic, useMagicAddress } from "@/lib/studio/magicSigner";
import { arbitrumOne } from "@/lib/chains";
import { parseArgs } from "@/lib/abiArgParser";
import { useComposerHistory } from "@/lib/studio/composerHistory";
import { describeWeb3Error } from "@/lib/studio/web3Error";

export interface TransferInput {
  mode: "transfer";
  tokenAddress: `0x${string}`;
  amount: string;
  receiver: `0x${string}`;
}

/** One contract call — the shape both the single "contract-call" mode and
 *  each entry of "batch" mode share, so the batch tab can reuse the exact
 *  same per-call fields/parsing as the single-call tab. */
export interface ContractCall {
  targetAddress: `0x${string}`;
  /** Native ETH value to send with the call, as a plain decimal string (e.g. "0.01"). */
  value: string;
  /** A single human-readable function signature, e.g. "function transfer(address to, uint256 amount)". */
  functionAbi: string;
  /** Raw string values keyed by parameter name — coerced via the repo's existing abiArgParser. */
  argValues: Record<string, string>;
}

export interface ContractCallInput extends ContractCall {
  mode: "contract-call";
}

/** Multiple calls routed and signed as ONE Universal Transaction — the
 *  Particle SDK's createUniversalTransaction already accepts an array of
 *  calls; this just exposes that as its own composer mode. */
export interface BatchInput {
  mode: "batch";
  calls: ContractCall[];
}

export type ComposerInput = TransferInput | ContractCallInput | BatchInput;

export type ComposerStatus = "idle" | "previewing" | "ready" | "executing" | "done" | "error";

function buildContractCallData(input: ContractCall) {
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
        "Connect your CRUZ wallet (Magic) to compose a transaction, you can still export a " +
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
          : input.mode === "batch"
            ? await ua.createUniversalTransaction({
                chainId: arbitrumOne.id,
                expectTokens: [],
                transactions: input.calls.map((c) => ({
                  to: c.targetAddress,
                  data: buildContractCallData(c),
                  value: parseEther(c.value || "0").toString(),
                })),
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
      setError(describeWeb3Error(e, "Preview failed"));
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
      const id = (result?.transactionId as string | undefined) ?? transaction.transactionId;
      setTxId(id);
      if (lastInput) useComposerHistory.getState().add(lastInput, id);
      setStatus("done");
    } catch (e) {
      setError(describeWeb3Error(e, "Execution failed"));
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
