#!/usr/bin/env tsx
/**
 * Offline regression tests for the HTML parsers, against the shared fixtures.
 *   npm run test:parser
 */
import assert from "node:assert/strict";
import {
  parseMarks,
  parseTimetableGrid,
  weeklyScheduleFromGrid,
  parseAcademicCalendar,
  parseAttendance,
  parseAttendanceDetailRefs,
  parseAttendanceDetail,
  parseGradeHistory,
} from "../src/services/vtop-parser.js";
import * as F from "./fixtures.js";

let passed = 0;
const check = (name: string, fn: () => void) => { fn(); passed++; console.log(`  ok  ${name}`); };

// --- marks (the #fixedTableContainer div-vs-table bug) ---
check("parseMarks extracts a record (div-wrapped table)", () => {
  const recs = parseMarks(F.MARKS_HTML);
  assert.equal(recs.length, 1);
  const r = recs[0];
  assert.equal(r.courseCode, "BTST101L");
  assert.equal(r.courseName, "Database Systems");
  assert.equal(r.slot, "A1");
  assert.equal(r.marks.length, 1);
  assert.deepEqual(r.marks[0], {
    component: "CAT - 1", maxMarks: 50, scored: 40, maxWeightage: 15, weightage: 12, average: 30, status: "Present",
  });
});
check("parseMarks returns [] on 'No data found'", () => {
  assert.equal(parseMarks("<div id='fixedTableContainer'>No data found</div>").length, 0);
});

// --- attendance main ---
check("parseAttendance reads attended/total/percentage", () => {
  const recs = parseAttendance(F.ATT_MAIN_HTML);
  assert.equal(recs.length, 2);
  assert.deepEqual(
    { c: recs[0].courseCode, a: recs[0].attended, t: recs[0].total, p: recs[0].percentage, slot: recs[0].slot },
    { c: "BTST101L", a: 45, t: 50, p: 90, slot: "A1" },
  );
  assert.equal(recs[1].courseCode, "BTST202L");
  assert.equal(recs[1].attended, 30);
});

// --- timetable grid ---
check("parseTimetableGrid parses slot/course/venue/time", () => {
  const sessions = parseTimetableGrid(F.TIMETABLE_HTML);
  assert.equal(sessions.length, 3);
  const a1 = sessions.find((s) => s.slot === "A1")!;
  assert.equal(a1.courseCode, "BTST101L");
  assert.equal(a1.venue, "AB1-101");
  assert.equal(a1.startTime, "08:00");
  assert.equal(a1.type, "THEORY");
  assert.equal(a1.day, "MON");
  assert.equal(sessions.find((s) => s.type === "LAB")!.courseCode, "BTST101P");
  assert.deepEqual(weeklyScheduleFromGrid(sessions).MON.sort(), ["BTST101L", "BTST101P", "BTST202L"]);
});

// --- academic calendar ---
check("parseAcademicCalendar reads instructional + day-order + label", () => {
  const days = parseAcademicCalendar(F.CAL_HTML, "01-DEC-2025");
  const d8 = days.find((d) => d.date === "2025-12-08")!;
  assert.equal(d8.instructional, true);
  assert.equal(d8.dayOrderWeekday, null);
  assert.match(d8.label ?? "", /Working Day/i);
  const d13 = days.find((d) => d.date === "2025-12-13")!;
  assert.equal(d13.dayOrderWeekday, "THU");
  assert.match(d13.label ?? "", /Thursday Day Order/i);
  assert.equal(days.find((d) => d.date === "2025-12-07")!.instructional, false);
});

// --- attendance detail / OD ---
check("parseAttendanceDetailRefs extracts classId/slot/course", () => {
  const refs = parseAttendanceDetailRefs(F.ATT_MAIN_HTML);
  assert.equal(refs.length, 2);
  assert.deepEqual(refs[0], { courseCode: "BTST101L", courseName: "Database Systems", classId: "CH001", slot: "A1+TA1" });
  assert.equal(refs[1].classId, "CH002");
});
check("parseAttendanceDetail counts statuses + OD hours (lab=2)", () => {
  const d = parseAttendanceDetail(F.ATT_DETAIL_HTML);
  assert.equal(d.present, 1);
  assert.equal(d.absent, 1);
  assert.equal(d.onDuty, 2);
  assert.equal(d.total, 4);
  assert.equal(d.odHours, 3);
});

// --- grade history ---
check("parseGradeHistory reads CGPA + per-semester grades", () => {
  const h = parseGradeHistory(F.GRADE_HISTORY_HTML);
  assert.equal(h.cgpa, 8.43);
  assert.equal(h.totalCredits, 7);
  assert.equal(h.semesters.length, 1);
  assert.equal(h.semesters[0].semester, "Nov 2025");
  assert.equal(h.semesters[0].gpa, 8.43); // (3*9 + 4*8)/7
  assert.equal(h.semesters[0].grades.length, 2);
});

console.log(`\n${passed} checks passed.`);
