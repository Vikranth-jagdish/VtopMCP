import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VtopClient } from "../services/vtop-client.js";
import { parseProfile } from "../services/vtop-parser.js";
import { EmptySchema } from "../schemas/index.js";

export function registerProfileTool(server: McpServer, client: VtopClient) {
  server.tool(
    "get_profile",
    "Get student profile (name, registration number, application number, program, branch, school, email, phone, blood group). If the response contains NOT_AUTHENTICATED, immediately call get_captcha → login (no need to ask the user — credentials are pre-configured via env vars) and then retry this tool. Requires login.",
    EmptySchema.shape,
    async () => {
      try {
        const html = await client.fetchPage(
          "studentsRecord/StudentProfileAllView",
          { verifyMenu: "true", nocache: String(Date.now()) }
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
