import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VtopClient } from "../services/vtop-client.js";
import { parseExamSchedule } from "../services/vtop-parser.js";
import { ENDPOINTS } from "../services/constants.js";
import { SemesterInputSchema } from "../schemas/index.js";
import { mkJsonTool } from "./_helpers.js";

export function registerExamScheduleTool(
  server: McpServer,
  client: VtopClient
) {
  mkJsonTool(
    server,
    "get_exam_schedule",
    "Get exam schedule (CAT1/CAT2/FAT dates, timings, venues, seat numbers, row/col). If the response contains NOT_AUTHENTICATED, immediately call get_captcha → login (no need to ask the user — credentials are pre-configured via env vars) and then retry this tool. semesterId is optional; omit for current semester. Requires login.",
    SemesterInputSchema.shape,
    async ({ semesterId }) => {
      const id = semesterId ?? (await client.getCurrentSemesterId());
      const html = await client.fetchPage(ENDPOINTS.examSchedule, {
        semesterSubId: id,
      });
      return parseExamSchedule(html);
    },
    {
      emptyMessage:
        "No exam schedule found for this semester. It may not have been released yet.",
    }
  );
}
