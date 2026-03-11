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

/** Extract text from a table cell, trimmed */
function cellText($: cheerio.CheerioAPI, el: cheerio.Element): string {
  return $(el).text().trim();
}

/** Parse semester dropdown options from any VTOP page */
export function parseSemesters(html: string): Semester[] {
  const $ = cheerio.load(html);
  const semesters: Semester[] = [];

  $("select option").each((_i, el) => {
    const id = $(el).attr("value");
    const name = $(el).text().trim();
    if (id && name && id !== "") {
      semesters.push({ id, name });
    }
  });

  return semesters;
}

/** Parse attendance table from VTOP HTML */
export function parseAttendance(html: string): AttendanceRecord[] {
  const $ = cheerio.load(html);
  const records: AttendanceRecord[] = [];

  // VTOP attendance is typically in a table with class or id
  $("table tbody tr").each((_i, row) => {
    const cells = $(row).find("td");
    if (cells.length < 6) return;

    const courseCode = cellText($, cells[0]);
    const courseName = cellText($, cells[1]);
    const courseType = cellText($, cells[2]);

    // Skip header-like rows
    if (!courseCode || courseCode.toLowerCase() === "course code") return;

    const attended = parseInt(cellText($, cells[3]), 10) || 0;
    const total = parseInt(cellText($, cells[4]), 10) || 0;
    const percentageText = cellText($, cells[5]);
    const percentage = parseFloat(percentageText) || 0;

    records.push({
      courseCode,
      courseName,
      courseType,
      attended,
      total,
      percentage,
    });
  });

  return records;
}

/** Parse timetable from VTOP HTML */
export function parseTimetable(html: string): TimetableSlot[] {
  const $ = cheerio.load(html);
  const slots: TimetableSlot[] = [];
  const days = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  $("table tbody tr").each((_i, row) => {
    const cells = $(row).find("td");
    if (cells.length < 2) return;

    const firstCell = cellText($, cells[0]);
    // Check if first cell is a day name or contains time info
    const dayMatch = days.find(
      (d) => firstCell.toLowerCase() === d.toLowerCase()
    );

    if (dayMatch) {
      // Each subsequent cell represents a time slot
      cells.each((j, cell) => {
        if (j === 0) return; // Skip the day column
        const content = $(cell).text().trim();
        if (!content || content === "-") return;

        // Parse slot content: typically "COURSE_CODE-TYPE\nVENUE\nFACULTY"
        const lines = content.split(/\n/).map((l) => l.trim());
        if (lines.length === 0) return;

        const courseInfo = lines[0].split("-");
        slots.push({
          day: dayMatch,
          startTime: "",
          endTime: "",
          courseCode: courseInfo[0] ?? lines[0],
          courseName: "",
          courseType: courseInfo[1] ?? "",
          venue: lines[1] ?? "",
          faculty: lines[2] ?? "",
        });
      });
    }
  });

  return slots;
}

/** Parse internal marks from VTOP HTML */
export function parseMarks(html: string): MarksRecord[] {
  const $ = cheerio.load(html);
  const records: MarksRecord[] = [];
  let currentRecord: MarksRecord | null = null;

  $("table tbody tr").each((_i, row) => {
    const cells = $(row).find("td");
    if (cells.length < 3) return;

    const firstCell = cellText($, cells[0]);

    // Check if this is a course header row (has course code pattern)
    if (/^[A-Z]{3,4}\d{3,4}/.test(firstCell)) {
      if (currentRecord) {
        records.push(currentRecord);
      }
      currentRecord = {
        courseCode: firstCell,
        courseName: cellText($, cells[1]),
        courseType: cellText($, cells[2]),
        marks: [],
      };
    } else if (currentRecord && firstCell) {
      // This is a marks component row
      const scored = parseFloat(cellText($, cells[cells.length - 2])) || 0;
      const status = cellText($, cells[cells.length - 1]);

      currentRecord.marks.push({
        component: firstCell,
        maxMarks: parseFloat(cellText($, cells[1])) || 0,
        weightage: parseFloat(cellText($, cells[2])) || 0,
        scored,
        status,
      });
    }
  });

  if (currentRecord) {
    records.push(currentRecord);
  }

  return records;
}

/** Parse exam schedule from VTOP HTML */
export function parseExamSchedule(html: string): ExamSchedule[] {
  const $ = cheerio.load(html);
  const schedules: ExamSchedule[] = [];

  $("table tbody tr").each((_i, row) => {
    const cells = $(row).find("td");
    if (cells.length < 5) return;

    const courseCode = cellText($, cells[0]);
    if (!courseCode || courseCode.toLowerCase() === "course code") return;

    schedules.push({
      courseCode,
      courseName: cellText($, cells[1]),
      examDate: cellText($, cells[2]),
      session: cellText($, cells[3]),
      time: cellText($, cells[4]),
      venue: cells.length > 5 ? cellText($, cells[5]) : "",
      seatNo: cells.length > 6 ? cellText($, cells[6]) : "",
    });
  });

  return schedules;
}

/** Parse grade history from VTOP HTML */
export function parseGradeHistory(html: string): GradeHistory {
  const $ = cheerio.load(html);
  const history: GradeHistory = {
    semesters: [],
    cgpa: 0,
    totalCredits: 0,
  };

  let currentSemester: GradeHistory["semesters"][number] | null = null;

  $("table").each((_i, table) => {
    $(table)
      .find("tbody tr")
      .each((_j, row) => {
        const cells = $(row).find("td");
        const text = $(row).text().trim();

        // Detect semester header
        if (text.includes("Semester") && cells.length <= 2) {
          if (currentSemester) {
            history.semesters.push(currentSemester);
          }
          currentSemester = {
            semester: text,
            gpa: 0,
            credits: 0,
            grades: [],
          };
          return;
        }

        // Detect GPA row
        if (text.includes("GPA") || text.includes("CGPA")) {
          const gpaMatch = text.match(/(\d+\.?\d*)/);
          if (gpaMatch) {
            const val = parseFloat(gpaMatch[1]);
            if (text.includes("CGPA")) {
              history.cgpa = val;
            } else if (currentSemester) {
              currentSemester.gpa = val;
            }
          }
          return;
        }

        // Grade rows
        if (currentSemester && cells.length >= 5) {
          const courseCode = cellText($, cells[0]);
          if (!courseCode || /^(sl|course)/i.test(courseCode)) return;

          const credits = parseFloat(cellText($, cells[3])) || 0;
          const grade = cellText($, cells[4]);

          currentSemester.grades.push({
            courseCode,
            courseName: cellText($, cells[1]),
            courseType: cellText($, cells[2]),
            credits,
            grade,
            gradePoints: 0,
          });
          currentSemester.credits += credits;
          history.totalCredits += credits;
        }
      });
  });

  if (currentSemester) {
    history.semesters.push(currentSemester);
  }

  return history;
}

/** Parse student profile from VTOP HTML */
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

  // VTOP profile pages typically use label-value pairs in tables or divs
  const extractField = (label: string): string => {
    let value = "";
    $("td, th, div, span").each((_i, el) => {
      const text = $(el).text().trim();
      if (text.toLowerCase().includes(label.toLowerCase())) {
        const next = $(el).next();
        if (next.length) {
          value = next.text().trim();
        }
      }
    });
    return value;
  };

  profile.name = extractField("Name");
  profile.registrationNumber = extractField("Register Number") || extractField("Registration Number");
  profile.applicationNumber = extractField("Application Number");
  profile.program = extractField("Programme") || extractField("Program");
  profile.branch = extractField("Branch");
  profile.school = extractField("School");
  profile.email = extractField("Email") || extractField("E-Mail");
  profile.phone = extractField("Mobile") || extractField("Phone");
  profile.bloodGroup = extractField("Blood Group");

  return profile;
}
