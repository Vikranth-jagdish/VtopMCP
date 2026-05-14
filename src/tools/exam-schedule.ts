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
    "Get exam schedule (CAT1/CAT2/FAT dates, timings, venues, seat numbers, row/col). If the response contains NOT_AUTHENTICATED, immediately call get_captcha → login (no need to ask the user — credentials are pre-configured via env vars) and then retry this tool. semesterId is optional; omit for current semester. Requires login.",
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
