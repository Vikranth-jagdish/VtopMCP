import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VtopClient } from "../services/vtop-client.js";
import { parseAttendanceDetailRefs, parseAttendanceDetail } from "../services/vtop-parser.js";
import { ENDPOINTS, OD_LIMIT_HOURS } from "../services/constants.js";
import { OdCalcSchema } from "../schemas/index.js";
import { mkJsonTool } from "./_helpers.js";

export function registerOdCalcTool(server: McpServer, client: VtopClient) {
  mkJsonTool(
    server,
    "calculate_od",
    `Total your On-Duty (OD) hours for the semester from the per-class attendance detail, and check them against VIT's ${OD_LIMIT_HOURS}-hour limit. Returns per-course OD hours/entries plus the semester total, hours remaining, and whether you're over. (One class period = ~1 hour; a 2-period lab counts as 2.) This reads each course's attendance detail, so it makes several requests. If the response contains NOT_AUTHENTICATED, call get_captcha then login then retry. Requires login.`,
    OdCalcSchema.shape,
    async ({ semesterId, courseCode }) => {
      const id = semesterId ?? (await client.getCurrentSemesterId());
      // Fetching the main attendance page also establishes the page context the
      // detail action needs.
      const mainHtml = await client.fetchPage(ENDPOINTS.attendance, { semesterSubId: id });
      let refs = parseAttendanceDetailRefs(mainHtml);
      const wanted = courseCode?.trim().toLowerCase();
      if (wanted) {
        refs = refs.filter((r) => r.courseCode.toLowerCase() === wanted);
        if (refs.length === 0) throw new Error(`No course "${courseCode}" found in this semester's attendance.`);
      }

      const perCourse: {
        courseCode: string;
        courseName: string;
        odHours: number;
        odEntries: number;
        present: number;
        absent: number;
        total: number;
      }[] = [];

      for (const ref of refs) {
        const html = await client.fetchPage(ENDPOINTS.attendanceDetail, {
          semesterSubId: id,
          classId: ref.classId,
          slotName: ref.slot,
          x: new Date().toUTCString(),
        });
        const d = parseAttendanceDetail(html);
        perCourse.push({
          courseCode: ref.courseCode,
          courseName: ref.courseName,
          odHours: d.odHours,
          odEntries: d.onDuty,
          present: d.present,
          absent: d.absent,
          total: d.total,
        });
      }

      const totalOdHours = perCourse.reduce((s, c) => s + c.odHours, 0);
      return {
        semesterId: id,
        odLimitHours: OD_LIMIT_HOURS,
        totalOdHours,
        remainingHours: Math.max(0, OD_LIMIT_HOURS - totalOdHours),
        overLimit: totalOdHours > OD_LIMIT_HOURS,
        perCourse,
      };
    },
  );
}
