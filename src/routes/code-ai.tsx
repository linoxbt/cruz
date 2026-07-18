import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shared/PageHeader";
import { AiChat } from "@/components/editor/AiChat";

// Standalone "Code with AI" page — the same single-file Solidity assistant
// embedded in the Contract Editor's side panel, on its own tab for when you
// just want to ask/write/audit without a workspace open. Shares its chat
// history (editorChatStore.ts) with the editor panel, so a conversation
// started here picks up right where it left off there, and vice versa.
export const Route = createFileRoute("/code-ai")({
  head: () => ({ meta: [{ title: "Code with AI — CRUZ" }] }),
  component: CodeWithAiPage,
});

function CodeWithAiPage() {
  return (
    <div className="flex h-[calc(100vh-0px)] flex-col">
      <PageHeader
        breadcrumb={["CRUZ", "Code with AI"]}
        title="Code with AI"
        subtitle="Write, debug, and explain Solidity contracts with an AI assistant."
      />
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden p-4">
        <div className="flex-1 overflow-hidden rounded border border-border">
          <AiChat placeholder="Ask the AI to write or review a contract…" />
        </div>
      </div>
    </div>
  );
}
