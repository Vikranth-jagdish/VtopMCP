import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VtopClient } from "../services/vtop-client.js";
import { parseAttendance } from "../services/vtop-parser.js";
import { ENDPOINTS } from "../services/constants.js";
import { SemesterInputSchema } from "../schemas/index.js";
import { mkJsonTool } from "./_helpers.js";

export function registerAttendanceTool(server: McpServer, client: VtopClient) {
  mkJsonTool(
    server,
    "get_attendance",
    "Get attendance records for all courses (attended/total/percentage per course). If the response contains NOT_AUTHENTICATED, immediately call get_captcha → login (no need to ask the user — credentials are pre-configured via env vars) and then retry this tool. semesterId is optional; omit for current semester. Requires login.",
    SemesterInputSchema.shape,
    async ({ semesterId }) => {
      const id = semesterId ?? (await client.getCurrentSemesterId());
      const html = await client.fetchPage(ENDPOINTS.attendance, {
        semesterSubId: id,
      });
      return parseAttendance(html);
    },
    {
      emptyMessage:
        "No attendance records found. The semester may not have started or the page format may have changed.",
    }
  );
}
