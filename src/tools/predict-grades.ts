import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VtopClient } from "../services/vtop-client.js";
import { parseMarks, parseTimetable, parseGradeHistory } from "../services/vtop-parser.js";
import { computeGpa, projectCgpa, cgpaToPercent, gradeFromMarks } from "../services/gpa-calc.js";
import { ENDPOINTS } from "../services/constants.js";
import { PredictGradesSchema } from "../schemas/index.js";
import { mkJsonTool } from "./_helpers.js";

const round2 = (x: number): number => Math.round(x * 100) / 100;

export function registerPredictGradesTool(server: McpServer, client: VtopClient) {
  mkJsonTool(
    server,
    "predict_grades",
    "Predict this semester's grades from your current internal marks, then your SGPA and projected CGPA. For each course it sums your scored weightage so far, assumes a score on the not-yet-conducted components (e.g. the FAT) — `assumeRemainingPercent`, or your current performance level if omitted — projects a final total out of 100, and estimates a letter grade. IMPORTANT: this uses the ABSOLUTE scale (S>=90, A>=80, B>=70, C>=60, D>=55, E>=50); VIT mostly uses RELATIVE grading, so your real grade is usually equal or BETTER. If the response contains NOT_AUTHENTICATED, call get_captcha then login then retry. Requires login.",
    PredictGradesSchema.shape,
    async ({ semesterId, assumeRemainingPercent }) => {
      const id = semesterId ?? (await client.getCurrentSemesterId());
      const marks = parseMarks(await client.fetchPage(ENDPOINTS.marks, { semesterSubId: id }));
      if (marks.length === 0) {
        return { semesterId: id, message: "No marks posted yet for this semester.", perCourse: [] };
      }

      const creditOf = new Map(
        parseTimetable(await client.fetchPage(ENDPOINTS.timetable, { semesterSubId: id }))
          .map((c) => [c.courseCode, c.credits ?? 0] as const),
      );
      const history = parseGradeHistory(await client.getGradeHistoryHtml());

      const perCourse = marks.map((m) => {
        const conducted = m.marks.reduce((s, x) => s + (x.maxWeightage || 0), 0);
        const scored = m.marks.reduce((s, x) => s + (x.weightage || 0), 0);
        const remaining = Math.max(0, 100 - conducted);
        const ratio = conducted > 0 ? scored / conducted : 0;
        const remPct = assumeRemainingPercent ?? ratio * 100;
        const projectedTotal = round2(Math.min(100, scored + (remaining * remPct) / 100));
        return {
          courseCode: m.courseCode,
          courseName: m.courseName,
          credits: creditOf.get(m.courseCode) ?? 0,
          scoredWeight: round2(scored),
          conductedWeight: round2(conducted),
          remainingWeight: round2(remaining),
          projectedTotal,
          estimatedGrade: gradeFromMarks(projectedTotal),
        };
      });

      const sgpa = computeGpa(perCourse.map((c) => ({ credits: c.credits, grade: c.estimatedGrade })));
      const projectedCgpa = projectCgpa(history.cgpa, history.totalCredits, sgpa.gpa, sgpa.totalCredits);

      return {
        semesterId: id,
        note:
          "Absolute-scale estimate; VIT mostly uses relative grading, so actual grades are usually equal or better. " +
          "assumeRemainingPercent sets assumed performance on not-yet-conducted components (default: your current performance per course).",
        assumedRemainingPercent: assumeRemainingPercent ?? null,
        perCourse,
        predictedSgpa: sgpa.gpa,
        currentCgpa: history.cgpa,
        projectedCgpa,
        projectedPercentage: cgpaToPercent(projectedCgpa),
      };
    },
  );
}
