import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VtopClient } from "../services/vtop-client.js";
import { parseProfile } from "../services/vtop-parser.js";
import { EmptySchema } from "../schemas/index.js";

export function registerProfileTool(server: McpServer, client: VtopClient) {
  server.tool(
    "get_profile",
    "Get student profile information including name, registration number, program, branch, and contact details.",
    EmptySchema.shape,
    async () => {
      try {
        const html = await client.fetchPage(
          "/vtop/studentsRecord/doStudentProfileAllView"
        );
        const profile = parseProfile(html);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(profile, null, 2),
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
