import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VtopClient } from "../services/vtop-client.js";
import { parseMarks, parseTimetable, parseGradeHistory } from "../services/vtop-parser.js";
import {
  computeGpa,
  projectCgpa,
  cgpaToPercent,
  gradeFromMarks,
  relativeGrade,
  DEFAULT_SIGMA,
} from "../services/gpa-calc.js";
import { ENDPOINTS } from "../services/constants.js";
import { PredictGradesSchema } from "../schemas/index.js";
import { mkJsonTool } from "./_helpers.js";

const round2 = (x: number): number => Math.round(x * 100) / 100;

/** Theory / lab-embedded-theory courses are graded relatively; everything else (lab, soft-skill, project) absolutely. */
const isRelative = (courseType: string): boolean => /theory/i.test(courseType);

export function registerPredictGradesTool(server: McpServer, client: VtopClient) {
  mkJsonTool(
    server,
    "predict_grades",
    "Predict this semester's grades from your current internal marks, then SGPA and projected CGPA — using VIT's ACTUAL method: absolute grading for lab / soft-skill / project courses, and RELATIVE grading for theory courses. VTOP hides the class average, so for each THEORY course you must supply your estimate via `classAverages` (the class's average final total out of 100). If you don't, the tool returns each theory course's projected total and asks for the averages — at which point ASK THE USER for their estimate of the class average (overall, or expected FAT average) for those subjects, then call again with `classAverages`. `assumeRemainingPercent` sets assumed performance on not-yet-conducted components (e.g. the FAT). If the response contains NOT_AUTHENTICATED, call get_captcha then login then retry. Requires login.",
    PredictGradesSchema.shape,
    async ({ semesterId, assumeRemainingPercent, classAverages, sigma }) => {
      const id = semesterId ?? (await client.getCurrentSemesterId());
      const marks = parseMarks(await client.fetchPage(ENDPOINTS.marks, { semesterSubId: id }));
      if (marks.length === 0) {
        return { semesterId: id, message: "No marks posted yet for this semester.", perCourse: [] };
      }
      const creditOf = new Map(
        parseTimetable(await client.fetchPage(ENDPOINTS.timetable, { semesterSubId: id }))
          .map((c) => [c.courseCode, c.credits ?? 0] as const),
      );
      const avgOf = new Map((classAverages ?? []).map((a) => [a.courseCode.toUpperCase(), a]));
      const defaultSigma = sigma ?? DEFAULT_SIGMA;

      const perCourse = marks.map((m) => {
        const conducted = m.marks.reduce((s, x) => s + (x.maxWeightage || 0), 0);
        const scored = m.marks.reduce((s, x) => s + (x.weightage || 0), 0);
        const remaining = Math.max(0, 100 - conducted);
        const ratio = conducted > 0 ? scored / conducted : 0;
        const remPct = assumeRemainingPercent ?? ratio * 100;
        const projectedTotal = round2(Math.min(100, scored + (remaining * remPct) / 100));

        const relative = isRelative(m.courseType);
        const base = {
          courseCode: m.courseCode,
          courseName: m.courseName,
          courseType: m.courseType,
          credits: creditOf.get(m.courseCode) ?? 0,
          projectedTotal,
          grading: relative ? ("relative" as const) : ("absolute" as const),
        };

        if (!relative) {
          return { ...base, estimatedGrade: gradeFromMarks(projectedTotal), needsClassAverage: false };
        }
        const a = avgOf.get(m.courseCode.toUpperCase());
        if (!a) {
          return { ...base, estimatedGrade: null, needsClassAverage: true };
        }
        return {
          ...base,
          classAverage: a.average,
          sigma: a.sigma ?? defaultSigma,
          estimatedGrade: relativeGrade(projectedTotal, a.average, a.sigma ?? defaultSigma),
          needsClassAverage: false,
        };
      });

      const missing = perCourse.filter((c) => c.needsClassAverage).map((c) => c.courseCode);
      const graded = perCourse.filter((c) => c.estimatedGrade !== null);
      const sgpa = computeGpa(graded.map((c) => ({ credits: c.credits, grade: c.estimatedGrade as string })));

      const history = parseGradeHistory(await client.getGradeHistoryHtml());
      const projectedCgpa = projectCgpa(history.cgpa, history.totalCredits, sgpa.gpa, sgpa.totalCredits);

      return {
        semesterId: id,
        method:
          "Absolute grading for lab/soft-skill/project; relative grading for theory (S>=μ+1.5σ, A>=μ+0.5σ, B>=μ±0.5σ, C>=μ-1.5σ, D>=μ-2.5σ). VTOP hides the class average, so theory courses need your estimate.",
        needsClassAverageFor: missing,
        message: missing.length
          ? `Provide the estimated class average (final total /100) for these theory courses to complete the prediction: ${missing.join(", ")}.`
          : undefined,
        perCourse,
        predictedSgpa: sgpa.gpa,
        predictedSgpaCoversCredits: sgpa.totalCredits,
        currentCgpa: history.cgpa,
        projectedCgpa,
        projectedPercentage: cgpaToPercent(projectedCgpa),
      };
    },
  );
}
