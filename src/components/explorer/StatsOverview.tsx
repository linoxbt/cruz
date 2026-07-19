import { useQuery } from "@tanstack/react-query";
import { useExplorer } from "@/hooks/useExplorer";
import { getEthPrice } from "@/lib/api/chainPrice.functions";
import { StatCard } from "@/components/explorer/ui";
import { withCommas, formatGwei } from "@/lib/explorer/format";
import type { ExStats } from "@/lib/explorer/types";

// Shared stats fetching + derivation, used by both the explorer dashboard (a
// compact preview) and the dedicated /stats page (the full grid).
export function useStatsOverview() {
  const { data: stats } = useExplorer<ExStats>("/stats", { refetchInterval: 20_000 });
  // CoinGecko fallback for price + 24h change (Blockscout sometimes returns a
  // null change even when coin_price itself is populated).
  const { data: price } = useQuery({
    queryKey: ["eth-price"],
    queryFn: () => getEthPrice(),
    refetchInterval: 60_000,
    staleTime: 45_000,
  });

  const gas = stats?.gas_prices?.average;

  const coinPrice =
    stats?.coin_price != null ? Number(stats.coin_price) : price?.ok ? price.usd : null;
  const change24h =
    stats?.coin_price_change_percentage != null
      ? stats.coin_price_change_percentage
      : price?.ok
        ? price.change24h
        : null;
  // Blockscout returns market_cap: "0" (i.e. "we don't have this") rather than
  // null when it has no real figure — treat 0 the same as missing.
  const marketCap =
    stats?.market_cap && Number(stats.market_cap) > 0
      ? Number(stats.market_cap)
      : price?.ok
        ? price.marketCap
        : null;

  return { stats, gas, coinPrice, change24h, marketCap };
}

// The full 8-card stats grid.
export function StatsGrid({
  stats,
  gas,
  coinPrice,
  change24h,
  marketCap,
}: {
  stats: ExStats | undefined;
  gas: number | undefined;
  coinPrice: number | null;
  change24h: number | null;
  marketCap: number | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <StatCard
        label="ETH Price"
        value={
          coinPrice != null
            ? `$${coinPrice.toLocaleString(undefined, { maximumFractionDigits: 6 })}`
            : "-"
        }
        sub={
          change24h != null ? (
            <span className={change24h >= 0 ? "text-success" : "text-danger"}>
              {change24h >= 0 ? "▲" : "▼"} {change24h >= 0 ? "+" : ""}
              {change24h.toFixed(2)}% (24h)
            </span>
          ) : undefined
        }
      />
      <StatCard
        label="Market Cap"
        value={marketCap != null ? `$${withCommas(marketCap.toFixed(0))}` : "-"}
      />
      <StatCard
        label="Avg Block Time"
        value={stats?.average_block_time ? `${(stats.average_block_time / 1000).toFixed(1)}s` : "-"}
      />
      <StatCard
        label="Total Blocks"
        value={stats?.total_blocks ? withCommas(stats.total_blocks) : "-"}
      />
      <StatCard
        label="Total Transactions"
        value={stats?.total_transactions ? withCommas(stats.total_transactions) : "-"}
      />
      <StatCard label="Gas Price" value={gas != null ? formatGwei(String(gas * 1e9)) : "-"} />
      <StatCard
        label="Wallet Addresses"
        value={stats?.total_addresses ? withCommas(stats.total_addresses) : "-"}
      />
      <StatCard
        label="Gas Used Today"
        value={stats?.gas_used_today ? withCommas(stats.gas_used_today) : "-"}
      />
    </div>
  );
}
