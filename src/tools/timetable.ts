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
    "Get class timetable/schedule (courses, slots, venues, faculty, credits). If the response contains NOT_AUTHENTICATED, immediately call get_captcha then login then retry this tool. login auto-uses VTOP_USERNAME/VTOP_PASSWORD env vars if set; if login replies that credentials are missing, ask the user for their VTOP username and password and call login again with them. semesterId is optional; omit for current semester. Requires login.",
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
