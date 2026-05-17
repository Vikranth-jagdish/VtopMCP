import * as cheerio from "cheerio";
import type {
  AttendanceRecord,
  TimetableSlot,
  MarksRecord,
  ExamSchedule,
  GradeRecord,
  GradeHistory,
  StudentProfile,
  Semester,
  CurriculumProgress,
  CurriculumProgressRow,
  GradeDistribution,
} from "../types/index.js";
import { GRADE_LETTERS, GRADE_POINTS } from "./constants.js";

/**
 * Compute creditsRemaining (clamped ≥ 0) and percentComplete (rounded to
 * 1 decimal) for a curriculum row. Shared by every place we build a
 * CurriculumProgressRow or the top-level totals.
 */
function progressMetrics(
  required: number,
  earned: number
): { creditsRemaining: number; percentComplete: number } {
  return {
    creditsRemaining: Math.max(0, required - earned),
    percentComplete:
      required > 0
        ? Math.round((earned / required) * 1000) / 10
        : earned > 0
          ? 100
          : 0,
  };
}

/**
 * Locate and parse the post-login CGPA summary table whose header row is
 * `Credits Registered | Credits Earned | CGPA | S Grades | A Grades | ...`.
 * Used by both grade-history and curriculum-progress parsers.
 */
function parseCgpaSummary(
  $: cheerio.CheerioAPI
): {
  creditsRegistered: number;
  creditsEarned: number;
  cgpa: number;
  gradeDistribution: GradeDistribution;
} | null {
  const empty: GradeDistribution = {
    S: 0,
    A: 0,
    B: 0,
    C: 0,
    D: 0,
    E: 0,
    F: 0,
    N: 0,
  };
  const tables = $("table");
  for (let i = tables.length - 1; i >= 0; i--) {
    const $table = $(tables[i]);
    const headerRow = $table.find("tr").first();
    const headerCells = headerRow.find("td");
    const headerText = headerRow.text().toLowerCase();
    if (!headerText.includes("credits") || !headerText.includes("cgpa")) {
      continue;
    }
    const headers: string[] = headerCells
      .map((_j, el) => $(el).text().trim().toLowerCase())
      .get();
    const valueCells = $table.find("td").slice(headerCells.length);
    const get = (predicate: (h: string) => boolean): number => {
      const idx = headers.findIndex(predicate);
      if (idx < 0 || idx >= valueCells.length) return 0;
      return parseFloat($(valueCells[idx]).text().trim()) || 0;
    };
    const gradeDistribution: GradeDistribution = { ...empty };
    for (const L of GRADE_LETTERS) {
      gradeDistribution[L] = get((h) => h.startsWith(L.toLowerCase() + " grade"));
    }
    return {
      creditsRegistered: get((h) => h.includes("credits registered")),
      creditsEarned: get((h) => h.includes("credits earned") || h.includes("earned")),
      cgpa: get((h) => h === "cgpa"),
      gradeDistribution,
    };
  }
  return null;
}

/**
 * Parse semester dropdown from the timetable page.
 * Android app: doc.getElementById('semesterSubId').getElementsByTagName('option')
 */
export function parseSemesters(html: string): Semester[] {
  const $ = cheerio.load(html);
  const semesters: Semester[] = [];

  $("#semesterSubId option, select option").each((_i, el) => {
    const id = $(el).attr("value")?.trim();
    const name = $(el).text().trim();
    if (id && name) {
      semesters.push({ id, name });
    }
  });

  return semesters;
}

/**
 * Parse attendance from VTOP HTML.
 *
 * Android app: table = doc.getElementById('getStudentDetails')
 * Columns by heading: 'course type', 'slot', 'attended', 'total', 'percentage'
 */
export function parseAttendance(html: string): AttendanceRecord[] {
  const $ = cheerio.load(html);
  const records: AttendanceRecord[] = [];

  const table = $("#getStudentDetails").first();
  if (!table.length) return records;

  const headings: string[] = [];
  table.find("th").each((_i, el) => {
    headings.push($(el).text().trim().toLowerCase());
  });

  const courseCodeIdx = headings.findIndex((h) => h.includes("code"));
  const courseNameIdx = headings.findIndex(
    (h) =>
      h.includes("title") ||
      (h.includes("course") && !h.includes("type") && !h.includes("code"))
  );
  const courseTypeIdx = headings.findIndex(
    (h) => h.includes("course") && h.includes("type")
  );
  const slotIdx = headings.findIndex((h) => h.includes("slot"));
  const attendedIdx = headings.findIndex((h) => h.includes("attended"));
  const totalIdx = headings.findIndex((h) => h.includes("total"));
  const percentageIdx = headings.findIndex((h) => h.includes("percentage"));

  const cells = table.find("td");
  const colCount = headings.length;

  for (let i = 0; i + colCount <= cells.length; i += colCount) {
    const cell = (idx: number) =>
      idx >= 0 ? $(cells[i + idx]).text().trim() : "";

    const slot = slotIdx >= 0 ? cell(slotIdx).split("+")[0].trim() : "";
    if (!slot && courseCodeIdx < 0) continue;

    records.push({
      courseCode: cell(courseCodeIdx),
      courseName: cell(courseNameIdx),
      courseType: cell(courseTypeIdx),
      slot,
      attended: parseInt(cell(attendedIdx), 10) || 0,
      total: parseInt(cell(totalIdx), 10) || 0,
      percentage: parseFloat(cell(percentageIdx)) || 0,
    });
  }

  return records;
}

/**
 * Parse courses from processViewTimeTable response.
 *
 * Android app: doc.getElementById('studentDetailsList').getElementsByTagName('table')[0]
 * Columns: 'course' (code-title(type)), 'l t p j c' (credits), 'slot' (slot-venue), 'faculty'
 */
export function parseCourses(
  html: string
): {
  code: string;
  title: string;
  type: string;
  credits: number;
  slots: string[];
  venue: string;
  faculty: string;
}[] {
  const $ = cheerio.load(html);
  const courses: {
    code: string;
    title: string;
    type: string;
    credits: number;
    slots: string[];
    venue: string;
    faculty: string;
  }[] = [];

  const container = $("#studentDetailsList");
  if (!container.length) return courses;

  const table = container.find("table").first();
  if (!table.length) return courses;

  const headings: string[] = [];
  table.find("th").each((_i, el) => {
    headings.push($(el).text().trim().toLowerCase());
  });

  const courseIdx = headings.findIndex((h) => h === "course");
  const creditsIdx = headings.findIndex(
    (h) => h.includes("l t p j c") || h === "c"
  );
  const slotVenueIdx = headings.findIndex((h) => h.includes("slot"));
  const facultyIdx = headings.findIndex((h) => h.includes("faculty"));

  const cells = table.find("td");
  const colCount = headings.length;

  for (let i = 0; i + colCount <= cells.length; i += colCount) {
    const cellText = (idx: number) =>
      idx >= 0
        ? $(cells[i + idx])
            .text()
            .trim()
            .replace(/\t/g, "")
            .replace(/\n/g, " ")
        : "";

    const rawCourse = cellText(courseIdx);
    if (!rawCourse) continue;

    const rawCourseType = rawCourse.split("(").slice(-1)[0].toLowerCase();
    const rawCredits = cellText(creditsIdx).trim().split(/\s+/);
    const rawSlotVenue = cellText(slotVenueIdx).split("-");
    const rawFaculty = cellText(facultyIdx).split("-");

    courses.push({
      code: rawCourse.split("-")[0].trim(),
      title: rawCourse.split("-").slice(1).join("-").split("(")[0].trim(),
      type: rawCourseType.includes("lab")
        ? "lab"
        : rawCourseType.includes("project")
          ? "project"
          : "theory",
      credits: parseInt(rawCredits[rawCredits.length - 1], 10) || 0,
      slots: rawSlotVenue[0].trim().split("+"),
      venue: rawSlotVenue.slice(1).join(" - ").trim(),
      faculty: rawFaculty[0].trim(),
    });
  }

  return courses;
}

/**
 * Parse timetable from processViewTimeTable response.
 * Returns courses with their slot/venue/faculty info as structured data.
 */
export function parseTimetable(html: string): TimetableSlot[] {
  const courses = parseCourses(html);
  return courses.map((c) => ({
    day: "",
    startTime: "",
    endTime: "",
    courseCode: c.code,
    courseName: c.title,
    courseType: c.type,
    venue: c.venue,
    faculty: c.faculty,
    slots: c.slots.join("+"),
    credits: c.credits,
  }));
}

/**
 * Parse marks from examinations/doStudentMarkView response.
 *
 * Android app: table = doc.getElementById('fixedTableContainer')
 * Outer rows: course type + slot. Next row: inner table with mark components.
 */
export function parseMarks(html: string): MarksRecord[] {
  const $ = cheerio.load(html);
  const records: MarksRecord[] = [];

  if (html.toLowerCase().includes("no data found")) return records;

  const table = $("#fixedTableContainer").first();
  if (!table.length) return records;

  const rows = table.find("> tbody > tr, > tr");

  // Find heading indices from first row
  const headings: string[] = [];
  rows.first().find("td, th").each((_i, el) => {
    headings.push($(el).text().trim().toLowerCase());
  });

  const courseTypeIdx = headings.findIndex(
    (h) => h.includes("course") && h.includes("type")
  );
  const slotIdx = headings.findIndex((h) => h.includes("slot"));

  for (let i = 1; i < rows.length; i++) {
    const row = $(rows[i]);
    const outerCells = row.find("> td");

    if (outerCells.length < 2) continue;

    const courseType =
      courseTypeIdx >= 0
        ? $(outerCells[courseTypeIdx]).text().trim()
        : "";
    const slot =
      slotIdx >= 0
        ? $(outerCells[slotIdx]).text().trim().split("+")[0].trim()
        : "";

    // Next row contains inner marks table
    i++;
    if (i >= rows.length) break;

    const innerRow = $(rows[i]);
    const innerTable = innerRow.find("table").first();
    if (!innerTable.length) continue;

    const innerRows = innerTable.find("tr");
    if (innerRows.length < 2) continue;

    const innerHeadings: string[] = [];
    $(innerRows[0])
      .find("td, th")
      .each((_j, el) => {
        innerHeadings.push($(el).text().trim().toLowerCase());
      });

    const titleIdx = innerHeadings.findIndex((h) => h.includes("title"));
    const maxIdx = innerHeadings.findIndex(
      (h) => h.includes("max") && !h.includes("weightage")
    );
    const scoredIdx = innerHeadings.findIndex((h) => h.includes("scored"));
    const weightageIdx = innerHeadings.findIndex(
      (h) => h.includes("weightage") && h.includes("mark")
    );
    const maxWeightageIdx = innerHeadings.findIndex((h) => h.includes("%"));
    const averageIdx = innerHeadings.findIndex((h) =>
      h.includes("average")
    );
    const statusIdx = innerHeadings.findIndex((h) => h.includes("status"));

    const record: MarksRecord = {
      courseCode: "",
      courseName: "",
      courseType,
      slot,
      marks: [],
    };

    for (let j = 1; j < innerRows.length; j++) {
      const innerCells = $(innerRows[j]).find("td");
      const cell = (idx: number) =>
        idx >= 0 && idx < innerCells.length
          ? $(innerCells[idx]).text().trim()
          : "";

      const title = cell(titleIdx);
      if (!title) continue;

      record.marks.push({
        component: title,
        maxMarks: parseFloat(cell(maxIdx)) || 0,
        scored: parseFloat(cell(scoredIdx)) || 0,
        maxWeightage: parseFloat(cell(maxWeightageIdx)) || 0,
        weightage: parseFloat(cell(weightageIdx)) || 0,
        average: parseFloat(cell(averageIdx)) || null,
        status: cell(statusIdx),
      });
    }

    // Skip inner table rows in outer loop
    i += innerRows.length;

    if (record.marks.length > 0) {
      records.push(record);
    }
  }

  return records;
}

/**
 * Parse exam schedule from examinations/doSearchExamScheduleForStudent.
 *
 * Android app: Columns by heading: slot, date, exam time, venue, location, seat no.
 * Exam type headers span multiple columns (colSpan > 1).
 */
export function parseExamSchedule(html: string): ExamSchedule[] {
  const $ = cheerio.load(html);
  const schedules: ExamSchedule[] = [];

  if (html.toLowerCase().includes("not found")) return schedules;

  const rows = $("tr");
  if (rows.length < 2) return schedules;

  const headings: string[] = [];
  $(rows[0])
    .find("td, th")
    .each((_i, el) => {
      headings.push($(el).text().trim().toLowerCase());
    });

  const slotIdx = headings.findIndex((h) => h.includes("slot"));
  const dateIdx = headings.findIndex((h) => h.includes("date"));
  const timeIdx = headings.findIndex(
    (h) => h.includes("exam") && h.includes("time")
  );
  const venueIdx = headings.findIndex((h) => h.includes("venue"));
  const locationIdx = headings.findIndex((h) => h.includes("location"));
  const seatIdx = headings.findIndex(
    (h) => h.includes("seat") && h.includes("no")
  );

  let examTitle = "";
  let examCount = 0;

  const cells = $("td");
  const colCount = headings.length;

  for (let i = colCount; i < cells.length; i++) {
    const cell = $(cells[i]);
    const colspan = parseInt(cell.attr("colspan") ?? "1", 10);

    // Exam type header spans multiple columns
    if (colspan > 1) {
      examTitle = cell.text().trim();
      examCount++;
      continue;
    }

    const index = (i - examCount) % colCount;

    if (index === slotIdx) {
      schedules.push({
        examType: examTitle,
        courseCode: "",
        courseName: "",
        slot: cell.text().trim().split("+")[0],
        examDate: "",
        session: "",
        time: "",
        venue: "",
        seatNo: "",
        seatLocation: "",
      });
    }

    const current = schedules[schedules.length - 1];
    if (!current) continue;

    if (index === dateIdx) {
      const date = cell.text().trim().toUpperCase();
      current.examDate = date || "";
    } else if (index === timeIdx) {
      current.time = cell.text().trim();
      const timings = current.time.split("-");
      if (timings.length === 2) {
        current.session = `${timings[0].trim()} - ${timings[1].trim()}`;
      }
    } else if (index === venueIdx) {
      const v = cell.text().trim();
      current.venue = v.replace(/-/g, "").trim() ? v : "";
    } else if (index === locationIdx) {
      const l = cell.text().trim();
      current.seatLocation = l.replace(/-/g, "").trim() ? l : "";
    } else if (index === seatIdx) {
      const n = cell.text().trim();
      current.seatNo = n.replace(/-/g, "").trim() ? n : "";
    }
  }

  return schedules;
}

export function parseGradeHistory(html: string): GradeHistory {
  const $ = cheerio.load(html);
  const history: GradeHistory = {
    semesters: [],
    cgpa: 0,
    totalCredits: 0,
  };

  const summary = parseCgpaSummary($);
  if (summary) {
    history.cgpa = summary.cgpa;
    history.totalCredits = summary.creditsEarned;
  }

  // Walk the "Effective Grades" table for per-course rows, then group by
  // exam month. The detail rows (id="detailsView_...") are skipped.
  const grouped = new Map<string, GradeRecord[]>();
  $("table tr.tableContent").each((_i, tr) => {
    const $tr = $(tr);
    if ($tr.attr("id")?.startsWith("detailsView_")) return;
    const cells = $tr.find("td");
    if (cells.length < 8) return;
    const courseCode = $(cells[1]).text().trim();
    if (!/^[A-Z]{2,}[0-9]+/i.test(courseCode)) return;
    const courseName = $(cells[2]).text().trim();
    const courseType = $(cells[3]).text().trim();
    const credits = parseFloat($(cells[4]).text().trim()) || 0;
    const grade = $(cells[5]).text().trim().toUpperCase();
    const examMonth = $(cells[6]).text().trim();
    if (!examMonth) return;
    const record: GradeRecord = {
      courseCode,
      courseName,
      courseType,
      credits,
      grade,
      gradePoints: (GRADE_POINTS as Record<string, number>)[grade] ?? 0,
    };
    const bucket = grouped.get(examMonth) ?? [];
    bucket.push(record);
    grouped.set(examMonth, bucket);
  });

  for (const [examMonth, grades] of grouped) {
    const earnedCredits = grades.reduce(
      (s, g) => s + (g.grade === "F" || g.grade === "N" ? 0 : g.credits),
      0
    );
    const weightedPoints = grades.reduce(
      (s, g) => s + g.gradePoints * g.credits,
      0
    );
    const totalCredits = grades.reduce((s, g) => s + g.credits, 0);
    const gpa = totalCredits > 0 ? weightedPoints / totalCredits : 0;
    history.semesters.push({
      semester: examMonth,
      gpa: Math.round(gpa * 100) / 100,
      credits: earnedCredits,
      grades,
    });
  }

  return history;
}

/**
 * Parse semester grades from examinations/examGradeView/doStudentGradeView.
 *
 * Android app: first table, headings with 'code' and 'grade'.
 * GPA from last cell text split by ':'.
 */
export function parseSemesterGrades(html: string): {
  grades: GradeRecord[];
  gpa: number;
} {
  const $ = cheerio.load(html);
  const result: { grades: GradeRecord[]; gpa: number } = {
    grades: [],
    gpa: 0,
  };

  if (html.toLowerCase().includes("no records")) return result;

  const table = $("table").first();
  if (!table.length) return result;

  const headings: string[] = [];
  let creditsSpan = 1;
  let creditsIdx = -1;

  table.find("th").each((i, el) => {
    const text = $(el).text().trim().toLowerCase();
    headings.push(text);
    if (text.includes("credits")) {
      creditsIdx = i;
      creditsSpan = parseInt($(el).attr("colspan") ?? "1", 10) || 1;
    }
  });

  let codeIdx = headings.findIndex((h) => h.includes("code"));
  let gradeIdx = headings.findIndex((h) => h.includes("grade"));

  // Adjust indices for colspan
  if (codeIdx > creditsIdx && creditsIdx >= 0) codeIdx += creditsSpan - 1;
  if (gradeIdx > creditsIdx && creditsIdx >= 0) gradeIdx += creditsSpan - 1;

  const cells = table.find("td");
  const adjustedColCount = headings.length + creditsSpan - 1;

  for (let i = 0; codeIdx + i < cells.length && gradeIdx + i < cells.length; i += adjustedColCount) {
    const code = $(cells[codeIdx + i]).text().trim();
    const grade = $(cells[gradeIdx + i]).text().trim();
    if (!code) continue;

    result.grades.push({
      courseCode: code,
      courseName: "",
      courseType: "",
      credits: 0,
      grade,
      gradePoints: 0,
    });
  }

  // GPA from last cell: "SGPA : 8.58"
  if (cells.length > 0) {
    const lastCellText = $(cells[cells.length - 1]).text().trim();
    const parts = lastCellText.split(":");
    if (parts.length > 1) {
      result.gpa = parseFloat(parts[1].trim()) || 0;
    }
  }

  return result;
}

/**
 * Parse student profile from studentsRecord/StudentProfileAllView.
 *
 * Android app: Iterates <td> cells, finds label cells with key text,
 * reads the next cell as value.
 */
export function parseProfile(html: string): StudentProfile {
  const $ = cheerio.load(html);

  const profile: StudentProfile = {
    name: "",
    registrationNumber: "",
    applicationNumber: "",
    program: "",
    branch: "",
    school: "",
    email: "",
    phone: "",
    bloodGroup: "",
  };

  // Registration number lives in a hidden input, not a table cell.
  const regnoInput = $('input[name="regno"]').attr("value");
  if (regnoInput) profile.registrationNumber = regnoInput.trim();

  const cells = $("td");
  for (let i = 0; i < cells.length - 1; i++) {
    const key = $(cells[i]).text().trim().toLowerCase().replace(/\s+/g, " ");
    const value = $(cells[i + 1]).text().trim();
    if (!value) continue;

    // First-match semantics: don't overwrite once a field has been set. VTOP
    // pages repeat similar labels in faculty/address sections, and the first
    // occurrence is the student's own personal info block.
    if (!profile.name && key === "student name") {
      profile.name = value;
    } else if (!profile.applicationNumber && key === "application number") {
      profile.applicationNumber = value;
    } else if (
      !profile.program &&
      (key === "programme" || key === "applied degree" || key === "degree")
    ) {
      profile.program = value;
    } else if (
      !profile.branch &&
      (key === "branch" || key === "branch / group studied")
    ) {
      profile.branch = value;
    } else if (!profile.school && key === "school") {
      profile.school = value;
    } else if (!profile.email && key === "email") {
      profile.email = value;
    } else if (!profile.phone && key === "mobile number") {
      profile.phone = value;
    } else if (!profile.bloodGroup && key === "blood group") {
      profile.bloodGroup = value;
    }
  }

  return profile;
}

/**
 * Parse curriculum progress from the grade-history HTML.
 *
 * Pulls three things from tables on the page:
 *   - Curriculum Details: per high-level distribution type
 *     (Foundation Core, Discipline Core, Electives, ... + Total Credits row)
 *   - Basket Details: per fine-grained basket with its parent distribution type
 *   - CGPA summary header row: total credits registered, earned, CGPA,
 *     and grade-letter counts (S/A/B/.../N)
 *
 * Robust to surrounding markup changes by matching tables on their header
 * cell text rather than DOM position.
 */
function buildProgressRow(
  name: string,
  required: number,
  earned: number,
  distributionType?: string
): CurriculumProgressRow {
  const m = progressMetrics(required, earned);
  return {
    name,
    ...(distributionType !== undefined ? { distributionType } : {}),
    creditsRequired: required,
    creditsEarned: earned,
    creditsRemaining: m.creditsRemaining,
    percentComplete: m.percentComplete,
  };
}

export function parseCurriculumProgress(html: string): CurriculumProgress {
  const $ = cheerio.load(html);

  const progress: CurriculumProgress = {
    totals: {
      creditsRegistered: 0,
      creditsRequired: 0,
      creditsEarned: 0,
      creditsRemaining: 0,
      percentComplete: 0,
      cgpa: 0,
    },
    distributionTypes: [],
    baskets: [],
    gradeDistribution: { S: 0, A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, N: 0 },
  };

  $("table").each((_i, tableEl) => {
    const $table = $(tableEl);
    const headerText = $table.find("tr").first().text().toLowerCase();

    if (headerText.includes("curriculum details")) {
      $table.find("tr.tableContent, tr.fixedContent").each((_j, tr) => {
        const cells = $(tr).find("td");
        if (cells.length < 3) return;
        const name = $(cells[0]).text().trim();
        const required = parseFloat($(cells[1]).text().trim()) || 0;
        const earned = parseFloat($(cells[2]).text().trim()) || 0;
        if (name.toLowerCase() === "total credits") {
          progress.totals.creditsRequired = required;
          progress.totals.creditsEarned = earned;
          return;
        }
        progress.distributionTypes.push(buildProgressRow(name, required, earned));
      });
    }

    if (headerText.includes("basket details")) {
      $table.find("tr.tableContent").each((_j, tr) => {
        const cells = $(tr).find("td");
        if (cells.length < 4) return;
        const name = $(cells[0]).text().trim();
        const distributionType = $(cells[1]).text().trim();
        const required = parseFloat($(cells[2]).text().trim()) || 0;
        const earned = parseFloat($(cells[3]).text().trim()) || 0;
        progress.baskets.push(
          buildProgressRow(name, required, earned, distributionType)
        );
      });
    }
  });

  const summary = parseCgpaSummary($);
  if (summary) {
    progress.totals.creditsRegistered = summary.creditsRegistered;
    progress.totals.cgpa = summary.cgpa;
    progress.gradeDistribution = summary.gradeDistribution;
  }

  const totalsMetrics = progressMetrics(
    progress.totals.creditsRequired,
    progress.totals.creditsEarned
  );
  progress.totals.creditsRemaining = totalsMetrics.creditsRemaining;
  progress.totals.percentComplete = totalsMetrics.percentComplete;

  return progress;
}

