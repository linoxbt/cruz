import { useAccount, useConnectors } from "wagmi";
import type {
  EIP7702Authorization,
  ITransaction,
  UniversalAccount,
} from "@particle-network/universal-account-sdk";

// Magic exposes its SDK instance on the wagmi connector's `magic` field (see
// @magiclabs/wagmi-connector's dedicatedWalletConnector return type). We use
// magic.wallet.sign7702Authorization for the EIP-7702 auth (the standardized
// 7702 digest, which Particle's EIP-7702 mode needs) and magic's EIP-1193
// personal_sign for the transaction's own rootHash signature.

/** Get the active Magic SDK instance from the connected wagmi connector. */
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
 * delegated on that chain yet), Magic's `sign7702Authorization` produces the
 * signed authorization object, which we reformat into Particle's
 * `EIP7702Authorization` ({ userOpHash, signature }) shape. The transaction's
 * own rootHash is signed via Magic's personal_sign.
 */
export async function signAndSendWithMagic(
  ua: import("@particle-network/universal-account-sdk").UniversalAccount,
  tx: ITransaction,
  magic: {
    wallet: {
      sign7702Authorization: (a: {
        contractAddress: string;
        chainId: number;
        nonce?: number;
      }) => Promise<{
        contractAddress: string;
        chainId: number;
        nonce: number;
        v: number;
        r: string;
        s: string;
      }>;
    };
  } & {
    rpc?: { send: (m: string, p?: unknown[]) => Promise<unknown> };
  },
  signerAddress: `0x${string}`,
) {
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

  // Sign the transaction's rootHash via Magic's personal_sign (EIP-191).
  const txSignature = (await magic.rpc!.send("personal_sign", [
    tx.rootHash,
    signerAddress,
  ])) as `0x${string}`;

  return ua.sendTransaction(tx, txSignature, authorizations);
}
