import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Github, Rocket, Globe, FileCode2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/shared/CodeBlock";
import { useEditorIntake } from "@/lib/editor-intake";
import { pushToGithubRepo, deployToVercel, deployToNetlify } from "@/lib/api/studio.functions";
import { UNIFIED_WALLET_TEMPLATE } from "@/lib/studio-templates/unifiedWallet";
import { downloadZip } from "@/lib/zip";

export function ResultPanel({
  files,
  projectName,
}: {
  files: Record<string, string>;
  projectName: string;
}) {
  const navigate = useNavigate();
  const setPending = useEditorIntake((s) => s.setPending);

  const [githubToken, setGithubToken] = useState("");
  const [githubPrivate, setGithubPrivate] = useState(true);
  const [githubBusy, setGithubBusy] = useState(false);
  const [githubResult, setGithubResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [vercelToken, setVercelToken] = useState("");
  const [vercelBusy, setVercelBusy] = useState(false);
  const [vercelResult, setVercelResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [netlifyToken, setNetlifyToken] = useState("");
  const [netlifyBusy, setNetlifyBusy] = useState(false);
  const [netlifyResult, setNetlifyResult] = useState<{ ok: boolean; message: string } | null>(null);

  const downloadArchive = () => {
    // No secrets required — a real, runnable .zip of the generated project
    // (npm install && npm run dev works locally), for when the user doesn't
    // want to hand over a GitHub/Vercel/Netlify token.
    downloadZip(files, projectName || "cruz-starter");
  };

  const pushGithub = async () => {
    setGithubBusy(true);
    setGithubResult(null);
    try {
      const res = await pushToGithubRepo({
        data: { token: githubToken, repoName: projectName, files, private: githubPrivate },
      });
      setGithubResult(
        res.ok ? { ok: true, message: res.repoUrl } : { ok: false, message: res.message },
      );
    } catch (e) {
      setGithubResult({ ok: false, message: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setGithubBusy(false);
    }
  };

  const deploy = async () => {
    setVercelBusy(true);
    setVercelResult(null);
    try {
      const res = await deployToVercel({ data: { token: vercelToken, projectName, files } });
      setVercelResult(
        res.ok ? { ok: true, message: res.url ?? "Deployed" } : { ok: false, message: res.message },
      );
    } catch (e) {
      setVercelResult({ ok: false, message: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setVercelBusy(false);
    }
  };

  const deployNetlify = async () => {
    setNetlifyBusy(true);
    setNetlifyResult(null);
    try {
      const res = await deployToNetlify({
        data: { token: netlifyToken, siteName: projectName, files },
      });
      setNetlifyResult(
        res.ok
          ? { ok: true, message: res.url ? `${res.url} (${res.state})` : `Deployed (${res.state})` }
          : { ok: false, message: res.message },
      );
    } catch (e) {
      setNetlifyResult({ ok: false, message: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setNetlifyBusy(false);
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
        <div className="mt-3 space-y-2">
          <Label className="font-mono text-xs">Personal access token (repo-creation scope)</Label>
          <Input
            type="password"
            value={githubToken}
            onChange={(e) => setGithubToken(e.target.value)}
            placeholder="ghp_…"
            className="font-mono text-xs"
          />
          <div className="flex items-center justify-between pt-1">
            <Label className="font-mono text-xs">Private repo</Label>
            <Switch checked={githubPrivate} onCheckedChange={setGithubPrivate} />
          </div>
          <Button onClick={pushGithub} disabled={githubBusy || !githubToken || !projectName}>
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
      </div>

      <div className="rounded-sm border border-border bg-surface p-4">
        <div className="flex items-center gap-2 font-mono text-xs font-bold text-foreground">
          <Rocket className="h-4 w-4" /> Deploy to Vercel
        </div>
        <div className="mt-3 space-y-2">
          <Label className="font-mono text-xs">Vercel API token</Label>
          <Input
            type="password"
            value={vercelToken}
            onChange={(e) => setVercelToken(e.target.value)}
            placeholder="…"
            className="font-mono text-xs"
          />
          <Button onClick={deploy} disabled={vercelBusy || !vercelToken || !projectName}>
            {vercelBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Deploy"}
          </Button>
          {vercelResult && (
            <div
              className={`font-mono text-xs ${vercelResult.ok ? "text-success" : "text-destructive"}`}
            >
              {vercelResult.message}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-sm border border-border bg-surface p-4">
        <div className="flex items-center gap-2 font-mono text-xs font-bold text-foreground">
          <Globe className="h-4 w-4" /> Deploy to Netlify
        </div>
        <div className="mt-3 space-y-2">
          <Label className="font-mono text-xs">Netlify personal access token</Label>
          <Input
            type="password"
            value={netlifyToken}
            onChange={(e) => setNetlifyToken(e.target.value)}
            placeholder="…"
            className="font-mono text-xs"
          />
          <Button onClick={deployNetlify} disabled={netlifyBusy || !netlifyToken || !projectName}>
            {netlifyBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Deploy"}
          </Button>
          {netlifyResult && (
            <div
              className={`font-mono text-xs ${netlifyResult.ok ? "text-success" : "text-destructive"}`}
            >
              {netlifyResult.message}
            </div>
          )}
        </div>
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
