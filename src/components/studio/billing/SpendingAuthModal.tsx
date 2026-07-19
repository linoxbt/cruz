import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, ShieldOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useBilling } from "@/hooks/useBilling";

// One-time (revocable) spending-authorization consent. Signing here does NOT
// move funds — it authorizes CRUZ to auto-debit the already-funded prepaid
// balance per generation, so the user isn't prompted to sign every prompt.
export function SpendingAuthModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { authorized, authorize, revoke } = useBilling();
  const [autoPay, setAutoPay] = useState(true);
  const [busy, setBusy] = useState(false);

  const doAuthorize = async () => {
    setBusy(true);
    try {
      const res = await authorize(autoPay);
      if (res.ok) {
        toast.success("Spending authorized. Your balance is now usable for builds.");
        onOpenChange(false);
      } else {
        toast.error(res.message || "Authorization failed.");
      }
    } finally {
      setBusy(false);
    }
  };

  const doRevoke = async () => {
    setBusy(true);
    try {
      const res = await revoke();
      if (res.ok) toast.success("Authorization revoked. Your balance is preserved.");
      else toast.error(res.message || "Revoke failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {authorized ? (
              <ShieldCheck className="h-4 w-4 text-success" />
            ) : (
              <ShieldOff className="h-4 w-4 text-warning" />
            )}
            Spending authorization
          </DialogTitle>
          <DialogDescription>
            Authorize CRUZ to automatically pay for AI Builder generations from your prepaid
            balance. This does not move any funds by itself and can be revoked at any time; your
            remaining balance is always preserved.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-sm border border-border bg-surface px-3 py-2">
          <div>
            <Label className="font-mono text-xs">Auto-pay</Label>
            <p className="mt-0.5 font-mono text-[11px] text-meta">
              Keep building without a prompt each time, until your balance runs low.
            </p>
          </div>
          <Switch checked={autoPay} onCheckedChange={setAutoPay} disabled={busy || authorized} />
        </div>

        <DialogFooter>
          {authorized ? (
            <Button variant="outline" onClick={doRevoke} disabled={busy}>
              Revoke authorization
            </Button>
          ) : (
            <Button onClick={doAuthorize} disabled={busy}>
              {busy ? "Waiting for signature…" : "Authorize spending"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
