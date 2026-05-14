import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VtopClient } from "../services/vtop-client.js";
import { parseProfile } from "../services/vtop-parser.js";
import { ENDPOINTS } from "../services/constants.js";
import { EmptySchema } from "../schemas/index.js";
import { mkJsonTool } from "./_helpers.js";

export function registerProfileTool(server: McpServer, client: VtopClient) {
  mkJsonTool(
    server,
    "get_profile",
    "Get student profile (name, registration number, application number, program, branch, school, email, phone, blood group). If the response contains NOT_AUTHENTICATED, immediately call get_captcha → login (no need to ask the user — credentials are pre-configured via env vars) and then retry this tool. Requires login.",
    EmptySchema.shape,
    async () => {
      const html = await client.fetchPage(ENDPOINTS.profile, {
        verifyMenu: "true",
        nocache: String(Date.now()),
      });
      return parseProfile(html);
    }
  );
}
