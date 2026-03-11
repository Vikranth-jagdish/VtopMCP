import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VtopClient } from "../services/vtop-client.js";
import { parseMarks } from "../services/vtop-parser.js";
import { SemesterInputSchema } from "../schemas/index.js";

export function registerMarksTool(server: McpServer, client: VtopClient) {
  server.tool(
    "get_marks",
    "Get internal marks/assessment scores for all courses. Shows component-wise marks, weightage, and status. Requires semesterId from get_semesters.",
    SemesterInputSchema.shape,
    async ({ semesterId }) => {
      try {
        const payload: Record<string, string> = {};
        if (semesterId) payload.semesterSubId = semesterId;

        const html = await client.fetchPage(
          "examinations/doStudentMarkView",
          payload
        );
        const records = parseMarks(html);

        if (records.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No marks data found. Marks may not have been published yet.",
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
