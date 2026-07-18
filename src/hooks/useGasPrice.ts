import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http, formatUnits } from "viem";
import { arbitrumOne } from "@/lib/chains";

const client = createPublicClient({ chain: arbitrumOne, transport: http() });

/** Live gas price on Arbitrum One, in Gwei — one of the dashboard's
 *  always-visible app stats (doesn't need a connected wallet). */
export function useGasPrice() {
  return useQuery({
    queryKey: ["chain", "gas-price", arbitrumOne.id],
    queryFn: async () => Number(formatUnits(await client.getGasPrice(), 9)),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
