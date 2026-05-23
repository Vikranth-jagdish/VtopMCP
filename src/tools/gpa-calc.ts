import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VtopClient } from "../services/vtop-client.js";
import { parseGradeHistory, parseSemesterGrades } from "../services/vtop-parser.js";
import { computeGpa, projectCgpa, requiredGpa, cgpaToPercent, type GpaResult } from "../services/gpa-calc.js";
import { ENDPOINTS } from "../services/constants.js";
import { GpaCalcSchema } from "../schemas/index.js";
import { mkJsonTool } from "./_helpers.js";

export function registerGpaCalcTool(server: McpServer, client: VtopClient) {
  mkJsonTool(
    server,
    "calculate_gpa",
    "GPA / CGPA / percentage calculator on VIT's 10-point scale (S=10 A=9 B=8 C=7 D=6 E=5 F=0; percentage = CGPA×10). It works from the LETTER GRADES VTOP already awarded — whether those were decided by relative or absolute grading doesn't matter, the grade→point scale is the same for every course. With no arguments it reports your current CGPA, percentage, total credits, and each completed semester's GPA. Pass `courses` (credits + grade for each) to compute that set's GPA and your projected CGPA — for 'what-if' scenarios where you supply expected grades (the most reliable way to forecast). Pass `targetCgpa` (+ `plannedCredits`) for the GPA needed to reach that CGPA. Pass `semesterId` (no `courses`) to compute one stored semester's GPA. (To estimate grades from current MARKS, use predict_grades instead.) If the response contains NOT_AUTHENTICATED, call get_captcha then login then retry. Requires login.",
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
        current: { cgpa: number; percentage: number; totalCredits: number; perSemester: typeof perSemester };
        semesterId?: string;
        computed?: GpaResult;
        projectedCgpa?: number;
        projectedPercentage?: number;
        requiredGpa?: ReturnType<typeof requiredGpa>;
      } = {
        current: {
          cgpa: history.cgpa,
          percentage: cgpaToPercent(history.cgpa),
          totalCredits: history.totalCredits,
          perSemester,
        },
      };

      let computed: GpaResult | undefined;
      if (courses && courses.length > 0) {
        computed = computeGpa(courses);
        out.computed = computed;
        out.projectedCgpa = projectCgpa(baseCgpa, baseCredits, computed.gpa, computed.totalCredits);
        out.projectedPercentage = cgpaToPercent(out.projectedCgpa);
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
