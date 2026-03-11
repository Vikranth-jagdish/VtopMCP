import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VtopClient } from "../services/vtop-client.js";
import { parseTimetable } from "../services/vtop-parser.js";
import { SemesterInputSchema } from "../schemas/index.js";

export function registerTimetableTool(server: McpServer, client: VtopClient) {
  server.tool(
    "get_timetable",
    "Get class timetable/schedule with courses, slots, venues, and faculty. Requires semesterId from get_semesters.",
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
