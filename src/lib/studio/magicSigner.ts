import { useAccount, useConnectors } from "wagmi";
import { Magic } from "magic-sdk";
import type {
  EIP7702Authorization,
  ITransaction,
  UniversalAccount,
} from "@particle-network/universal-account-sdk";
import { arbitrumOne } from "@/lib/chains";

// Magic exposes its SDK instance on the wagmi connector's `magic` field (see
// @magiclabs/wagmi-connector's dedicatedWalletConnector return type) — but
// @magiclabs/wagmi-connector@2.3.2 (the latest published version) pins an
// old `magic-sdk@29.4.2` internally, which predates `wallet.sign7702Authorization`
// / `wallet.send7702Transaction` (added in `magic-sdk@33.1.0`). Those methods
// don't exist on the connector's own instance, so signing here goes through a
// second, directly-constructed `Magic` instance backed by a current
// `magic-sdk` (a direct CRUZ dependency, resolved independently of the
// connector's pinned nested copy). Magic's session lives in a relayer
// <iframe> keyed by apiKey + network config, not by JS object identity, so a
// second instance built with the same apiKey/network as wagmi.ts's connector
// (see MAGIC_PUBLISHABLE_KEY/network below) attaches to the same relayer and
// sees the same logged-in user — no separate login step required.
const MAGIC_PUBLISHABLE_KEY = import.meta.env.VITE_MAGIC_PUBLISHABLE_KEY || "";

let signingMagic: Magic | null = null;

/** The dedicated, capable Magic instance used for signing (see note above). */
function getSigningMagic(): Magic | null {
  if (!MAGIC_PUBLISHABLE_KEY) return null;
  if (!signingMagic) {
    signingMagic = new Magic(MAGIC_PUBLISHABLE_KEY, {
      network: {
        rpcUrl: arbitrumOne.rpcUrls.default.http[0],
        chainId: arbitrumOne.id,
      },
    });
  }
  return signingMagic;
}

/** Get the active Magic SDK instance from the connected wagmi connector — used
 *  only to gate "is a Magic wallet connected", not for signing (see above). */
export function useMagic() {
  const connectors = useConnectors();
  // The Magic connector is the only one CRUZ registers.
  const active = connectors[0] as unknown as { magic?: unknown } | undefined;
  return active?.magic ?? null;
}

/** The connected Magic wallet's EVM address. */
export function useMagicAddress() {
  return useAccount().address;
}

/**
 * Signs + submits a Universal Transaction through the connected Magic wallet.
 *
 * For any userOp carrying a pending `eip7702Auth` (i.e. the account isn't
 * delegated on that chain yet), Magic's `wallet.sign7702Authorization`
 * produces the signed authorization object ({ contractAddress, chainId,
 * nonce, v, r, s }), which we reformat into Particle's `EIP7702Authorization`
 * ({ userOpHash, signature }) shape. The transaction's own rootHash is signed
 * via Magic's real EIP-1193 `rpcProvider.send("personal_sign", ...)`.
 */
export async function signAndSendWithMagic(
  ua: UniversalAccount,
  tx: ITransaction,
  signerAddress: `0x${string}`,
) {
  const magic = getSigningMagic();
  if (!magic) {
    throw new Error("Magic isn't configured — set VITE_MAGIC_PUBLISHABLE_KEY.");
  }

  const authorizations: EIP7702Authorization[] = [];
  for (const op of tx.userOps) {
    if (!op.eip7702Auth) continue;
    const signed = await magic.wallet.sign7702Authorization({
      contractAddress: op.eip7702Auth.address as `0x${string}`,
      chainId: op.eip7702Auth.chainId,
      nonce: op.eip7702Auth.nonce,
    });
    // Particle's EIP7702Authorization is { userOpHash, signature } — we pack
    // the signed 7702 fields into a comma-joined signature string (matching
    // the wire format sendTransaction expects) and key it to the userOp.
    authorizations.push({
      userOpHash: op.userOpHash,
      signature: `${signed.contractAddress},${signed.chainId},${signed.nonce},${signed.v},${signed.r},${signed.s}`,
    });
  }

  // Sign the transaction's rootHash via Magic's real EIP-1193 provider —
  // mirrors @magiclabs/wagmi-connector's own internal `provider.send(...)`
  // usage pattern (see magicConnector.js's `getAccount`/`eth_accounts` call).
  const txSignature = (await magic.rpcProvider.send("personal_sign", [
    tx.rootHash,
    signerAddress,
  ])) as `0x${string}`;

  return ua.sendTransaction(tx, txSignature, authorizations);
}
