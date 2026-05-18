/**
 * Shared constants used across the VTOP client, parsers, and tools.
 * Centralized so endpoint URLs, error wording, and grade-letter sets
 * have exactly one source of truth.
 */

/** VTOP backend endpoint paths (relative to the /vtop base URL). */
export const ENDPOINTS = {
  attendance: "processViewStudentAttendance",
  timetable: "processViewTimeTable",
  marks: "examinations/doStudentMarkView",
  examSchedule: "examinations/doSearchExamScheduleForStudent",
  gradeHistory: "examinations/examGradeView/StudentGradeHistory",
  semesterGrades: "examinations/examGradeView/doStudentGradeView",
  profile: "studentsRecord/StudentProfileAllView",
  timetableForSemesters: "academics/common/StudentTimeTableChn",
} as const;

/**
 * Error string returned (or thrown) when an authenticated tool is hit
 * without an active session. The wording is deliberately directive — the
 * chat model uses this to decide to chain get_captcha → login → retry.
 */
const RECOVERY_STEPS =
  " To answer the user's request you MUST first: (1) call get_captcha, (2) read the captcha text from the returned image, (3) call login with the captcha and WITHOUT username/password first (the server may have them as env vars). If login replies that no credentials are configured, ask the user for their VTOP username and password, then call login again with the captcha plus those credentials (you can reuse the same captcha — it was not submitted). Then retry this tool.";

export const NOT_AUTH_MSG =
  "NOT_AUTHENTICATED: No active VTOP session." + RECOVERY_STEPS;

export const SESSION_EXPIRED_MSG =
  "NOT_AUTHENTICATED: VTOP session expired." + RECOVERY_STEPS;

/** VIT course codes look like BCSE302L, BMGT105L, BFRE101L, etc. */
export const COURSE_CODE_PATTERN = /\b[A-Z]{3,5}\d{3,4}[A-Z]?\b/;

/** Grade letters VIT issues, in CGPA-descending order. */
export const GRADE_LETTERS = ["S", "A", "B", "C", "D", "E", "F", "N"] as const;
export type GradeLetter = (typeof GRADE_LETTERS)[number];

/** Numeric grade points per letter. F and N do not count toward GPA. */
export const GRADE_POINTS: Record<GradeLetter, number> = {
  S: 10,
  A: 9,
  B: 8,
  C: 7,
  D: 6,
  E: 5,
  F: 0,
  N: 0,
};
