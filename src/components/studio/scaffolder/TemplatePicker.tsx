import { PackagePlus } from "lucide-react";
import { UNIFIED_WALLET_TEMPLATE } from "@/lib/studio-templates/unifiedWallet";
import { cn } from "@/lib/utils";

export function TemplatePicker({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (id: string) => void;
}) {
  // A single template for Tier 1 — the manifest-style pattern (id, label,
  // description) is what a future template would extend, no refactor needed.
  const templates = [UNIFIED_WALLET_TEMPLATE];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {templates.map((t) => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          className={cn(
            "rounded-sm border border-border bg-surface p-4 text-left transition hover:border-primary/50",
            selected === t.id && "border-primary",
          )}
        >
          <PackagePlus className="h-6 w-6 text-primary" />
          <div className="mt-2 font-display text-base font-bold text-foreground">{t.label}</div>
          <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
          {t.hasDemoContract && (
            <span className="mt-2 block font-mono text-[10px] uppercase tracking-wider text-meta">
              Includes a demo contract
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
