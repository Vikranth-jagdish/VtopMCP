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
} from "../types/index.js";

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

/**
 * Parse grade history from examinations/examGradeView/StudentGradeHistory.
 *
 * Android app: Last table with heading containing 'credits'.
 * Extracts 'earned' credits and 'cgpa' from the second row.
 */
export function parseGradeHistory(html: string): GradeHistory {
  const $ = cheerio.load(html);
  const history: GradeHistory = {
    semesters: [],
    cgpa: 0,
    totalCredits: 0,
  };

  const tables = $("table");

  for (let i = tables.length - 1; i >= 0; i--) {
    const table = $(tables[i]);
    const firstRowCells = table.find("tr").first().find("td");
    const firstCellText = firstRowCells.first().text().toLowerCase();

    if (firstCellText.includes("credits")) {
      let creditsIdx = -1;
      let cgpaIdx = -1;

      firstRowCells.each((j, el) => {
        const text = $(el).text().toLowerCase();
        if (text.includes("earned")) creditsIdx = j;
        if (text.includes("cgpa")) cgpaIdx = j;
      });

      const allCells = table.find("td");
      const headingCount = firstRowCells.length;

      if (creditsIdx >= 0 && creditsIdx + headingCount < allCells.length) {
        history.totalCredits =
          parseFloat($(allCells[creditsIdx + headingCount]).text()) || 0;
      }
      if (cgpaIdx >= 0 && cgpaIdx + headingCount < allCells.length) {
        history.cgpa =
          parseFloat($(allCells[cgpaIdx + headingCount]).text()) || 0;
      }
      break;
    }
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

  if (!html.toLowerCase().includes("personal information")) return profile;

  const cells = $("td");
  for (let i = 0; i < cells.length - 1; i++) {
    const key = $(cells[i]).text().trim().toLowerCase();
    const value = $(cells[i + 1]).text().trim();

    if (key.includes("student") && key.includes("name")) {
      profile.name = value;
    } else if (key.includes("register") && key.includes("number")) {
      profile.registrationNumber = value;
    } else if (key.includes("application") && key.includes("number")) {
      profile.applicationNumber = value;
    } else if (key.includes("programme") || key === "program") {
      profile.program = value;
    } else if (key.includes("branch")) {
      profile.branch = value;
    } else if (key.includes("school")) {
      profile.school = value;
    } else if (key.includes("e-mail") || key.includes("email")) {
      profile.email = value;
    } else if (key.includes("mobile") || key.includes("phone")) {
      profile.phone = value;
    } else if (key.includes("blood")) {
      profile.bloodGroup = value;
    }
  }

  return profile;
}
