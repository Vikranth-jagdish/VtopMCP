import * as cheerio from "cheerio";
import type { Weekday, WeeklySchedule, CalendarDay } from "./attendance-calc.js";
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

export interface GridSession {
  day: Weekday;
  slot: string;
  courseCode: string;
  venue: string;
  startTime: string;
  endTime: string;
  type: "THEORY" | "LAB";
}

const GRID_WEEKDAYS: Record<string, Weekday> = {
  SUN: "SUN", MON: "MON", TUE: "TUE", WED: "WED", THU: "THU", FRI: "FRI", SAT: "SAT",
};

/**
 * Parse the weekly day×time grid out of the processViewTimeTable HTML.
 *
 * The grid is paired rows per day: a THEORY row (first cell = weekday, second =
 * "THEORY") followed by a LAB row (first cell = "LAB"). Period start/end times
 * live in four header rows (THEORY Start/End, LAB Start/End). Occupied cells are
 * "SLOT-COURSECODE" (e.g. "A1-BCSE302L"); empty/free slots are bare codes or "-".
 * Each occupied cell is one weekly session of that course.
 */
export function parseTimetableGrid(html: string): GridSession[] {
  const $ = cheerio.load(html);
  // The grid is the table that has a row whose first cell is a weekday (the
  // course-list table never does), so detect that rather than matching against
  // concatenated cell text.
  const gridEl = $("table").toArray().find((t) =>
    $(t)
      .find("tr")
      .toArray()
      .some((r) => GRID_WEEKDAYS[$(r).find("td, th").first().text().trim().toUpperCase()] !== undefined),
  );
  if (!gridEl) return [];
  const grid = $(gridEl);
  const tbodyRows = grid.find("> tbody > tr");
  const rows = (tbodyRows.length ? tbodyRows : grid.find("tr")).toArray();
  const rowCells = (r: (typeof rows)[number]) =>
    $(r).find("td, th").map((_j, e) => $(e).text().replace(/\s+/g, " ").trim()).get();

  let theoryStart: string[] = [], theoryEnd: string[] = [], labStart: string[] = [], labEnd: string[] = [];
  const sessions: GridSession[] = [];
  let currentDay: Weekday | null = null;

  const addSlots = (
    slotCells: string[], starts: string[], ends: string[],
    type: "THEORY" | "LAB", day: Weekday,
  ) => {
    for (let i = 0; i < slotCells.length; i++) {
      const cell = slotCells[i];
      if (!cell || /^lunch$/i.test(cell) || cell === "-") continue;
      // Occupied cell: "SLOT-COURSE-TYPE-VENUE-GROUP", e.g. "A1-BCSE302L-TH-AB3-205-ALL"
      // (venue itself can contain a dash). Bare slots like "A2" have no course.
      const parts = cell.split("-").map((s) => s.trim());
      if (parts.length < 2) continue;
      const slot = parts[0];
      const courseCode = parts[1];
      if (!/^[A-Z]{3,5}\d{3,4}[A-Z]?$/.test(courseCode)) continue;
      const venue = parts.length >= 5 ? parts.slice(3, -1).join("-") : "";
      sessions.push({ day, slot, courseCode, venue, startTime: starts[i] ?? "", endTime: ends[i] ?? "", type });
    }
  };

  for (const r of rows) {
    const cells = rowCells(r);
    if (!cells.length) continue;
    const c0 = (cells[0] ?? "").toUpperCase();
    const c1 = (cells[1] ?? "").toUpperCase();

    if (c0 === "THEORY" && c1 === "START") { theoryStart = cells.slice(2); continue; }
    if (c0 === "LAB" && c1 === "START") { labStart = cells.slice(2); continue; }
    if (c0 === "END") {
      if (!theoryEnd.length) theoryEnd = cells.slice(1);
      else labEnd = cells.slice(1);
      continue;
    }
    if (GRID_WEEKDAYS[c0]) {
      currentDay = GRID_WEEKDAYS[c0];
      addSlots(cells.slice(2), theoryStart, theoryEnd, "THEORY", currentDay);
      continue;
    }
    if (c0 === "LAB" && currentDay) {
      addSlots(cells.slice(1), labStart, labEnd, "LAB", currentDay);
    }
  }
  return sessions;
}

/** Group grid sessions into a per-weekday list of course codes (repeats = multiple sessions). */
export function weeklyScheduleFromGrid(sessions: GridSession[]): WeeklySchedule {
  const sched: WeeklySchedule = { SUN: [], MON: [], TUE: [], WED: [], THU: [], FRI: [], SAT: [] };
  for (const s of sessions) sched[s.day].push(s.courseCode);
  return sched;
}

export interface AttendanceDetailRef {
  courseCode: string;
  courseName: string;
  classId: string;
  slot: string;
}

/**
 * From the main attendance page, extract per-course handles for the per-class
 * detail view. Each row's "View" control carries
 * processViewAttendanceDetail('<classId>','<slot>').
 */
export function parseAttendanceDetailRefs(html: string): AttendanceDetailRef[] {
  const $ = cheerio.load(html);
  const tableEl = $("table")
    .toArray()
    .find((t) => $(t).find("[onclick*='processViewAttendanceDetail']").length > 0);
  if (!tableEl) return [];
  const table = $(tableEl);
  // Use all rows (the table has a <thead> header + <tbody> data); the header is
  // the first row and data rows are the ones carrying the detail onclick.
  const allRows = table.find("tr").toArray();
  const headers = $(allRows[0])
    .find("td, th")
    .map((_i, e) => $(e).text().replace(/\s+/g, " ").trim().toLowerCase())
    .get();
  const codeIdx = headers.findIndex((h) => h.includes("course") && h.includes("code"));
  const nameIdx = headers.findIndex((h) => h.includes("course") && (h.includes("title") || h.includes("name")));

  const refs: AttendanceDetailRef[] = [];
  for (const r of allRows) {
    const oc = $(r).find("[onclick*='processViewAttendanceDetail']").attr("onclick") ?? "";
    const m = oc.match(/processViewAttendanceDetail\((?:&#39;|['"])([^'"&]+)(?:&#39;|['"])\s*,\s*(?:&#39;|['"])([^'"&]+)/);
    if (!m) continue;
    const cells = $(r).find("td").map((_j, e) => $(e).text().replace(/\s+/g, " ").trim()).get();
    const cell = (idx: number) => (idx >= 0 && idx < cells.length ? cells[idx] : "");
    refs.push({ courseCode: cell(codeIdx), courseName: cell(nameIdx), classId: m[1], slot: m[2] });
  }
  return refs;
}

export interface AttendanceDetailCounts {
  present: number;
  absent: number;
  onDuty: number;
  total: number;
  /** OD time in class-hours (duration-based: a 2-period lab counts as 2). */
  odHours: number;
}

/** "08:00", "08:00 AM", "01:40 PM" -> minutes since midnight, or null. */
function clockToMinutes(token: string): number | null {
  const m = token.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return null;
  let h = +m[1];
  const min = +m[2];
  const ap = m[3]?.toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  else if (ap === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

/**
 * How many ~50-minute class periods a "Day And Timing" cell spans (a 2-period
 * lab counts as 2). VTOP writes timings in either 24-hour ("14:00-15:40") or
 * 12-hour ("02:00 PM - 03:40 PM") form, and each end may carry its own AM/PM,
 * so we parse both clock tokens independently. A 12-hour pair that crosses noon
 * without an explicit PM on the end (e.g. "11:00-01:40") yields a negative span;
 * we add 12h to recover it rather than silently undercounting to one period.
 */
function periodsFromTiming(timing: string): number {
  const tokens = timing.match(/\d{1,2}:\d{2}\s*(?:AM|PM)?/gi);
  if (!tokens || tokens.length < 2) return 1;
  const start = clockToMinutes(tokens[0]);
  const end = clockToMinutes(tokens[tokens.length - 1]);
  if (start == null || end == null) return 1;
  let dur = end - start;
  if (dur < 0) dur += 12 * 60;
  return dur <= 0 ? 1 : Math.max(1, Math.round(dur / 50));
}

/** Parse a per-class attendance detail (processViewAttendanceDetail) and tally statuses. */
export function parseAttendanceDetail(html: string): AttendanceDetailCounts {
  const $ = cheerio.load(html);
  const table = $("table").first();
  const tbody = table.children("tbody");
  const rows = tbody.length ? tbody.children("tr") : table.children("tr");

  const headers = $(rows[0])
    .find("td, th")
    .map((_i, e) => $(e).text().replace(/\s+/g, " ").trim().toLowerCase())
    .get();
  const statusIdx = headers.findIndex((h) => h.includes("status"));
  const timingIdx = headers.findIndex((h) => h.includes("timing") || (h.includes("day") && h.includes("time")));

  const counts: AttendanceDetailCounts = { present: 0, absent: 0, onDuty: 0, total: 0, odHours: 0 };
  rows.slice(1).each((_i, r) => {
    const cells = $(r).find("td").map((_j, e) => $(e).text().replace(/\s+/g, " ").trim()).get();
    if (cells.length === 0) return;
    const status = (statusIdx >= 0 ? cells[statusIdx] : cells[cells.length - 1] ?? "").toLowerCase();
    if (!status) return;
    counts.total++;
    if (/on\s*duty/.test(status)) {
      counts.onDuty++;
      counts.odHours += periodsFromTiming(timingIdx >= 0 ? cells[timingIdx] ?? "" : "");
    } else if (/present/.test(status)) counts.present++;
    else if (/absent/.test(status)) counts.absent++;
  });
  return counts;
}

const MONTH_NUM: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};
const DAY_ORDER_NAME: Record<string, Weekday> = {
  SUNDAY: "SUN", MONDAY: "MON", TUESDAY: "TUE", WEDNESDAY: "WED",
  THURSDAY: "THU", FRIDAY: "FRI", SATURDAY: "SAT",
};
const pad2 = (n: number) => String(n).padStart(2, "0");

/** "01-DEC-2025" -> "2025-12" (sortable month key) for range filtering. */
export function calDateMonthKey(calDate: string): string {
  const [, mon, yr] = calDate.split("-");
  const m = MONTH_NUM[(mon ?? "").toUpperCase()];
  return m ? `${yr}-${pad2(m)}` : "";
}

/** Extract the month buttons' calDate values (e.g. "01-DEC-2025") from the getListForSemester response. */
export function parseCalendarMonths(html: string): string[] {
  return [...new Set(
    [...html.matchAll(/processViewCalendar\([^)]*?(\d{2}-[A-Z]{3}-\d{4})/g)].map((m) => m[1]),
  )];
}

/**
 * Parse one month's academic-calendar table (the processViewCalendar response).
 * `calDate` is that month's token, e.g. "01-DEC-2025", used to date each cell.
 *
 * Each day cell's spans are [dayNumber, info, detail, ...repeated per program].
 * A day is instructional when the first info span starts with "Instructional Day"
 * ("No Instructional Day" is excluded). A working Saturday etc. carries a
 * "<Weekday> Day Order" note in a detail span telling which timetable it follows.
 */
export function parseAcademicCalendar(html: string, calDate: string): CalendarDay[] {
  const [, mon, yr] = calDate.split("-");
  const monthNum = MONTH_NUM[(mon ?? "").toUpperCase()];
  const year = parseInt(yr ?? "", 10);
  if (!monthNum || !Number.isFinite(year)) return [];

  const $ = cheerio.load(html);
  const table = $("table.calendar-table").first().length
    ? $("table.calendar-table").first()
    : $("#list-wrapper table").first();
  if (!table.length) return [];

  const days: CalendarDay[] = [];
  table.find("td").each((_i, td) => {
    const spans = $(td).find("span").map((_j, s) => $(s).text().replace(/\s+/g, " ").trim()).get();
    if (!spans.length) return;
    const day = parseInt(spans[0], 10);
    if (!Number.isFinite(day) || day < 1 || day > 31) return;

    const info = spans[1] ?? "";
    const instructional = /^instructional day/i.test(info);
    const joined = spans.join(" ");
    const m = joined.match(/(SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY)\s+Day Order/i);
    const dayOrderWeekday = m ? DAY_ORDER_NAME[m[1].toUpperCase()] : null;

    // Event/holiday text lives in the parenthesised "detail" spans, repeated per
    // program (Semester/Flexible/LAW/…) — dedupe to a single label.
    const details = spans
      .slice(1)
      .filter((s) => /^\(/.test(s))
      .map((s) => s.replace(/^\(|\)$/g, "").trim())
      .filter(Boolean);
    const label = [...new Set(details)].join(" / ");

    days.push({
      date: `${year}-${pad2(monthNum)}-${pad2(day)}`,
      instructional,
      dayOrderWeekday: instructional ? (dayOrderWeekday ?? null) : null,
      label,
    });
  });
  return days;
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

  // #fixedTableContainer is a <div> that wraps the marks <table.customTable>.
  const container = $("#fixedTableContainer").first();
  if (!container.length) return records;
  const table = container.is("table") ? container : container.find("table").first();
  if (!table.length) return records;

  // Direct rows only (htmlparser2 doesn't auto-insert <tbody>).
  const tbody = table.children("tbody");
  const rows = tbody.length ? tbody.children("tr") : table.children("tr");
  if (!rows.length) return records;

  // Outer heading row → column indices for the per-course summary row.
  const headings: string[] = [];
  $(rows[0])
    .find("> td, > th")
    .each((_i, el) => {
      headings.push($(el).text().trim().toLowerCase());
    });
  const courseCodeIdx = headings.findIndex((h) => h.includes("course") && h.includes("code"));
  const courseTitleIdx = headings.findIndex(
    (h) => h.includes("course") && (h.includes("title") || h.includes("name"))
  );
  const courseTypeIdx = headings.findIndex((h) => h.includes("course") && h.includes("type"));
  const slotIdx = headings.findIndex((h) => h.includes("slot"));

  // Rows alternate: [course summary row] then [row holding the nested marks
  // table]. Walk summary rows and look ahead one row for the marks table.
  for (let i = 1; i < rows.length; i++) {
    const row = $(rows[i]);
    if (row.find("table").length) continue; // nested-table row — consumed below
    const cells = row.find("> td");
    if (cells.length < 2) continue;
    const cell = (idx: number) =>
      idx >= 0 && idx < cells.length ? $(cells[idx]).text().trim() : "";

    const record: MarksRecord = {
      courseCode: cell(courseCodeIdx),
      courseName: cell(courseTitleIdx),
      courseType: cell(courseTypeIdx),
      slot: cell(slotIdx).split("+")[0].trim(),
      marks: [],
    };

    const innerTable = i + 1 < rows.length ? $(rows[i + 1]).find("table").first() : $();
    if (innerTable.length) {
      const innerRows = innerTable.find("tr");
      const ih: string[] = [];
      $(innerRows[0])
        .find("td, th")
        .each((_j, el) => {
          ih.push($(el).text().trim().toLowerCase());
        });
      const titleIdx = ih.findIndex((h) => h.includes("title"));
      const maxIdx = ih.findIndex((h) => h.includes("max") && !h.includes("weightage"));
      const scoredIdx = ih.findIndex((h) => h.includes("scored"));
      const weightageIdx = ih.findIndex((h) => h.includes("weightage") && h.includes("mark"));
      const maxWeightageIdx = ih.findIndex((h) => h.includes("%"));
      const averageIdx = ih.findIndex((h) => h.includes("average"));
      const statusIdx = ih.findIndex((h) => h.includes("status"));

      for (let j = 1; j < innerRows.length; j++) {
        const ic = $(innerRows[j]).find("td");
        const c = (idx: number) => (idx >= 0 && idx < ic.length ? $(ic[idx]).text().trim() : "");
        const title = c(titleIdx);
        if (!title) continue;
        record.marks.push({
          component: title,
          maxMarks: parseFloat(c(maxIdx)) || 0,
          scored: parseFloat(c(scoredIdx)) || 0,
          maxWeightage: parseFloat(c(maxWeightageIdx)) || 0,
          weightage: parseFloat(c(weightageIdx)) || 0,
          average: parseFloat(c(averageIdx)) || null,
          status: c(statusIdx),
        });
      }
    }

    if (record.courseCode || record.marks.length > 0) records.push(record);
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

const GRADE_SET = new Set<string>(GRADE_LETTERS);
/** "Nov 2025", "November-2025", "Nov'2025" — an exam-month token. */
const MONTH_YEAR_RE = /^[A-Za-z]{3,9}[\s.,'-]*\d{4}$/;

/**
 * Pull one grade row's fields out of its cell texts by CONTENT, not fixed
 * column index, so the parser survives VTOP reordering/adding columns (the
 * usual cause of "grades didn't parse"). Returns null for rows that aren't a
 * course-grade row (header, summary, detail). A row needs at least a course
 * code and an exam-month token to count.
 */
function extractGradeRow(
  texts: string[]
): { record: GradeRecord; examMonth: string } | null {
  const codeIdx = texts.findIndex((t) => /^[A-Z]{2,}\d{3,4}[A-Z]?$/.test(t));
  if (codeIdx < 0) return null;
  const examMonth = texts.find((t) => MONTH_YEAR_RE.test(t)) ?? "";
  if (!examMonth) return null;

  // Grade: the first lone grade letter (S/A/B/.../N) after the code.
  let gradeIdx = -1;
  for (let i = codeIdx + 1; i < texts.length; i++) {
    if (GRADE_SET.has(texts[i].toUpperCase())) {
      gradeIdx = i;
      break;
    }
  }
  const grade = gradeIdx >= 0 ? texts[gradeIdx].toUpperCase() : "";
  const end = gradeIdx >= 0 ? gradeIdx : texts.length;

  // Credits: a plain number (≤ 30) after the code — the Sl.No sits before the
  // code, so it isn't mistaken for credits. Scan the whole tail (not just up to
  // the grade) because some layouts put Credits after the Grade column; skip the
  // grade cell itself and exam-month tokens.
  let credits = 0;
  for (let i = codeIdx + 1; i < texts.length; i++) {
    if (i === gradeIdx || MONTH_YEAR_RE.test(texts[i])) continue;
    if (/^\d+(\.\d+)?$/.test(texts[i]) && +texts[i] <= 30) credits = +texts[i];
  }
  // Title/type: the non-numeric, non-grade cells right after the code.
  const meta = texts
    .slice(codeIdx + 1, end)
    .filter((t) => t && !/^\d+(\.\d+)?$/.test(t) && !GRADE_SET.has(t.toUpperCase()));

  return {
    record: {
      courseCode: texts[codeIdx],
      courseName: meta[0] ?? "",
      courseType: meta[1] ?? "",
      credits,
      grade,
      gradePoints: (GRADE_POINTS as Record<string, number>)[grade] ?? 0,
    },
    examMonth,
  };
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

  // Walk the "Effective Grades" table for per-course rows, then group by exam
  // month. Prefer the tagged rows (tr.tableContent); if VTOP dropped/renamed
  // that class, fall back to scanning every row — extractGradeRow ignores
  // anything that isn't a real course-grade row. Detail rows (id="detailsView_")
  // are always skipped.
  let rows = $("table tr.tableContent").toArray();
  if (rows.length === 0) rows = $("table tr").toArray();

  const grouped = new Map<string, GradeRecord[]>();
  for (const tr of rows) {
    const $tr = $(tr);
    if ($tr.attr("id")?.startsWith("detailsView_")) continue;
    const texts = $tr
      .find("td")
      .map((_j, el) => $(el).text().replace(/\s+/g, " ").trim())
      .get();
    const parsed = extractGradeRow(texts);
    if (!parsed) continue;
    const { record, examMonth } = parsed;
    const bucket = grouped.get(examMonth) ?? [];
    bucket.push(record);
    grouped.set(examMonth, bucket);
  }

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

