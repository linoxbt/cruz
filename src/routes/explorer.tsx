import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { Compass, ExternalLink } from "lucide-react";
import { arbitrumOne, chainConfig, ARBITRUM_BLOCKSCOUT_URL } from "@/lib/chains";

// CRUZ is single-chain (Arbitrum One only — see chains.ts), so unlike a
// multi-chain explorer this layout has no network dropdown: every page under
// /explorer always shows the same chain.
export const Route = createFileRoute("/explorer")({
  head: () => ({ meta: [{ title: "Explorer | CRUZ" }] }),
  component: ExplorerLayout,
});

function ExplorerLayout() {
  return (
    <div>
      <div className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 lg:px-6">
          <Link
            to="/explorer"
            className="flex items-center gap-2 font-mono text-sm font-bold text-foreground"
          >
            <Compass className="h-4 w-4 text-primary" /> Arbitrum Explorer
          </Link>

          <span className="inline-flex items-center gap-1.5 rounded border border-info/50 bg-info/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-info">
            <span className="h-1.5 w-1.5 rounded-full bg-info" />
            Mainnet
          </span>

          <div className="ml-auto flex items-center gap-3">
            <a
              href={ARBITRUM_BLOCKSCOUT_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono text-[11px] text-meta hover:text-primary"
              title="This data is read from Arbitrum's official Blockscout instance"
            >
              Data source <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href={chainConfig(arbitrumOne.id).explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-primary"
            >
              Open Arbiscan <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>

      <div className="p-4 lg:p-6">
        <Outlet />
      </div>
    </div>
  );
}
