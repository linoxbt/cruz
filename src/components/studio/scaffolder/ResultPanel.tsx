import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Loader2, Github, FileCode2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CodeBlock } from "@/components/shared/CodeBlock";
import { useEditorIntake } from "@/lib/editor-intake";
import { pushToGithubRepo } from "@/lib/api/studio.functions";
import { UNIFIED_WALLET_TEMPLATE } from "@/lib/studio-templates/unifiedWallet";
import { downloadZip } from "@/lib/zip";
import { useDeployConnections } from "@/lib/studio/deployConnections";
import { useMyActivity } from "@/lib/studio/myActivity";

export function ResultPanel({
  files,
  projectName,
}: {
  files: Record<string, string>;
  projectName: string;
}) {
  const navigate = useNavigate();
  const setPending = useEditorIntake((s) => s.setPending);

  const github = useDeployConnections((s) => s.github);
  const addDeliveredRepo = useMyActivity((s) => s.addDeliveredRepo);

  const [githubPrivate, setGithubPrivate] = useState(true);
  const [githubBusy, setGithubBusy] = useState(false);
  const [githubResult, setGithubResult] = useState<{ ok: boolean; message: string } | null>(null);

  const downloadArchive = () => {
    // No secrets required — a real, runnable .zip of the generated project
    // (npm install && npm run dev works locally), for when the user doesn't
    // want to hand over a GitHub connection.
    downloadZip(files, projectName || "cruz-starter");
  };

  const pushGithub = async () => {
    if (!github) return;
    setGithubBusy(true);
    setGithubResult(null);
    try {
      // The repo name always mirrors the actual project you're delivering
      // (auto-suggested by the AI Builder, or whatever you named the
      // Scaffolder template) — never a generic placeholder.
      const res = await pushToGithubRepo({
        data: { token: github.token, repoName: projectName, files, private: githubPrivate },
      });
      if (res.ok) {
        setGithubResult({ ok: true, message: res.repoUrl });
        addDeliveredRepo({
          repoName: projectName,
          repoUrl: res.repoUrl,
          deliveredAt: Date.now(),
        });
      } else {
        setGithubResult({ ok: false, message: res.message });
      }
    } catch (e) {
      setGithubResult({ ok: false, message: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setGithubBusy(false);
    }
  };

  const openDemoContractInEditor = () => {
    const path = UNIFIED_WALLET_TEMPLATE.demoContractPath;
    const content = files[path];
    if (!content) return;
    setPending(path.split("/").pop() ?? "Contract.sol", content);
    navigate({ to: "/editor" });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-sm border border-border bg-surface p-4">
        <div className="font-mono text-xs uppercase tracking-wider text-meta">Generated files</div>
        <ul className="mt-2 space-y-0.5 font-mono text-xs text-muted-foreground">
          {Object.keys(files).map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" onClick={downloadArchive}>
            Download ZIP
          </Button>
          {UNIFIED_WALLET_TEMPLATE.hasDemoContract && (
            <Button variant="outline" onClick={openDemoContractInEditor}>
              <FileCode2 className="h-3.5 w-3.5" /> Open demo contract in Studio Editor
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-sm border border-border bg-surface p-4">
        <div className="flex items-center gap-2 font-mono text-xs font-bold text-foreground">
          <Github className="h-4 w-4" /> Push to a new GitHub repo
        </div>
        {!github ? (
          <p className="mt-3 font-mono text-[11px] text-muted-foreground">
            Not connected,{" "}
            <Link to="/settings" className="text-primary hover:underline">
              connect GitHub in Settings
            </Link>{" "}
            first.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            <p className="font-mono text-[11px] text-muted-foreground">
              Connected as <span className="text-foreground">{github.login}</span>, repo will be
              named <span className="text-foreground">{projectName || "(set a project name)"}</span>
              .
            </p>
            <div className="flex items-center justify-between pt-1">
              <Label className="font-mono text-xs">Private repo</Label>
              <Switch checked={githubPrivate} onCheckedChange={setGithubPrivate} />
            </div>
            <Button onClick={pushGithub} disabled={githubBusy || !projectName}>
              {githubBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create repo & push"}
            </Button>
            {githubResult && (
              <div
                className={`font-mono text-xs ${githubResult.ok ? "text-success" : "text-destructive"}`}
              >
                {githubResult.message}
              </div>
            )}
          </div>
        )}
      </div>

      <details>
        <summary className="cursor-pointer font-mono text-[11px] text-meta hover:text-foreground">
          Preview a generated file
        </summary>
        <div className="mt-2">
          <CodeBlock code={files["src/App.tsx"] ?? ""} language="typescript" maxHeight="16rem" />
        </div>
      </details>
    </div>
  );
}
