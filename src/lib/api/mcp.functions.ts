import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// A real, narrow MCP client for the AI Builder — remote HTTP servers only,
// operator-allowlisted via MCP_SERVERS, off by default.
//
// Deliberately remote-only: no stdio/local-process transport is supported.
// Spawning a local process server-side would mean executing an arbitrary
// binary with the operator's own shell access on every call — a genuinely
// different (much larger) blast radius than a remote server, which only
// gets whatever that server itself chooses to expose over the network. This
// is a permanent scope line, not a "for now."
//
// MCP_SERVERS (server-only env var) is a JSON array of { name, url }. Unset
// or empty means the capability is simply inert — same "configured or it
// isn't" pattern as the AI proxy and GitHub OAuth. No server is hardcoded by
// default.

interface McpServerConfig {
  name: string;
  url: string;
}

function configuredServers(): McpServerConfig[] {
  const raw = process.env.MCP_SERVERS;
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is McpServerConfig => {
      if (!s || typeof s !== "object") return false;
      const rec = s as Record<string, unknown>;
      return typeof rec.name === "string" && typeof rec.url === "string";
    });
  } catch {
    return [];
  }
}

// Connects fresh per call rather than holding a long-lived connection —
// the simplest safe option for a stateless server fn, and MCP tool calls
// from the AI Builder are infrequent enough that reconnect overhead doesn't
// matter.
async function withClient<T>(url: string, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ name: "cruz-ai-builder", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url));
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

export interface McpToolInfo {
  server: string;
  tool: string;
  description?: string;
}

// Every tool from every configured server, for the system prompt to list.
// One unreachable server doesn't take down the others.
export const listMcpTools = createServerFn({ method: "GET" }).handler(async () => {
  const servers = configuredServers();
  const tools: McpToolInfo[] = [];
  await Promise.all(
    servers.map(async (s) => {
      try {
        const result = await withClient(s.url, (c) => c.listTools());
        for (const t of result.tools) {
          tools.push({ server: s.name, tool: t.name, description: t.description });
        }
      } catch {
        /* skip this server's tools if it's unreachable */
      }
    }),
  );
  return { tools };
});

const callInput = z.object({
  server: z.string().min(1),
  tool: z.string().min(1),
  args: z.record(z.string(), z.unknown()).optional(),
});

// Trimmed to a plain, explicitly JSON-serializable shape — the SDK's own
// CallToolResult type carries an `unknown`-typed field TanStack Start's
// serializability check rejects across the server-fn boundary, and the
// model only ever needs the text/data content anyway, not the full
// protocol envelope.
export interface McpCallResult {
  isError: boolean;
  content: Array<{ type: string; text?: string }>;
}

export const callMcpTool = createServerFn({ method: "POST" })
  .inputValidator(callInput)
  .handler(async ({ data }) => {
    const server = configuredServers().find((s) => s.name === data.server);
    if (!server) {
      return { ok: false as const, error: `Unknown MCP server "${data.server}".` };
    }
    try {
      const raw = await withClient(server.url, (c) =>
        c.callTool({ name: data.tool, arguments: data.args ?? {} }),
      );
      const result: McpCallResult = {
        isError: !!raw.isError,
        content: (Array.isArray(raw.content) ? raw.content : []).map((c) => ({
          type: typeof c.type === "string" ? c.type : "text",
          text: typeof c.text === "string" ? c.text : undefined,
        })),
      };
      return { ok: true as const, result };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "MCP call failed." };
    }
  });
