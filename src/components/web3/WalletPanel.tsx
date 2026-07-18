import { useState } from "react";
import { Copy, Check, Wallet, LogOut, Fuel } from "lucide-react";
import { useAccount, useBalance, useDisconnect } from "wagmi";
import { truncateAddress } from "@/lib/wallet";
import { arbitrumOne } from "@/lib/chains";
import { ConnectModal } from "./ConnectModal";

// Native ETH balance below this is treated as "too low for gas" on Arbitrum.
const LOW_GAS_THRESHOLD = 0.001;

// Sidebar wallet section: connect via Magic (email + OAuth), then show the
// live native ETH balance on Arbitrum One.
export function WalletPanel() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({
    address,
    chainId: arbitrumOne.id,
    query: { enabled: isConnected, refetchInterval: 30_000 },
  });
  const [copied, setCopied] = useState(false);
  const [showConnect, setShowConnect] = useState(false);

  const copyAddr = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard permission denied — copied stays false, no false-positive checkmark */
    }
  };

  if (!isConnected || !address) {
    return (
      <>
        <button
          onClick={() => setShowConnect(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 font-mono text-xs font-medium text-primary-foreground hover:bg-primary-hover"
        >
          <Wallet className="h-3.5 w-3.5" /> Connect Wallet
        </button>
        {showConnect && <ConnectModal onClose={() => setShowConnect(false)} />}
      </>
    );
  }

  const lowGas = balance ? Number(balance.formatted) < LOW_GAS_THRESHOLD : false;

  return (
    <>
      <button
        onClick={copyAddr}
        className="group flex w-full items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5 text-left transition hover:border-primary/50"
      >
        <span className="h-2 w-2 rounded-full bg-success" />
        <span className="text-xs text-foreground">{truncateAddress(address)}</span>
        {copied ? (
          <Check className="ml-auto h-3 w-3 text-success" />
        ) : (
          <Copy className="ml-auto h-3 w-3 text-meta group-hover:text-muted-foreground" />
        )}
      </button>

      <div className="mt-2 space-y-1 text-[10px]">
        <div className="flex items-center justify-between">
          <span className="text-meta">ETH</span>
          <span className="text-muted-foreground">
            {balance ? Number(balance.formatted).toFixed(4) : "…"}
          </span>
        </div>
      </div>

      {lowGas && (
        <a
          href="https://bungee.exchange/"
          target="_blank"
          rel="noreferrer"
          className="mt-2 flex items-center justify-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-[10px] text-warning hover:bg-warning/20"
        >
          <Fuel className="h-3 w-3" /> Get ETH for gas
        </a>
      )}

      <div className="mt-2 flex items-center justify-end">
        <button
          onClick={() => disconnect()}
          className="flex items-center gap-1 text-[10px] text-meta hover:text-danger"
        >
          <LogOut className="h-3 w-3" /> Disconnect
        </button>
      </div>
    </>
  );
}
