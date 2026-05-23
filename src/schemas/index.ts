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

export const GpaCalcSchema = z.object({
  courses: z
    .array(
      z.object({
        credits: z.number().describe("Credit hours for the course."),
        grade: z.string().describe("Letter grade: S, A, B, C, D, E, or F."),
      }),
    )
    .optional()
    .describe(
      "Explicit courses (credits + expected/actual grade) to compute a GPA from and project your CGPA — use for 'what-if' grade scenarios.",
    ),
  semesterId: z
    .string()
    .optional()
    .describe("When `courses` is omitted, compute this semester's GPA from VTOP. Omit for current semester."),
  currentCgpa: z.number().optional().describe("Override the base CGPA for projection (defaults to your real CGPA)."),
  currentCredits: z.number().optional().describe("Override base completed credits for projection (defaults to real)."),
  targetCgpa: z.number().optional().describe("If set, compute the GPA needed over `plannedCredits` to reach this CGPA."),
  plannedCredits: z
    .number()
    .optional()
    .describe("Upcoming-semester credits, used with `targetCgpa` (defaults to the credits in `courses`)."),
});

export const PredictGradesSchema = z.object({
  semesterId: z.string().optional().describe("Semester ID. Omit for current semester."),
  assumeRemainingPercent: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe(
      "Assumed score (%) on not-yet-conducted components (e.g. the FAT). If omitted, each course assumes you keep your current performance level.",
    ),
});

export const OdCalcSchema = z.object({
  semesterId: z
    .string()
    .optional()
    .describe("Semester ID. If omitted, uses the current semester."),
  courseCode: z
    .string()
    .optional()
    .describe("Limit to one course code (e.g. 'BCSE302L'). Omit to total OD across all courses."),
});

export const TodayClassesSchema = z.object({
  date: z
    .string()
    .optional()
    .describe("ISO date YYYY-MM-DD to look up. If omitted, uses today (IST)."),
});
