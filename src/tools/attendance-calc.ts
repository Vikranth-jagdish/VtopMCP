import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VtopClient } from "../services/vtop-client.js";
import { parseAttendance, parseTimetableGrid, weeklyScheduleFromGrid } from "../services/vtop-parser.js";
import {
  SAFE_THRESHOLD_PERCENT,
  projectAll,
  projectDeadline,
  listUpcomingClassDays,
  countUpcoming,
} from "../services/attendance-calc.js";
import { ENDPOINTS } from "../services/constants.js";
import { CalcAttendanceSchema } from "../schemas/index.js";
import { mkJsonTool } from "./_helpers.js";

/** Today's date in IST (VIT is UTC+5:30), as ISO YYYY-MM-DD. */
function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

export function registerAttendanceCalcTool(server: McpServer, client: VtopClient) {
  mkJsonTool(
    server,
    "calculate_attendance",
    "Attendance / bunk calculator. Per course: current %, whether you're safe, how many more classes you can skip ('bunkBuffer'), and how many to attend to recover ('classesToRecover'). Safe threshold defaults to 74% (VIT needs 75%, but 74.x rounds up); override with targetPercent. Provide untilDate (an attendance-closing / CAT cutoff date, ISO YYYY-MM-DD) to project real classes from today to that date using the timetable + academic calendar (holidays, working Saturdays) — returns, per course, upcomingSessions, the % if you attend/skip all, how many of the upcoming you can miss (maxSkippableInRange), how many you must attend (mustAttendInRange), and whether you can be safe by the deadline; plus a perDay breakdown. Ask the user for the closing date (and whether that day counts) when they want a deadline answer. If the response contains NOT_AUTHENTICATED, call get_captcha then login then retry. login auto-uses VTOP_USERNAME/VTOP_PASSWORD env vars if set; if it reports credentials missing, ask the user for them. Requires login.",
    CalcAttendanceSchema.shape,
    async ({ semesterId, courseCode, targetPercent, untilDate, includeUntilDate }) => {
      const id = semesterId ?? (await client.getCurrentSemesterId());
      const attHtml = await client.fetchPage(ENDPOINTS.attendance, { semesterSubId: id });
      let records = parseAttendance(attHtml);

      const wanted = courseCode?.trim().toLowerCase();
      if (wanted) {
        records = records.filter((r) => r.courseCode.toLowerCase() === wanted);
        if (records.length === 0) {
          throw new Error(`No attendance record for course "${courseCode}" in this semester.`);
        }
      }

      const threshold = targetPercent ?? SAFE_THRESHOLD_PERCENT;
      const courses = projectAll(records, threshold);

      if (!untilDate) {
        return {
          thresholdPercent: threshold,
          overallSafe: courses.every((c) => c.isSafe),
          courses,
        };
      }

      // Date-aware projection: count real upcoming sessions per course.
      const from = istToday();
      const gridHtml = await client.fetchPage(ENDPOINTS.timetable, { semesterSubId: id });
      const schedule = weeklyScheduleFromGrid(parseTimetableGrid(gridHtml));
      const calendar = await client.getCalendar(id, from, untilDate);
      const days = listUpcomingClassDays(schedule, calendar, from, untilDate, includeUntilDate ?? true);
      const counts = countUpcoming(days);

      for (const c of courses) {
        c.deadline = projectDeadline(c.attended, c.total, counts[c.courseCode] ?? 0, untilDate, threshold);
      }

      const perDay = days
        .map((d) => ({
          date: d.date,
          dayOrder: d.dayOrderWeekday,
          courses: wanted ? d.courses.filter((cc) => cc.toLowerCase() === wanted) : d.courses,
        }))
        .filter((d) => d.courses.length > 0);

      return {
        thresholdPercent: threshold,
        untilDate,
        from,
        overallSafe: courses.every((c) => c.isSafe),
        courses,
        perDay,
      };
    },
    { emptyMessage: "No attendance records found. The semester may not have started yet." },
  );
}
