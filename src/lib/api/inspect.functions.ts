import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { lookup } from "node:dns/promises";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rateLimit.server";
import { getRequest } from "@tanstack/react-start/server";

// Lets the AI Builder "look at" a website a user pastes for design
// inspiration. This is a TEXT-based inspection (title, meta description,
// visible copy) fed to the model as context — not a screenshot or visual
// analysis. Real visual inspection would need a headless browser (Playwright/
// Puppeteer) rendering the page and either passing a screenshot to a
// vision-capable model or doing DOM/CSS analysis; that's a fundamentally
// different, much heavier server dependency (a real browser binary, GB-scale
// cold starts) that doesn't fit this app's plain-fetch serverless functions.
// This gets the practical value (the model can reference the target site's
// content, structure, and stated purpose) without pretending to do more.
//
// Fetching an arbitrary user-supplied URL server-side is a textbook SSRF
// vector — a malicious "inspiration" URL could otherwise be used to probe
// CRUZ's own hosting network (internal services, cloud metadata endpoints
// like 169.254.169.254). Mitigations below: scheme allowlist, hostname/IP
// literal blocklist, a DNS-resolution check before connecting, manual
// (re-validated) redirect handling, a response size cap, and a timeout — on
// top of the same per-IP/global rate limit used for the AI proxy, since this
// also spends server resources on every call.

const MAX_BYTES = 500_000;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;
const PER_IP_LIMIT = 15;
const GLOBAL_LIMIT = 200;
const WINDOW_MS = 5 * 60 * 1000;

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true; // malformed → treat as unsafe
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local + cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true; // link-local + unique-local
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return false;
}

function isPrivateIp(ip: string): boolean {
  return ip.includes(":") ? isPrivateIpv6(ip) : isPrivateIpv4(ip);
}

const BLOCKED_HOSTNAMES = new Set(["localhost", "0.0.0.0", "metadata.google.internal"]);

/** Validates scheme + hostname literal, then resolves DNS and rejects if any
 *  resolved address is private/loopback/link-local. Best-effort against DNS
 *  rebinding (the actual fetch below re-resolves independently rather than
 *  connecting to a pinned IP) — a real defense-in-depth setup would pin the
 *  checked IP for the connection itself, which plain `fetch` doesn't expose;
 *  this is a meaningful reduction in risk, not a hard guarantee. */
async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Not a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http/https URLs are allowed.");
  }
  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".local")) {
    throw new Error("That host isn't allowed.");
  }
  // Literal IP in the URL — check directly without a DNS round-trip.
  if (/^[\d.]+$/.test(hostname) || hostname.includes(":")) {
    if (isPrivateIp(hostname)) throw new Error("That host isn't allowed.");
    return url;
  }
  try {
    const results = await lookup(hostname, { all: true });
    if (results.some((r) => isPrivateIp(r.address))) {
      throw new Error("That host resolves to a private address and isn't allowed.");
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("private address")) throw e;
    throw new Error("Couldn't resolve that host.");
  }
  return url;
}

async function fetchWithSizeCap(
  url: URL,
  signal: AbortSignal,
): Promise<{ text: string; finalUrl: string }> {
  let current = url;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const resp = await fetch(current, {
      signal,
      redirect: "manual",
      headers: { "user-agent": "CruzAiBuilder/1.0 (+design inspiration fetch)" },
    });
    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.get("location");
      if (!location) throw new Error("Redirect with no location header.");
      current = await assertSafeUrl(new URL(location, current).toString());
      continue;
    }
    if (!resp.ok || !resp.body) throw new Error(`Fetch failed (${resp.status}).`);

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let out = "";
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      out += decoder.decode(value, { stream: true });
      if (bytes >= MAX_BYTES) {
        await reader.cancel().catch(() => {});
        break;
      }
    }
    return { text: out, finalUrl: current.toString() };
  }
  throw new Error("Too many redirects.");
}

function extractTag(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function summarize(html: string): { title: string; description: string; text: string } {
  const title = decodeEntities(extractTag(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ?? "");
  const description = decodeEntities(
    extractTag(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ??
      extractTag(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i) ??
      "",
  );
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const text = decodeEntities(withoutNoise.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
  return { title, description, text };
}

const inspectInput = z.object({ url: z.string().min(1) });

export const fetchUrlForInspiration = createServerFn({ method: "POST" })
  .inputValidator(inspectInput)
  .handler(async ({ data }) => {
    const request = getRequest();
    const ip = clientKeyFromRequest(request);
    if (
      !checkRateLimit(`inspect:ip:${ip}`, PER_IP_LIMIT, WINDOW_MS) ||
      !checkRateLimit("inspect:global", GLOBAL_LIMIT, WINDOW_MS)
    ) {
      return { ok: false as const, message: "Rate limit exceeded. Try again shortly." };
    }

    try {
      const safeUrl = await assertSafeUrl(data.url);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const { text: html, finalUrl } = await fetchWithSizeCap(safeUrl, controller.signal);
        const { title, description, text } = summarize(html);
        return { ok: true as const, url: finalUrl, title, description, text };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (e) {
      return {
        ok: false as const,
        message: e instanceof Error ? e.message : "Couldn't fetch that URL.",
      };
    }
  });
