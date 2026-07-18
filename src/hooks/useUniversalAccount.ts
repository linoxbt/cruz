import { useQuery } from "@tanstack/react-query";
import { getUniversalAccount, isParticleConfigured } from "@/lib/studio/particle";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/** Unified cross-chain balance (Particle's Primary Assets) for any EOA. */
export function useUniversalAccount(address: string | undefined) {
  const isValid = !!address && ADDRESS_RE.test(address);

  return useQuery({
    queryKey: ["studio", "universal-account", "primary-assets", address?.toLowerCase()],
    queryFn: () => getUniversalAccount(address as `0x${string}`).getPrimaryAssets(),
    enabled: isValid && isParticleConfigured(),
    staleTime: 15_000,
    // Matches WalletPanel's native-balance polling cadence so the sidebar's
    // ETH balance and the dashboard's unified balance refresh in step,
    // instead of one auto-refreshing and the other going stale until the
    // next mount/navigation.
    refetchInterval: 30_000,
  });
}
