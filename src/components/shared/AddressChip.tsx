import { Copy, ExternalLink, Check } from "lucide-react";
import { useState } from "react";
import { truncateAddress } from "@/lib/wallet";
import { arbitrumOne } from "@/lib/chains";
import { cn } from "@/lib/utils";

interface Props {
  address: string;
  full?: boolean;
  className?: string;
}

// CRUZ has a single chain (Arbitrum One) and no in-app explorer, so this chip
// links straight to Arbiscan. No on-chain label registry in CRUZ either.
export function AddressChip({ address, full = false, className }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const explorer = arbitrumOne.blockExplorers.default.url;
  const href = `${explorer}/address/${address}`;

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", className)}>
      <span className="text-foreground">{full ? address : truncateAddress(address)}</span>
      <button
        onClick={copy}
        className="text-meta transition hover:text-muted-foreground"
        aria-label="Copy address"
      >
        {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
      </button>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-meta transition hover:text-muted-foreground"
        aria-label="View on Arbiscan"
      >
        <ExternalLink className="h-3 w-3" />
      </a>
    </span>
  );
}
