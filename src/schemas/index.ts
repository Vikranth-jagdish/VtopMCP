import { z } from "zod";

export const LoginSchema = z.object({
  username: z
    .string()
    .optional()
    .describe(
      "VTOP username / registration number. Optional — if the MCP server has VTOP_USERNAME set as an env var, omit this and the server will use the stored value. Do not ask the user for credentials if they're already configured."
    ),
  password: z
    .string()
    .optional()
    .describe(
      "VTOP password. Optional — if the MCP server has VTOP_PASSWORD set as an env var, omit this and the server will use the stored value. Do not ask the user for credentials if they're already configured."
    ),
  captcha: z
    .string()
    .describe("Captcha solution from the get_captcha tool"),
});

export const SemesterInputSchema = z.object({
  semesterId: z
    .string()
    .optional()
    .describe(
      "Semester ID (e.g. 'AP2024251'). If omitted, uses the current/latest semester."
    ),
});

export const EmptySchema = z.object({});
