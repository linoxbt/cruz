import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Check, Github } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useDeployConnections } from "@/lib/studio/deployConnections";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings | CRUZ" }] }),
  component: SettingsPage,
});

const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_OAUTH_CLIENT_ID as string | undefined;

function SettingsPage() {
  return (
    <div>
      <PageHeader
        breadcrumb={["CRUZ", "Settings"]}
        title="Settings"
        subtitle="Connect GitHub once here, the Scaffolder and AI Builder read this instead of asking for a token on every deploy."
      />
      <div className="space-y-4 p-6">
        <GithubSection />
      </div>
    </div>
  );
}

/* ─────────── GitHub, real OAuth, no pasted token ─────────── */

function GithubSection() {
  const github = useDeployConnections((s) => s.github);
  const setGithub = useDeployConnections((s) => s.setGithub);
  const clearGithub = useDeployConnections((s) => s.clearGithub);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type !== "github-oauth-result") return;
      setConnecting(false);
      if (e.data.ok) {
        setGithub({ token: e.data.token, login: e.data.login });
        setError(null);
      } else {
        setError(e.data.message || "GitHub connection failed.");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [setGithub]);

  const connect = () => {
    if (!GITHUB_CLIENT_ID) {
      setError(
        "GitHub OAuth isn't configured on this deployment. Set VITE_GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET (see REQUIREMENTS.md).",
      );
      return;
    }
    setError(null);
    setConnecting(true);
    const redirectUri = `${window.location.origin}/api/oauth/github/callback`;
    const params = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      scope: "repo",
      redirect_uri: redirectUri,
      state: crypto.randomUUID(),
    });
    popupRef.current = window.open(
      `https://github.com/login/oauth/authorize?${params.toString()}`,
      "cruz-github-oauth",
      "width=600,height=700",
    );
  };

  return (
    <div className="rounded-sm border border-border bg-surface p-4">
      <div className="flex items-center gap-2 font-mono text-xs font-bold text-foreground">
        <Github className="h-4 w-4" /> GitHub
      </div>
      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
        Authenticates with a real &quot;Login with GitHub&quot;, no personal access token to create
        or paste. The token this issues is scoped to repo creation only and stored in this browser.
      </p>
      <div className="mt-3">
        {github ? (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 font-mono text-xs text-success">
              <Check className="h-3.5 w-3.5" /> Connected as {github.login}
            </span>
            <Button variant="outline" size="sm" onClick={clearGithub}>
              Disconnect
            </Button>
          </div>
        ) : (
          <Button onClick={connect} disabled={connecting}>
            {connecting ? "Waiting for GitHub…" : "Connect GitHub"}
          </Button>
        )}
        {error && <p className="mt-2 font-mono text-[11px] text-destructive">{error}</p>}
      </div>
    </div>
  );
}
