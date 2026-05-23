#!/usr/bin/env tsx
/**
 * Offline regression tests for HTML parsers that previously broke silently.
 *   npm run test:parser
 */
import assert from "node:assert/strict";
import { parseMarks, parseTimetableGrid, weeklyScheduleFromGrid, parseAcademicCalendar, parseAttendanceDetailRefs, parseAttendanceDetail } from "../src/services/vtop-parser.js";

let passed = 0;
const check = (name: string, fn: () => void) => { fn(); passed++; console.log(`  ok  ${name}`); };

// Marks: the bug was treating #fixedTableContainer (a <div>) as the table -> 0 records.
// This fixture mirrors the real structure: div > table.customTable, heading row,
// course summary row, then a row holding the nested marks table.
const MARKS_HTML = `
<div id="fixedTableContainer"><table class="customTable">
<tr><td>Sl.No.</td><td>ClassNbr</td><td>Course Code</td><td>Course Title</td><td>Course Type</td><td>Faculty</td><td>Slot</td></tr>
<tr><td>1</td><td>CH999</td><td>BTST101L</td><td>Test Course</td><td>Theory Only</td><td>PROF X</td><td>A1+TA1</td></tr>
<tr><td colspan="7"><table class="customTable-level1">
  <tr><td>Sl.No.</td><td>Mark Title</td><td>Max. Mark</td><td>Weightage %</td><td>Status</td><td>Scored Mark</td><td>Weightage Mark</td><td>Class Average</td></tr>
  <tr><td>1</td><td>CAT - 1</td><td>50</td><td>15</td><td>Present</td><td>40</td><td>12</td><td>30</td></tr>
</table></td></tr>
</table></div>`;

check("parseMarks extracts a record (div-wrapped table)", () => {
  const recs = parseMarks(MARKS_HTML);
  assert.equal(recs.length, 1);
  const r = recs[0];
  assert.equal(r.courseCode, "BTST101L");
  assert.equal(r.courseName, "Test Course");
  assert.equal(r.courseType, "Theory Only");
  assert.equal(r.slot, "A1");
  assert.equal(r.marks.length, 1);
  assert.deepEqual(r.marks[0], {
    component: "CAT - 1", maxMarks: 50, scored: 40, maxWeightage: 15, weightage: 12, average: 30, status: "Present",
  });
});

check("parseMarks returns [] on 'No data found'", () => {
  assert.equal(parseMarks("<div id='fixedTableContainer'>No data found</div>").length, 0);
});

// Timetable grid: paired THEORY/LAB rows; cell = SLOT-COURSE-TYPE-VENUE-GROUP.
const GRID_HTML = `<table class="w3-table-all">
<tr><td>THEORY</td><td>Start</td><td>08:00</td><td>08:55</td><td>Lunch</td></tr>
<tr><td>End</td><td>08:50</td><td>09:45</td><td>Lunch</td></tr>
<tr><td>LAB</td><td>Start</td><td>08:00</td><td>08:50</td><td>Lunch</td></tr>
<tr><td>End</td><td>08:50</td><td>09:40</td><td>Lunch</td></tr>
<tr><td>MON</td><td>THEORY</td><td>A1-BTST101L-TH-AB1-101-ALL</td><td>F1-BTST202L-TH-AB1-102-ALL</td><td>Lunch</td></tr>
<tr><td>LAB</td><td>L1-BTST101P-LO-AB1-201-ALL</td><td>A2</td><td>Lunch</td></tr>
</table>`;

check("parseTimetableGrid parses slot/course/venue/time", () => {
  const sessions = parseTimetableGrid(GRID_HTML);
  assert.equal(sessions.length, 3);
  const a1 = sessions.find((s) => s.slot === "A1")!;
  assert.equal(a1.courseCode, "BTST101L");
  assert.equal(a1.venue, "AB1-101");
  assert.equal(a1.startTime, "08:00");
  assert.equal(a1.endTime, "08:50");
  assert.equal(a1.type, "THEORY");
  assert.equal(a1.day, "MON");
  const lab = sessions.find((s) => s.type === "LAB")!;
  assert.equal(lab.courseCode, "BTST101P");
  const sched = weeklyScheduleFromGrid(sessions);
  assert.deepEqual(sched.MON.sort(), ["BTST101L", "BTST101P", "BTST202L"]);
});

// Calendar month table: spans = [day, info, detail, ...]; day-order in detail.
const CAL_HTML = `<table class="calendar-table">
<tr><th>Sunday</th><th>Monday</th><th>Saturday</th></tr>
<tr>
  <td><span>7</span></td>
  <td><span>8</span><span>Instructional Day - General (Semester)</span><span>(Working Day)</span></td>
  <td><span>13</span><span>Instructional Day - General (Semester)</span><span>(Instructional Day / Thursday Day Order)</span></td>
</tr>
</table>`;

check("parseAcademicCalendar reads instructional + day-order", () => {
  const days = parseAcademicCalendar(CAL_HTML, "01-DEC-2025");
  const d8 = days.find((d) => d.date === "2025-12-08")!;
  assert.equal(d8.instructional, true);
  assert.equal(d8.dayOrderWeekday, null); // natural weekday, no override
  const d13 = days.find((d) => d.date === "2025-12-13")!;
  assert.equal(d13.instructional, true);
  assert.equal(d13.dayOrderWeekday, "THU"); // working Saturday following Thursday
  const d7 = days.find((d) => d.date === "2025-12-07")!;
  assert.equal(d7.instructional, false);
});

// Attendance detail / OD: main page row carries processViewAttendanceDetail(classId, slot).
const ATT_MAIN_HTML = `<table>
<thead><tr><td>Sl.No</td><td>Course Code</td><td>Course Title</td><td>Slot</td><td>View</td></tr></thead>
<tbody><tr><td>1</td><td>BTST101L</td><td>Test Course</td><td>A1+TA1</td>
  <td><a onclick="javascript:processViewAttendanceDetail('CH123','A1+TA1');">View</a></td></tr></tbody>
</table>`;

check("parseAttendanceDetailRefs extracts classId/slot/course", () => {
  const refs = parseAttendanceDetailRefs(ATT_MAIN_HTML);
  assert.equal(refs.length, 1);
  assert.deepEqual(refs[0], { courseCode: "BTST101L", courseName: "Test Course", classId: "CH123", slot: "A1+TA1" });
});

const ATT_DETAIL_HTML = `<table>
<tr><td>Sl.No</td><td>Attendance Date</td><td>Attendance Slot</td><td>Day And Timing</td><td>Attendance Status</td></tr>
<tr><td>1</td><td>01-Jan-2026</td><td>A1</td><td>MON,08:00-08:50</td><td>Present</td></tr>
<tr><td>2</td><td>03-Jan-2026</td><td>A1</td><td>WED,08:00-08:50</td><td>On Duty</td></tr>
<tr><td>3</td><td>05-Jan-2026</td><td>L1</td><td>FRI,14:00-15:40</td><td>On Duty</td></tr>
<tr><td>4</td><td>07-Jan-2026</td><td>A1</td><td>MON,08:00-08:50</td><td>Absent</td></tr>
</table>`;

check("parseAttendanceDetail counts statuses + OD hours (lab=2)", () => {
  const d = parseAttendanceDetail(ATT_DETAIL_HTML);
  assert.equal(d.present, 1);
  assert.equal(d.absent, 1);
  assert.equal(d.onDuty, 2);
  assert.equal(d.total, 4);
  assert.equal(d.odHours, 3); // 08:00-08:50 -> 1h, 14:00-15:40 -> 2h
});

console.log(`\n${passed} checks passed.`);
