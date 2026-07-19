import { createPublicClient, http, getAddress, type Log, type PublicClient } from "viem";
import { arbitrumOne, ARBITRUM_USDC } from "@/lib/chains";
import { billingConfig } from "./config.server";
import { getEthPrice } from "@/lib/api/chainPrice.functions";

// Independently confirms a funding transaction on-chain before crediting the
// ledger — the security requirement is that CRUZ never trusts a client's "I
// paid X" claim. Every credited amount is read straight from chain data:
// value/logs of the real, mined transaction, with `to` == CRUZ treasury and
// `from` == the authenticated wallet. A claim with no matching transfer
// credits nothing.

let client: PublicClient | null = null;
function publicClient(): PublicClient {
  if (!client) client = createPublicClient({ chain: arbitrumOne, transport: http() });
  return client;
}

const TRANSFER_TOPIC0 = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"; // keccak256("Transfer(address,address,uint256)")

export interface VerifyResult {
  ok: boolean;
  amountCents?: number;
  message?: string;
}

function sameAddr(a: string | undefined, b: string): boolean {
  return !!a && a.toLowerCase() === b.toLowerCase();
}

/** Verifies a native-ETH transfer to the treasury and returns the USD-cents
 *  credit (converted at the current ETH price from the existing oracle). */
async function verifyEth(
  txHash: `0x${string}`,
  from: string,
  treasury: string,
): Promise<VerifyResult> {
  const pc = publicClient();
  const [receipt, tx] = await Promise.all([
    pc.getTransactionReceipt({ hash: txHash }),
    pc.getTransaction({ hash: txHash }),
  ]);
  if (receipt.status !== "success") return { ok: false, message: "Transaction did not succeed." };
  if (!sameAddr(tx.to ?? undefined, treasury))
    return { ok: false, message: "Transaction was not sent to the CRUZ treasury." };
  if (!sameAddr(tx.from, from))
    return { ok: false, message: "Transaction was not sent from your wallet." };
  if (tx.value <= 0n) return { ok: false, message: "Transaction transferred no ETH." };

  // Convert wei -> ETH -> USD cents using the existing CoinGecko-backed oracle.
  const price = await getEthPrice();
  const usdPerEth = price.ok ? price.usd : 0;
  if (!usdPerEth) return { ok: false, message: "Could not determine ETH price for conversion." };
  const eth = Number(tx.value) / 1e18;
  const amountCents = Math.floor(eth * usdPerEth * 100);
  if (amountCents <= 0) return { ok: false, message: "Transfer amount rounds to zero credit." };
  return { ok: true, amountCents };
}

/** Verifies a USDC (6-decimal) ERC-20 transfer to the treasury by decoding the
 *  Transfer logs emitted by the USDC contract. 1 USDC == 100 cents. Sums every
 *  matching from->treasury transfer in the tx (normally exactly one). */
async function verifyUsdc(
  txHash: `0x${string}`,
  from: string,
  treasury: string,
): Promise<VerifyResult> {
  const pc = publicClient();
  const receipt = await pc.getTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") return { ok: false, message: "Transaction did not succeed." };

  const usdc = getAddress(ARBITRUM_USDC);
  let total = 0n;
  for (const log of receipt.logs as Log[]) {
    if (!sameAddr(log.address, usdc)) continue;
    // Transfer(from indexed, to indexed, value): topics = [sig, from, to], data = value.
    if (log.topics.length < 3 || log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC0) continue;
    const topicFrom = `0x${log.topics[1]!.slice(26)}`;
    const topicTo = `0x${log.topics[2]!.slice(26)}`;
    if (!sameAddr(topicFrom, from) || !sameAddr(topicTo, treasury)) continue;
    total += BigInt(log.data);
  }
  if (total <= 0n)
    return {
      ok: false,
      message: "No USDC transfer to the CRUZ treasury found in this transaction.",
    };
  // USDC has 6 decimals; cents = units / 1e6 * 100 = units / 1e4.
  const amountCents = Math.floor(Number(total) / 1e4);
  if (amountCents <= 0) return { ok: false, message: "Transfer amount rounds to zero credit." };
  return { ok: true, amountCents };
}

/** Verifies a funding transaction on-chain and returns the USD-cents to
 *  credit. Callers must have already confirmed `from` is the authenticated
 *  wallet and handled tx-hash dedup (bill:funded:{txHash}) before crediting. */
export async function verifyFunding(
  asset: "eth" | "usdc",
  txHash: `0x${string}`,
  from: `0x${string}`,
): Promise<VerifyResult> {
  const { treasuryAddress } = billingConfig();
  if (!treasuryAddress) return { ok: false, message: "Treasury address is not configured." };
  try {
    return asset === "eth"
      ? await verifyEth(txHash, from, treasuryAddress)
      : await verifyUsdc(txHash, from, treasuryAddress);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "On-chain verification failed." };
  }
}
