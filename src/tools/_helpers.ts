import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";

type ContentItem =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

type ToolResult = {
  content: ContentItem[];
  isError?: boolean;
};

/**
 * Register an MCP tool whose handler just returns plain JSON-serializable
 * data (or an array of content items). Wraps the handler with the standard
 * try/catch + JSON.stringify response shape so each tool file stays small.
 *
 * Pass `emptyMessage` to override the "(no data)" text when the handler
 * returns an empty array.
 */
export function mkJsonTool<Shape extends z.ZodRawShape>(
  server: McpServer,
  name: string,
  description: string,
  schema: Shape,
  handler: (args: z.infer<z.ZodObject<Shape>>) => Promise<unknown | ContentItem[]>,
  opts?: { emptyMessage?: string }
): void {
  server.tool(
    name,
    description,
    schema,
    async (args: z.infer<z.ZodObject<Shape>>): Promise<ToolResult> => {
      try {
        const out = await handler(args);

        // Handler may return pre-built content items (e.g. image responses)
        if (Array.isArray(out) && out.length > 0 && isContentItem(out[0])) {
          return { content: out as ContentItem[] };
        }

        if (
          opts?.emptyMessage &&
          ((Array.isArray(out) && out.length === 0) ||
            (out && typeof out === "object" && "grades" in (out as object) &&
              Array.isArray((out as { grades: unknown[] }).grades) &&
              (out as { grades: unknown[] }).grades.length === 0))
        ) {
          return { content: [{ type: "text", text: opts.emptyMessage }] };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error: ${msg}` }],
          isError: true,
        };
      }
    }
  );
}

function isContentItem(x: unknown): x is ContentItem {
  return (
    !!x &&
    typeof x === "object" &&
    "type" in x &&
    ((x as { type: string }).type === "text" ||
      (x as { type: string }).type === "image")
  );
}
