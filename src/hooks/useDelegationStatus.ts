import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http } from "viem";
import { arbitrumOne } from "@/lib/chains";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

// EIP-7702 delegation designator: 0xef0100 followed by the 20-byte delegate address.
const EIP7702_PREFIX = "0xef0100";

export interface DelegationStatus {
  isUpgraded: boolean;
  delegateAddress: `0x${string}` | null;
  rawCode: `0x${string}`;
}

const arbitrumClient = createPublicClient({ chain: arbitrumOne, transport: http() });

/**
 * Reads the account's on-chain code via a raw eth_getCode call and checks for
 * the EIP-7702 delegation designator — the "proof of upgrade" the brief asks
 * for, independent of anything Particle-specific.
 */
export function useDelegationStatus(address: string | undefined) {
  const isValid = !!address && ADDRESS_RE.test(address);

  return useQuery<DelegationStatus>({
    queryKey: ["studio", "delegation-status", address?.toLowerCase()],
    queryFn: async () => {
      const code = await arbitrumClient.getCode({ address: address as `0x${string}` });
      const rawCode = (code ?? "0x") as `0x${string}`;
      const isUpgraded = rawCode.toLowerCase().startsWith(EIP7702_PREFIX);
      const delegateAddress = isUpgraded ? (`0x${rawCode.slice(8, 48)}` as `0x${string}`) : null;
      return { isUpgraded, delegateAddress, rawCode };
    },
    enabled: isValid,
    staleTime: 15_000,
  });
}
