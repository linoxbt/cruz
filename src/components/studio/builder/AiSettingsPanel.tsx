import { useEffect, useState } from "react";
import { Check, Sparkles, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  AI_PROVIDERS,
  AI_PROVIDER_LIST,
  useAiSettings,
  useAiServerStatus,
  type AiProvider,
} from "@/lib/ai-settings";
import { cn } from "@/lib/utils";

// Provider/model/key settings for the AI Builder. Two clearly-labeled modes:
// CRUZ's own default (no key needed, as long as CRUZ's server is configured)
// or bring-your-own-key — same trust model as the Scaffolder's GitHub/Vercel
// token cards in ResultPanel.tsx: a key you paste is stored only in this
// browser, never sent anywhere except that provider's own API.
//
// Nothing commits until Save is clicked — provider/model/key are held as a
// local draft first, so switching providers to look at models doesn't
// silently overwrite what's actually active.
export function AiSettingsPanel() {
  const settings = useAiSettings();
  const serverStatus = useAiServerStatus();

  const [mode, setMode] = useState<"default" | "own">(settings.proxy ? "default" : "own");
  const [draftProvider, setDraftProvider] = useState<AiProvider>(settings.provider);
  const [draftModel, setDraftModel] = useState(settings.model);
  const [draftKey, setDraftKey] = useState(settings.keys[settings.provider] ?? "");
  const [justSaved, setJustSaved] = useState(false);

  // Switching the draft provider shows whatever key is already stored for
  // it (if any), rather than carrying over the previous provider's key.
  useEffect(() => {
    setDraftKey(settings.keys[draftProvider] ?? "");
    const preset = AI_PROVIDERS[draftProvider];
    setDraftModel((m) => (preset.models.includes(m) ? m : preset.models[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftProvider]);

  const dirty =
    mode !== (settings.proxy ? "default" : "own") ||
    (mode === "own" &&
      (draftProvider !== settings.provider ||
        draftModel !== settings.model ||
        draftKey !== (settings.keys[draftProvider] ?? "")));

  const canSaveDefault = mode === "default" && serverStatus.configured;
  const canSaveOwn = mode === "own" && draftKey.trim().length > 0;

  const handleSave = () => {
    if (mode === "default") {
      settings.setProxy(true);
    } else {
      settings.setProxy(false);
      settings.setProvider(draftProvider);
      settings.setModel(draftModel);
      settings.setKey(draftKey);
    }
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1600);
  };

  return (
    <div className="space-y-3 rounded-sm border border-border bg-surface p-4">
      <div className="font-mono text-xs uppercase tracking-wider text-meta">AI settings</div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setMode("default")}
          disabled={!serverStatus.checked || !serverStatus.configured}
          className={cn(
            "flex items-center gap-2 rounded-sm border px-3 py-2 text-left font-mono text-xs transition disabled:cursor-not-allowed disabled:opacity-40",
            mode === "default"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/50",
          )}
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          <span>
            CRUZ Default AI
            <span className="block text-[10px] text-meta">No key needed</span>
          </span>
        </button>
        <button
          onClick={() => setMode("own")}
          className={cn(
            "flex items-center gap-2 rounded-sm border px-3 py-2 text-left font-mono text-xs transition",
            mode === "own"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/50",
          )}
        >
          <User className="h-3.5 w-3.5 shrink-0" />
          <span>
            Use my own key
            <span className="block text-[10px] text-meta">OpenAI, Claude, OpenRouter…</span>
          </span>
        </button>
      </div>

      {mode === "default" && !serverStatus.configured && serverStatus.checked && (
        <p className="font-mono text-[11px] text-muted-foreground">
          CRUZ&apos;s default AI isn&apos;t configured on this deployment (see REQUIREMENTS.md) —
          use your own key instead.
        </p>
      )}
      {mode === "default" && serverStatus.configured && (
        <p className="font-mono text-[11px] text-muted-foreground">
          Requests route through CRUZ&apos;s own server — no key required, and nothing leaves the
          server.
        </p>
      )}

      {mode === "own" && (
        <>
          <div>
            <Label className="font-mono text-xs">Provider</Label>
            <select
              value={draftProvider}
              onChange={(e) => setDraftProvider(e.target.value as AiProvider)}
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground"
            >
              {AI_PROVIDER_LIST.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label className="font-mono text-xs">Model</Label>
            <select
              value={draftModel}
              onChange={(e) => setDraftModel(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground"
            >
              {AI_PROVIDERS[draftProvider].models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label className="font-mono text-xs">API key</Label>
            <Input
              type="password"
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              placeholder={AI_PROVIDERS[draftProvider].keyPlaceholder}
              className="mt-1 font-mono text-xs"
            />
            {AI_PROVIDERS[draftProvider].keyHint && (
              <p className="mt-1 font-mono text-[10px] text-meta">
                Get one at {AI_PROVIDERS[draftProvider].keyHint}. Stored only in this browser,
                sent only to that provider&apos;s own API.
              </p>
            )}
          </div>
        </>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Button
          onClick={handleSave}
          disabled={!dirty || (mode === "default" ? !canSaveDefault : !canSaveOwn)}
        >
          Save
        </Button>
        {justSaved && (
          <span className="flex items-center gap-1 font-mono text-xs text-success">
            <Check className="h-3.5 w-3.5" /> Saved
          </span>
        )}
        {!justSaved && dirty && (
          <span className="font-mono text-[11px] text-meta">Unsaved changes</span>
        )}
      </div>
    </div>
  );
}
