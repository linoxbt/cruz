import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { TemplatePicker } from "@/components/studio/scaffolder/TemplatePicker";
import { ConfigForm } from "@/components/studio/scaffolder/ConfigForm";
import { ResultPanel } from "@/components/studio/scaffolder/ResultPanel";
import {
  buildUnifiedWalletTemplate,
  UNIFIED_WALLET_TEMPLATE,
  type ScaffoldConfig,
} from "@/lib/studio-templates/unifiedWallet";

export const Route = createFileRoute("/scaffolder")({
  head: () => ({ meta: [{ title: "Starter Scaffolder — CRUZ" }] }),
  component: ScaffolderPage,
});

function ScaffolderPage() {
  const [templateId, setTemplateId] = useState<string>(UNIFIED_WALLET_TEMPLATE.id);
  const [config, setConfig] = useState<ScaffoldConfig>({
    projectName: "my-universal-app",
    embeddedWallet: false,
    gasSponsorship: false,
  });

  // Pure/deterministic — no server round-trip needed for generation itself,
  // only for the GitHub/Vercel delivery steps (which need a token server-side).
  const files = useMemo(() => buildUnifiedWalletTemplate(config), [config]);

  return (
    <div>
      <PageHeader
        breadcrumb={["CRUZ", "Starter Scaffolder"]}
        title="Starter App Scaffolder"
        subtitle="Generate a complete, chain-abstracted starter app with Universal Accounts pre-wired, and deliver it via GitHub or Vercel."
      />
      <div className="space-y-6 p-6">
        <TemplatePicker selected={templateId} onSelect={setTemplateId} />
        <ConfigForm config={config} onChange={setConfig} />
        <ResultPanel files={files} projectName={config.projectName} />
      </div>
    </div>
  );
}
