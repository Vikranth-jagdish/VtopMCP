import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VtopClient } from "../services/vtop-client.js";
import { parseCurriculumProgress } from "../services/vtop-parser.js";
import { EmptySchema } from "../schemas/index.js";

export function registerCurriculumTool(
  server: McpServer,
  client: VtopClient
) {
  server.tool(
    "get_curriculum_progress",
    "Get degree progress: total credits earned vs required (and remaining), per-category breakdown (Foundation Core, Discipline Core, Discipline Electives, Open Electives, Projects/Internship, etc.), per-basket completion (HSM Elective, Foreign Language, Extra-curricular, ...), CGPA, and grade-letter counts across all semesters. Use this for any 'how many credits left?', 'how close am I to graduating?', 'which baskets do I still need?', or 'how many of each grade have I gotten?' questions. If the response contains NOT_AUTHENTICATED, immediately call get_captcha → login (no need to ask the user — credentials are pre-configured via env vars) and then retry this tool. Requires login.",
    EmptySchema.shape,
    async () => {
      try {
        const html = await client.fetchPage(
          "examinations/examGradeView/StudentGradeHistory",
          { verifyMenu: "true", nocache: String(Date.now()) }
        );
        const progress = parseCurriculumProgress(html);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(progress, null, 2),
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
