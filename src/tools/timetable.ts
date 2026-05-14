import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VtopClient } from "../services/vtop-client.js";
import { parseTimetable } from "../services/vtop-parser.js";
import { SemesterInputSchema } from "../schemas/index.js";

export function registerTimetableTool(server: McpServer, client: VtopClient) {
  server.tool(
    "get_timetable",
    "Get class timetable/schedule (courses, slots, venues, faculty, credits). If the response contains NOT_AUTHENTICATED, immediately call get_captcha → login (no need to ask the user — credentials are pre-configured via env vars) and then retry this tool. semesterId is optional; omit for current semester. Requires login.",
    SemesterInputSchema.shape,
    async ({ semesterId }) => {
      try {
        const payload: Record<string, string> = {};
        if (semesterId) payload.semesterSubId = semesterId;

        const html = await client.fetchPage(
          "processViewTimeTable",
          payload
        );
        const slots = parseTimetable(html);

        if (slots.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No timetable data found. The semester may not have started yet.",
              },
            ],
          };
        }

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(slots, null, 2) },
          ],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${msg}` }],
          isError: true,
        };
      }
    }
  );
}
