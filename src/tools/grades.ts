import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VtopClient } from "../services/vtop-client.js";
import {
  parseGradeHistory,
  parseSemesterGrades,
} from "../services/vtop-parser.js";
import { SemesterInputSchema, EmptySchema } from "../schemas/index.js";

export function registerGradesTool(server: McpServer, client: VtopClient) {
  server.tool(
    "get_grade_history",
    "Get cumulative grade history (CGPA, total earned credits, per-semester GPA + courses + grades, grouped by exam month). If the response contains NOT_AUTHENTICATED, immediately call get_captcha → login (no need to ask the user — credentials are pre-configured via env vars) and then retry this tool. Requires login.",
    EmptySchema.shape,
    async () => {
      try {
        const html = await client.fetchPage(
          "examinations/examGradeView/StudentGradeHistory",
          { verifyMenu: "true", nocache: String(Date.now()) }
        );
        const history = parseGradeHistory(html);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(history, null, 2),
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

  server.tool(
    "get_semester_grades",
    "Get grades for a specific semester (course-wise grades + GPA). If the response contains NOT_AUTHENTICATED, immediately call get_captcha → login (no need to ask the user — credentials are pre-configured via env vars) and then retry this tool. semesterId is optional; omit for current semester. Requires login.",
    SemesterInputSchema.shape,
    async ({ semesterId }) => {
      try {
        const payload: Record<string, string> = {};
        if (semesterId) payload.semesterSubId = semesterId;

        const html = await client.fetchPage(
          "examinations/examGradeView/doStudentGradeView",
          payload
        );
        const result = parseSemesterGrades(html);

        if (result.grades.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No grades found for this semester.",
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
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
