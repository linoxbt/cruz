import { useState } from "react";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBilling, type FundAsset } from "@/hooks/useBilling";
import { formatCents } from "@/lib/billing/format";
import { cn } from "@/lib/utils";

// Moves funds from the connected wallet to the CRUZ treasury; the ledger is
// credited only after the transfer is verified on-chain server-side (a
// client-asserted amount never credits anything). Balances shown for context
// come from the unified-balance/native reads already used elsewhere.
export function FundingModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { fund } = useBilling();
  const [asset, setAsset] = useState<FundAsset>("usdc");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const valid = /^\d+(\.\d+)?$/.test(amount) && Number(amount) > 0;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const res = await fund(asset, amount);
      if (res.ok) {
        toast.success(
          res.creditedCents != null
            ? `Added ${formatCents(res.creditedCents)} to your CRUZ balance.`
            : "Funds credited.",
        );
        setAmount("");
        onOpenChange(false);
      } else {
        toast.error(res.message || "Funding failed.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Funding failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" /> Add funds
          </DialogTitle>
          <DialogDescription>
            Fund your prepaid CRUZ balance from your connected wallet. Your balance is spent down as
            you build, at cost. Funds are credited after the transfer is confirmed on-chain.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="font-mono text-xs">Asset</Label>
            <div className="mt-1 flex gap-2">
              {(["usdc", "eth"] as FundAsset[]).map((a) => (
                <button
                  key={a}
                  onClick={() => setAsset(a)}
                  disabled={busy}
                  className={cn(
                    "flex-1 rounded-sm border px-3 py-2 font-mono text-xs uppercase",
                    asset === a
                      ? "border-primary text-primary"
                      : "border-border text-meta hover:text-foreground",
                  )}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="font-mono text-xs">Amount ({asset.toUpperCase()})</Label>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={asset === "usdc" ? "10" : "0.005"}
              inputMode="decimal"
              disabled={busy}
              className="mt-1 font-mono text-xs"
            />
            {asset === "eth" && (
              <p className="mt-1 font-mono text-[10px] text-meta">
                ETH is credited at its USD value at the time of funding.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={submit} disabled={!valid || busy}>
            {busy ? "Confirming on-chain…" : `Fund with ${asset.toUpperCase()}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
