import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Monorepo root (parent of `mcp/`). */
const repoRoot = path.resolve(__dirname, "..", "..");

const ALLOWED_DOCS = [
  "docs/USAGE.md",
  "docs/DOCUMENTATION_INDEX.md",
  "README.md",
  "website/README.md",
] as const;

type AllowedDoc = (typeof ALLOWED_DOCS)[number];

function readDocSlice(rel: AllowedDoc, startLine?: number, endLine?: number): string {
  const full = path.join(repoRoot, rel);
  if (!existsSync(full)) {
    throw new Error(`File not found: ${rel}`);
  }
  const text = readFileSync(full, "utf8");
  const lines = text.split(/\r?\n/);
  const start = startLine != null ? Math.max(0, startLine - 1) : 0;
  const end = endLine != null ? Math.min(lines.length, endLine) : lines.length;
  return lines
    .slice(start, end)
    .map((line, i) => `${String(start + i + 1).padStart(5, " ")}|${line}`)
    .join("\n");
}

const server = new McpServer({
  name: "stratum-map-mcp",
  version: "1.0.0",
});

server.registerTool(
  "list_npm_scripts",
  {
    description: "List npm scripts from the monorepo root and website/package.json (read-only).",
    inputSchema: z.object({}),
  },
  async () => {
    const rootPkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const webPkg = JSON.parse(readFileSync(path.join(repoRoot, "website", "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const body = JSON.stringify(
      { root: rootPkg.scripts ?? {}, website: webPkg.scripts ?? {} },
      null,
      2,
    );
    return { content: [{ type: "text" as const, text: body }] };
  },
);

server.registerTool(
  "read_repo_doc",
  {
    description:
      "Read a slice of an allowlisted documentation file (1-based line numbers). Paths are repo-relative.",
    inputSchema: z.object({
      file: z.enum(ALLOWED_DOCS),
      startLine: z.number().int().positive().optional(),
      endLine: z.number().int().positive().optional(),
    }),
  },
  async ({ file, startLine, endLine }) => {
    const text = readDocSlice(file, startLine, endLine);
    return { content: [{ type: "text" as const, text }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
