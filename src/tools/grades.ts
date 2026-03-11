import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VtopClient } from "../services/vtop-client.js";
import { parseGradeHistory } from "../services/vtop-parser.js";
import { EmptySchema } from "../schemas/index.js";

export function registerGradesTool(server: McpServer, client: VtopClient) {
  server.tool(
    "get_grade_history",
    "Get complete grade history across all semesters, including CGPA and credits earned.",
    EmptySchema.shape,
    async () => {
      try {
        const html = await client.fetchPage(
          "/vtop/examinations/doStudentGradeHistory"
        );
        const history = parseGradeHistory(html);

        if (history.semesters.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No grade history found.",
              },
            ],
          };
        }

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
}
