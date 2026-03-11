import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VtopClient } from "../services/vtop-client.js";
import { LoginSchema, EmptySchema } from "../schemas/index.js";

export function registerAuthTools(server: McpServer, client: VtopClient) {
  server.tool(
    "get_captcha",
    "Get a CAPTCHA image for VTOP login. Returns a base64-encoded image that you can read visually. Call this before login.",
    EmptySchema.shape,
    async () => {
      try {
        const captchaDataUrl = await client.getCaptcha();
        const match = captchaDataUrl.match(
          /^data:(image\/[^;]+);base64,(.+)$/
        );
        if (match) {
          return {
            content: [
              {
                type: "image" as const,
                data: match[2],
                mimeType: match[1],
              },
              {
                type: "text" as const,
                text: "Captcha image retrieved. Read the text in the image and use it with the login tool. If you cannot read it, call get_captcha again for a new one.",
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `Captcha data URL: ${captchaDataUrl.slice(0, 100)}...`,
            },
          ],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            { type: "text" as const, text: `Failed to get captcha: ${msg}` },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "login",
    "Login to VTOP with username, password, and captcha solution. Call get_captcha first.",
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
          content: [
            { type: "text" as const, text: `Login failed: ${msg}` },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get_semesters",
    "Get list of available semesters with their IDs. Call after login to find the semesterId for other tools.",
    EmptySchema.shape,
    async () => {
      try {
        const semesters = await client.getSemesters();
        if (semesters.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No semesters found. You may not be enrolled yet.",
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(semesters, null, 2),
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
    "logout",
    "Logout from VTOP and clear the session.",
    EmptySchema.shape,
    async () => {
      await client.logout();
      return {
        content: [
          { type: "text" as const, text: "Successfully logged out." },
        ],
      };
    }
  );
}
