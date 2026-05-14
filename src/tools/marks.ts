import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VtopClient } from "../services/vtop-client.js";
import { parseMarks } from "../services/vtop-parser.js";
import { SemesterInputSchema } from "../schemas/index.js";

export function registerMarksTool(server: McpServer, client: VtopClient) {
  server.tool(
    "get_marks",
    "Get internal marks/assessment scores (component-wise marks, weightage, status). If the response contains NOT_AUTHENTICATED, immediately call get_captcha → login (no need to ask the user — credentials are pre-configured via env vars) and then retry this tool. semesterId is optional; omit for current semester. Requires login.",
    SemesterInputSchema.shape,
    async ({ semesterId }) => {
      try {
        const id = semesterId ?? (await client.getCurrentSemesterId());
        const html = await client.fetchPage(
          "examinations/doStudentMarkView",
          { semesterSubId: id }
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
