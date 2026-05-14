import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VtopClient } from "../services/vtop-client.js";
import { parseAttendance } from "../services/vtop-parser.js";
import { SemesterInputSchema } from "../schemas/index.js";

export function registerAttendanceTool(server: McpServer, client: VtopClient) {
  server.tool(
    "get_attendance",
    "Get attendance records for all courses (attended/total/percentage per course). If the response contains NOT_AUTHENTICATED, immediately call get_captcha → login (no need to ask the user — credentials are pre-configured via env vars) and then retry this tool. semesterId is optional; omit for current semester. Requires login.",
    SemesterInputSchema.shape,
    async ({ semesterId }) => {
      try {
        const payload: Record<string, string> = {};
        if (semesterId) payload.semesterSubId = semesterId;

        const html = await client.fetchPage(
          "processViewStudentAttendance",
          payload
        );
        const records = parseAttendance(html);

        if (records.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No attendance records found. The semester may not have started or the page format may have changed.",
              },
            ],
          };
        }

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(records, null, 2) },
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
