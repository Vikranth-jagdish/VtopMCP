import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VtopClient } from "../services/vtop-client.js";
import { parseTimetable } from "../services/vtop-parser.js";
import { ENDPOINTS } from "../services/constants.js";
import { SemesterInputSchema } from "../schemas/index.js";
import { mkJsonTool } from "./_helpers.js";

export function registerTimetableTool(server: McpServer, client: VtopClient) {
  mkJsonTool(
    server,
    "get_timetable",
    "Get class timetable/schedule (courses, slots, venues, faculty, credits). If the response contains NOT_AUTHENTICATED, immediately call get_captcha → login (no need to ask the user — credentials are pre-configured via env vars) and then retry this tool. semesterId is optional; omit for current semester. Requires login.",
    SemesterInputSchema.shape,
    async ({ semesterId }) => {
      const id = semesterId ?? (await client.getCurrentSemesterId());
      const html = await client.fetchPage(ENDPOINTS.timetable, {
        semesterSubId: id,
      });
      return parseTimetable(html);
    },
    {
      emptyMessage:
        "No timetable found for this semester. It may not have been published yet.",
    }
  );
}
