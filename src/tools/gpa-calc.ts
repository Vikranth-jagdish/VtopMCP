import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VtopClient } from "../services/vtop-client.js";
import { parseGradeHistory, parseSemesterGrades } from "../services/vtop-parser.js";
import { computeGpa, projectCgpa, requiredGpa, type GpaResult } from "../services/gpa-calc.js";
import { ENDPOINTS } from "../services/constants.js";
import { GpaCalcSchema } from "../schemas/index.js";
import { mkJsonTool } from "./_helpers.js";

export function registerGpaCalcTool(server: McpServer, client: VtopClient) {
  mkJsonTool(
    server,
    "calculate_gpa",
    "GPA / CGPA calculator (VIT 10-point: S=10 A=9 B=8 C=7 D=6 E=5 F=0). With no arguments it reports your current CGPA, total credits, and the GPA of each completed semester (computed from grades). Pass `courses` (credits + grade for each) to compute that set's GPA and your projected CGPA — great for 'what-if' grade scenarios. Pass `targetCgpa` (+ `plannedCredits`) to get the GPA you'd need to reach that CGPA. Pass `semesterId` (no `courses`) to compute one stored semester's GPA. If the response contains NOT_AUTHENTICATED, call get_captcha then login then retry. Requires login.",
    GpaCalcSchema.shape,
    async ({ courses, semesterId, currentCgpa, currentCredits, targetCgpa, plannedCredits }) => {
      const history = parseGradeHistory(await client.getGradeHistoryHtml());
      const baseCgpa = currentCgpa ?? history.cgpa;
      const baseCredits = currentCredits ?? history.totalCredits;

      const perSemester = history.semesters.map((s) => {
        const g = computeGpa(s.grades.map((c) => ({ credits: c.credits, grade: c.grade })));
        return { semester: s.semester, gpa: g.gpa, credits: g.totalCredits };
      });

      const out: {
        current: { cgpa: number; totalCredits: number; perSemester: typeof perSemester };
        semesterId?: string;
        computed?: GpaResult;
        projectedCgpa?: number;
        requiredGpa?: ReturnType<typeof requiredGpa>;
      } = {
        current: { cgpa: history.cgpa, totalCredits: history.totalCredits, perSemester },
      };

      let computed: GpaResult | undefined;
      if (courses && courses.length > 0) {
        computed = computeGpa(courses);
        out.computed = computed;
        out.projectedCgpa = projectCgpa(baseCgpa, baseCredits, computed.gpa, computed.totalCredits);
      } else if (semesterId) {
        const { grades } = parseSemesterGrades(
          await client.fetchPage(ENDPOINTS.semesterGrades, { semesterSubId: semesterId }),
        );
        computed = computeGpa(grades.map((c) => ({ credits: c.credits, grade: c.grade })));
        out.semesterId = semesterId;
        out.computed = computed;
      }

      if (targetCgpa !== undefined) {
        const planned = plannedCredits ?? computed?.totalCredits ?? 0;
        out.requiredGpa = requiredGpa(targetCgpa, baseCgpa, baseCredits, planned);
      }

      return out;
    },
  );
}
