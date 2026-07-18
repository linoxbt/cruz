import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bot, PackagePlus } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { TemplatePicker } from "@/components/studio/scaffolder/TemplatePicker";
import { ConfigForm } from "@/components/studio/scaffolder/ConfigForm";
import { ResultPanel } from "@/components/studio/scaffolder/ResultPanel";
import { AiBuilderProjectPicker } from "@/components/studio/scaffolder/AiBuilderProjectPicker";
import { useConversations } from "@/lib/studio-ai/conversations";
import {
  buildUnifiedWalletTemplate,
  UNIFIED_WALLET_TEMPLATE,
  type ScaffoldConfig,
} from "@/lib/studio-templates/unifiedWallet";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/scaffolder")({
  head: () => ({ meta: [{ title: "Starter Scaffolder — CRUZ" }] }),
  component: ScaffolderPage,
});

type Source = "template" | "ai-builder";

function ScaffolderPage() {
  const [source, setSource] = useState<Source>("template");

  const [templateId, setTemplateId] = useState<string>(UNIFIED_WALLET_TEMPLATE.id);
  const [config, setConfig] = useState<ScaffoldConfig>({
    projectName: "my-universal-app",
    embeddedWallet: false,
    gasSponsorship: false,
  });
  // Pure/deterministic — no server round-trip needed for generation itself,
  // only for the GitHub/Vercel delivery steps (which need a token server-side).
  const templateFiles = useMemo(() => buildUnifiedWalletTemplate(config), [config]);

  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const conversations = useConversations((s) => s.conversations);
  const selectedConversation = conversations.find((c) => c.id === selectedConversationId) ?? null;

  return (
    <div>
      <PageHeader
        breadcrumb={["CRUZ", "Starter Scaffolder"]}
        title="Starter App Scaffolder"
        subtitle="Generate a chain-abstracted starter app — from a fixed template or something you already built in the AI Builder — and deliver it via GitHub, Vercel, or Netlify."
      />
      <div className="space-y-6 p-6">
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            onClick={() => setSource("template")}
            className={cn(
              "flex items-center gap-2 rounded-sm border px-3 py-2 text-left font-mono text-xs transition",
              source === "template"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50",
            )}
          >
            <PackagePlus className="h-3.5 w-3.5 shrink-0" />
            <span>
              Fixed template
              <span className="block text-[10px] text-meta">Universal Accounts pre-wired</span>
            </span>
          </button>
          <button
            onClick={() => setSource("ai-builder")}
            className={cn(
              "flex items-center gap-2 rounded-sm border px-3 py-2 text-left font-mono text-xs transition",
              source === "ai-builder"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50",
            )}
          >
            <Bot className="h-3.5 w-3.5 shrink-0" />
            <span>
              From AI Builder
              <span className="block text-[10px] text-meta">
                Deliver something you already built
              </span>
            </span>
          </button>
        </div>

        {source === "template" ? (
          <>
            <TemplatePicker selected={templateId} onSelect={setTemplateId} />
            <ConfigForm config={config} onChange={setConfig} />
            <ResultPanel files={templateFiles} projectName={config.projectName} />
          </>
        ) : selectedConversation ? (
          <>
            <div className="flex items-center justify-between rounded-sm border border-border bg-surface px-3 py-2">
              <span className="font-mono text-xs text-foreground">
                {selectedConversation.projectName || selectedConversation.title}
              </span>
              <Button variant="outline" size="sm" onClick={() => setSelectedConversationId(null)}>
                Change project
              </Button>
            </div>
            <ResultPanel
              files={selectedConversation.files}
              projectName={selectedConversation.projectName}
            />
          </>
        ) : (
          <AiBuilderProjectPicker
            selectedId={selectedConversationId}
            onSelect={setSelectedConversationId}
          />
        )}
      </div>
    </div>
  );
}
