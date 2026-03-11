import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VtopClient } from "../services/vtop-client.js";
import { parseExamSchedule } from "../services/vtop-parser.js";
import { SemesterInputSchema } from "../schemas/index.js";

export function registerExamScheduleTool(
  server: McpServer,
  client: VtopClient
) {
  server.tool(
    "get_exam_schedule",
    "Get exam schedule with dates, timings, venues, and seat numbers. Requires semesterId from get_semesters.",
    SemesterInputSchema.shape,
    async ({ semesterId }) => {
      try {
        const payload: Record<string, string> = {};
        if (semesterId) payload.semesterSubId = semesterId;

        const html = await client.fetchPage(
          "examinations/doSearchExamScheduleForStudent",
          payload
        );
        const schedules = parseExamSchedule(html);

        if (schedules.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No exam schedule found. The schedule may not have been published yet.",
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(schedules, null, 2),
            },
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
