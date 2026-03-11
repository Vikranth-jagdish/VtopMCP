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
    "Get cumulative grade history with CGPA and total earned credits across all semesters.",
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
    "Get grades for a specific semester with course-wise grades and GPA. Requires semesterId from get_semesters.",
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
