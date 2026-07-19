import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FundingModal } from "./FundingModal";
import { SpendingAuthModal } from "./SpendingAuthModal";

// Inline blocking state shown in the AI Builder when a generation is paused
// for billing — either the wallet needs verifying (to start / re-authorize)
// or funds are needed. `detail` carries the reason-specific message. CTAs open
// the verify/fund modals; once resolved, "Continue" re-runs the gated prompt
// (same resume shape as the plan-approval banner).
export function NeedsFundingBanner({
  detail,
  onContinue,
}: {
  detail: string;
  onContinue: () => void;
}) {
  const [fundOpen, setFundOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <div className="space-y-2 rounded-sm border border-warning/40 bg-warning/5 p-4">
      <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-warning">
        <AlertTriangle className="h-3.5 w-3.5" /> One step to keep building
      </div>
      <p className="font-mono text-[11px] text-muted-foreground">{detail}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setAuthOpen(true)}>
          Verify wallet &amp; authorize
        </Button>
        <Button size="sm" variant="outline" onClick={() => setFundOpen(true)}>
          Add funds
        </Button>
        <Button size="sm" variant="ghost" onClick={onContinue}>
          Continue
        </Button>
      </div>
      <p className="font-mono text-[10px] text-meta">
        After verifying (and funding if needed), click Continue to resume this build.
      </p>

      <FundingModal open={fundOpen} onOpenChange={setFundOpen} />
      <SpendingAuthModal open={authOpen} onOpenChange={setAuthOpen} />
    </div>
  );
}
