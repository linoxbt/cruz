import { createFileRoute } from "@tanstack/react-router";

// GitHub OAuth callback — the second half of the "Connect GitHub" flow on
// the Settings page. Opened in a popup (see settings.tsx's connectGithub()),
// so instead of redirecting anywhere, this exchanges the code for a token
// server-side (the client secret never reaches the browser) and hands the
// result back to the opener window via postMessage, then closes itself.
// That avoids ever putting the token in a URL (query string or fragment),
// browser history, or a server log.
//
// Requires a GitHub OAuth App (github.com/settings/developers) with this
// route's full URL registered as its callback — VITE_GITHUB_OAUTH_CLIENT_ID
// (public) and GITHUB_OAUTH_CLIENT_SECRET (server-only) must both be set.
export const Route = createFileRoute("/api/oauth/github/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const errorParam = url.searchParams.get("error");

        const respond = (payload: {
          ok: boolean;
          token?: string;
          login?: string;
          message?: string;
        }) =>
          new Response(
            `<!doctype html><html><body style="font-family:monospace;background:#0b0f1a;color:#e5e7eb;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<p>${payload.ok ? "Connected. You can close this window." : `Failed: ${payload.message ?? "unknown error"}`}</p>
<script>
  if (window.opener) {
    window.opener.postMessage(${JSON.stringify({ type: "github-oauth-result", ...payload })}, window.location.origin);
  }
  setTimeout(() => window.close(), ${payload.ok ? 600 : 3000});
</script>
</body></html>`,
            { headers: { "content-type": "text/html" } },
          );

        if (errorParam) {
          return respond({ ok: false, message: errorParam });
        }
        if (!code) {
          return respond({ ok: false, message: "No authorization code received." });
        }

        const clientId = process.env.VITE_GITHUB_OAUTH_CLIENT_ID || "";
        const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET || "";
        if (!clientId || !clientSecret) {
          return respond({
            ok: false,
            message: "GitHub OAuth isn't configured on this deployment (missing client id/secret).",
          });
        }

        try {
          const tokenResp = await fetch("https://github.com/login/oauth/access_token", {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
          });
          const tokenJson = (await tokenResp.json()) as {
            access_token?: string;
            error_description?: string;
          };
          if (!tokenJson.access_token) {
            return respond({
              ok: false,
              message: tokenJson.error_description || "GitHub didn't return an access token.",
            });
          }

          const userResp = await fetch("https://api.github.com/user", {
            headers: {
              authorization: `Bearer ${tokenJson.access_token}`,
              accept: "application/vnd.github+json",
            },
          });
          const userJson = (await userResp.json()) as { login?: string };

          return respond({
            ok: true,
            token: tokenJson.access_token,
            login: userJson.login || "GitHub",
          });
        } catch (e) {
          return respond({
            ok: false,
            message: e instanceof Error ? e.message : "Token exchange failed.",
          });
        }
      },
    },
  },
});
