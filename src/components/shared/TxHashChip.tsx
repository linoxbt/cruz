import { Copy, ExternalLink, Check } from "lucide-react";
import { useState } from "react";
import { truncateHash } from "@/lib/wallet";
import { arbitrumOne } from "@/lib/chains";
import { cn } from "@/lib/utils";

// Links straight to Arbiscan — CRUZ has no in-app explorer.
export function TxHashChip({ hash, className }: { hash: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const explorer = arbitrumOne.blockExplorers.default.url;
  const href = `${explorer}/tx/${hash}`;

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-code", className)}>
      <span>{truncateHash(hash)}</span>
      <button
        onClick={() => {
          navigator.clipboard.writeText(hash);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="text-meta transition hover:text-muted-foreground"
      >
        {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
      </button>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-meta transition hover:text-muted-foreground"
        title="View on Arbiscan"
      >
        <ExternalLink className="h-3 w-3" />
      </a>
    </span>
  );
}
