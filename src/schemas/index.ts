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

export const CalcAttendanceSchema = z.object({
  semesterId: z
    .string()
    .optional()
    .describe("Semester ID (e.g. 'CH20252605'). If omitted, uses the current semester."),
  courseCode: z
    .string()
    .optional()
    .describe("Limit to one course code (e.g. 'BCSE302L'), matched case-insensitively. Omit for all courses."),
  targetPercent: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe("Attendance % to target. Default 74 — VIT requires 75% but 74.x rounds up to 75."),
  untilDate: z
    .string()
    .optional()
    .describe(
      "Attendance-closing date as ISO YYYY-MM-DD (e.g. a CAT-2 cutoff). When set, the tool projects every class from today to this date using the timetable grid + academic calendar (working days, holidays, working Saturdays / day-orders). Ask the user for this date if they want a deadline-aware answer.",
    ),
  includeUntilDate: z
    .boolean()
    .optional()
    .describe("Whether classes ON the closing date are counted. Default true."),
});

export const TodayClassesSchema = z.object({
  date: z
    .string()
    .optional()
    .describe("ISO date YYYY-MM-DD to look up. If omitted, uses today (IST)."),
});
