import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VtopClient } from "../services/vtop-client.js";
import { LoginSchema, EmptySchema } from "../schemas/index.js";

export function registerAuthTools(server: McpServer, client: VtopClient) {
  server.tool(
    "get_captcha",
    "Get a CAPTCHA image for VTOP login. Returns a base64-encoded image. Call this before login.",
    EmptySchema.shape,
    async () => {
      try {
        const captchaDataUrl = await client.getCaptcha();
        return {
          content: [
            {
              type: "image" as const,
              data: captchaDataUrl.replace(/^data:[^;]+;base64,/, ""),
              mimeType: "image/png",
            },
            {
              type: "text" as const,
              text: "Captcha image retrieved. Read the text in the image and use it with the login tool.",
            },
          ],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Failed to get captcha: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "login",
    "Login to VTOP with username, password, and captcha solution. Call get_captcha first to obtain the captcha.",
    LoginSchema.shape,
    async ({ username, password, captcha }) => {
      try {
        const result = await client.login(username, password, captcha);
        return {
          content: [{ type: "text" as const, text: result.message }],
          isError: !result.success,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Login failed: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "logout",
    "Logout from VTOP and clear the session.",
    EmptySchema.shape,
    async () => {
      await client.logout();
      return {
        content: [{ type: "text" as const, text: "Successfully logged out." }],
      };
    }
  );
}
