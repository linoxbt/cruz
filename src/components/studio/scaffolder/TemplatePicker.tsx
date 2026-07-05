import { PackagePlus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
        <Card
          key={t.id}
          className={cn("cursor-pointer transition", selected === t.id && "border-primary")}
          onClick={() => onSelect(t.id)}
        >
          <CardHeader>
            <PackagePlus className="h-6 w-6 text-primary" />
            <CardTitle className="text-base">{t.label}</CardTitle>
            <CardDescription>{t.description}</CardDescription>
          </CardHeader>
          <CardContent>
            {t.hasDemoContract && (
              <span className="font-mono text-[10px] uppercase tracking-wider text-meta">
                Includes a demo contract
              </span>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
