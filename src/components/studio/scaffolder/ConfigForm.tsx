import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { ScaffoldConfig } from "@/lib/studio-templates/unifiedWallet";

export function ConfigForm({
  config,
  onChange,
}: {
  config: ScaffoldConfig;
  onChange: (config: ScaffoldConfig) => void;
}) {
  return (
    <div className="rounded border border-border bg-surface p-4 space-y-4">
      <div>
        <Label className="font-mono text-xs">Project name</Label>
        <Input
          value={config.projectName}
          onChange={(e) => onChange({ ...config, projectName: e.target.value })}
          className="mt-1 font-mono text-xs"
        />
      </div>
      <div className="flex items-center justify-between">
        <Label className="font-mono text-xs">Magic embedded wallet</Label>
        <Switch
          checked={config.embeddedWallet}
          onCheckedChange={(v) => onChange({ ...config, embeddedWallet: v })}
        />
      </div>
      <div className="flex items-center justify-between">
        <Label className="font-mono text-xs">Gas sponsorship</Label>
        <Switch
          checked={config.gasSponsorship}
          onCheckedChange={(v) => onChange({ ...config, gasSponsorship: v })}
        />
      </div>
      <div className="font-mono text-xs text-meta">
        Target chain: Arbitrum One (fixed for Tier 1)
      </div>
    </div>
  );
}
