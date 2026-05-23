/**
 * Pure GPA / CGPA math — VIT's 10-point system. No network, unit-testable.
 *
 * GPA = Σ(credits × gradePoint) / Σ(credits) over graded courses.
 * Grade points (constants.ts GRADE_POINTS): S=10 A=9 B=8 C=7 D=6 E=5 F=0.
 * F counts (0 points, credits in the denominator); 'N' (result withheld /
 * not graded) is excluded, as are unrecognized grades.
 */
import { GRADE_POINTS, type GradeLetter } from "./constants.js";

export interface GpaCourse {
  credits: number;
  grade: string;
}

const round2 = (x: number): number => Math.round(x * 100) / 100;

/** VIT converts CGPA to percentage by multiplying by 10. */
export function cgpaToPercent(cgpa: number): number {
  return round2(cgpa * 10);
}

/**
 * Absolute mark→grade cutoffs (lower bound, inclusive): S 90, A 80, B 70,
 * C 60, D 55, E 50, else F. NOTE: VIT mostly uses RELATIVE grading (theory
 * classes > 10 students), where cutoffs shift down with the class average — so
 * this absolute scale is a *conservative* estimate; the real grade is usually
 * equal or better. Overridable per call.
 */
export const DEFAULT_GRADE_CUTOFFS: ReadonlyArray<readonly [number, GradeLetter]> = [
  [90, "S"], [80, "A"], [70, "B"], [60, "C"], [55, "D"], [50, "E"],
];

/** Estimate a letter grade from a total mark (out of 100) on the absolute scale. */
export function gradeFromMarks(
  total: number,
  cutoffs: ReadonlyArray<readonly [number, GradeLetter]> = DEFAULT_GRADE_CUTOFFS,
): GradeLetter {
  for (const [min, g] of cutoffs) if (total >= min) return g;
  return "F";
}

/** Grade point for a letter, or null if it isn't a counted grade (incl. 'N'). */
export function gradePointOf(grade: string): number | null {
  const g = grade.trim().toUpperCase();
  if (g === "N") return null; // withheld / not graded — excluded from GPA
  return g in GRADE_POINTS ? GRADE_POINTS[g as GradeLetter] : null;
}

export interface GpaResult {
  gpa: number;
  totalCredits: number;
  weightedPoints: number;
  byGrade: Record<string, { count: number; credits: number }>;
  ignored: { grade: string; credits: number }[];
}

export function computeGpa(courses: GpaCourse[]): GpaResult {
  let weighted = 0;
  let credits = 0;
  const byGrade: GpaResult["byGrade"] = {};
  const ignored: GpaResult["ignored"] = [];

  for (const c of courses) {
    const cr = Number(c.credits) || 0;
    const gp = gradePointOf(c.grade);
    if (gp === null || cr <= 0) {
      ignored.push({ grade: c.grade, credits: cr });
      continue;
    }
    weighted += cr * gp;
    credits += cr;
    const key = c.grade.trim().toUpperCase();
    byGrade[key] = {
      count: (byGrade[key]?.count ?? 0) + 1,
      credits: (byGrade[key]?.credits ?? 0) + cr,
    };
  }

  return {
    gpa: credits > 0 ? round2(weighted / credits) : 0,
    totalCredits: credits,
    weightedPoints: round2(weighted),
    byGrade,
    ignored,
  };
}

/** New CGPA after adding `newCredits` worth of work at `newGpa`. */
export function projectCgpa(
  currentCgpa: number,
  currentCredits: number,
  newGpa: number,
  newCredits: number,
): number {
  const total = currentCredits + newCredits;
  if (total <= 0) return 0;
  return round2((currentCgpa * currentCredits + newGpa * newCredits) / total);
}

export interface RequiredGpa {
  targetCgpa: number;
  plannedCredits: number;
  requiredGpa: number;
  /** False if the required GPA exceeds 10 (impossible) or is negative noise. */
  feasible: boolean;
}

/** GPA needed over `plannedCredits` to reach `targetCgpa` from the current standing. */
export function requiredGpa(
  targetCgpa: number,
  currentCgpa: number,
  currentCredits: number,
  plannedCredits: number,
): RequiredGpa | null {
  if (plannedCredits <= 0) return null;
  const total = currentCredits + plannedCredits;
  const req = (targetCgpa * total - currentCgpa * currentCredits) / plannedCredits;
  return {
    targetCgpa,
    plannedCredits,
    requiredGpa: round2(Math.max(0, req)),
    feasible: req <= 10 + 1e-9,
  };
}
