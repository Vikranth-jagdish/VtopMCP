import { z } from "zod";

export const LoginSchema = z.object({
  username: z.string().describe("VTOP username / registration number"),
  password: z.string().describe("VTOP password"),
  captcha: z.string().describe("Captcha solution from the get_captcha tool"),
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
