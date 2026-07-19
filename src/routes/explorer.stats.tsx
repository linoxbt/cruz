import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { ClientOnly } from "@/components/shared/ClientOnly";
import { ExplorerCharts } from "@/components/explorer/Charts";
import { useStatsOverview, StatsGrid } from "@/components/explorer/StatsOverview";

export const Route = createFileRoute("/explorer/stats")({
  head: () => ({ meta: [{ title: "Stats - Explorer" }] }),
  component: StatsPage,
});

function StatsPage() {
  const { stats, gas, coinPrice, change24h, marketCap } = useStatsOverview();

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h1 className="font-mono text-lg font-bold text-foreground">Arbitrum One Stats</h1>
      </div>

      <StatsGrid
        stats={stats}
        gas={gas}
        coinPrice={coinPrice}
        change24h={change24h}
        marketCap={marketCap}
      />

      <ClientOnly fallback={<div className="h-56" />}>
        <ExplorerCharts />
      </ClientOnly>
    </div>
  );
}
