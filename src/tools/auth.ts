import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VtopClient } from "../services/vtop-client.js";
import type { Credentials } from "../types/index.js";
import { LoginSchema, EmptySchema } from "../schemas/index.js";
import { mkJsonTool } from "./_helpers.js";

export function registerAuthTools(
  server: McpServer,
  client: VtopClient,
  credentials?: Credentials,
) {
  // get_captcha returns an image content item, not JSON — use server.tool directly.
  server.tool(
    "get_captcha",
    "Step 1 of login: fetch a CAPTCHA image from VTOP. Returns the image so you (the model) can OCR it. After this, immediately call `login` with the captcha text you read — do NOT ask the user to read it for you. The user only needs to be asked for credentials if VTOP_USERNAME / VTOP_PASSWORD are not set as env vars on the server.",
    EmptySchema.shape,
    async () => {
      try {
        const dataUrl = await client.getCaptcha();
        const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
        if (match) {
          return {
            content: [
              { type: "image" as const, data: match[2], mimeType: match[1] },
              {
                type: "text" as const,
                text:
                  "Captcha image retrieved. Read the text in the image and use it with the login tool. If you cannot read it, call get_captcha again for a new one.",
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `Captcha data URL: ${dataUrl.slice(0, 100)}...`,
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
    "Step 2 of login: submit credentials + the captcha you just OCR'd. Username/password are optional — if VTOP_USERNAME and VTOP_PASSWORD are set as env vars on the MCP server, omit them and the server uses the stored values. Only ask the user for credentials if the server reports they're not configured.",
    LoginSchema.shape,
    async ({ username, password, captcha }) => {
      const user = username ?? credentials?.username ?? process.env.VTOP_USERNAME;
      const pass = password ?? credentials?.password ?? process.env.VTOP_PASSWORD;
      if (!user || !pass) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                "CREDENTIALS_REQUIRED: No credentials available. Ask the user directly, in ONE short line: \"What's your VTOP username and password?\" Do NOT present numbered options, do NOT explain how to set env vars, do NOT mention campus or base URL. As soon as they reply, call login again with their username, password, and the SAME captcha (it was not submitted — still valid, do not call get_captcha again).",
            },
          ],
          isError: true,
        };
      }
      try {
        const result = await client.login(user, pass, captcha);
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

  mkJsonTool(
    server,
    "get_semesters",
    "Get list of available semesters (id + name). Most data tools accept the semesterId, but they also default to the current semester if omitted — so you usually don't need to call this unless the user asks about a specific past semester. If the response contains NOT_AUTHENTICATED, immediately call get_captcha then login then retry this tool. login auto-uses VTOP_USERNAME/VTOP_PASSWORD env vars if set; if login replies that credentials are missing, ask the user for their VTOP username and password and call login again with them. Requires login.",
    EmptySchema.shape,
    async () => client.getSemesters(),
    { emptyMessage: "No semesters found. You may not be enrolled yet." }
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
