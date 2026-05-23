/**
 * Synthetic VTOP HTML fixtures shaped to satisfy the real parsers. Shared by
 * parser-test.ts (parser correctness) and tool-test.ts (tool behaviour via a
 * fake client). Course codes line up across fixtures (BTST101L/BTST202L/
 * BTST101P) so attendance ↔ timetable ↔ grades cross-reference cleanly.
 */

// Attendance main page: one table#getStudentDetails serving BOTH parseAttendance
// (attended/total/% by <th> headers, <td> in fixed-width rows) and
// parseAttendanceDetailRefs (the View cell's processViewAttendanceDetail onclick).
export const ATT_MAIN_HTML = `
<table id="getStudentDetails">
  <tr>
    <th>Sl.No</th><th>Course Code</th><th>Course Title</th><th>Course Type</th>
    <th>Slot</th><th>Attended Classes</th><th>Total Classes</th>
    <th>Attendance Percentage</th><th>Attendance View</th>
  </tr>
  <tr>
    <td>1</td><td>BTST101L</td><td>Database Systems</td><td>Theory Only</td>
    <td>A1+TA1</td><td>45</td><td>50</td><td>90</td>
    <td><a onclick="javascript:processViewAttendanceDetail('CH001','A1+TA1');">View</a></td>
  </tr>
  <tr>
    <td>2</td><td>BTST202L</td><td>Marketing</td><td>Theory Only</td>
    <td>F1</td><td>30</td><td>50</td><td>60</td>
    <td><a onclick="javascript:processViewAttendanceDetail('CH002','F1');">View</a></td>
  </tr>
</table>`;

// Per-class attendance detail: 1 present, 1 absent, 2 on-duty (one a 2-period
// lab → 3 OD hours total).
export const ATT_DETAIL_HTML = `
<table>
  <tr><td>Sl.No</td><td>Attendance Date</td><td>Attendance Slot</td><td>Day And Timing</td><td>Attendance Status</td></tr>
  <tr><td>1</td><td>01-Jan-2026</td><td>A1</td><td>MON,08:00-08:50</td><td>Present</td></tr>
  <tr><td>2</td><td>03-Jan-2026</td><td>A1</td><td>WED,08:00-08:50</td><td>On Duty</td></tr>
  <tr><td>3</td><td>05-Jan-2026</td><td>L1</td><td>FRI,14:00-15:40</td><td>On Duty</td></tr>
  <tr><td>4</td><td>07-Jan-2026</td><td>A1</td><td>MON,08:00-08:50</td><td>Absent</td></tr>
</table>`;

// Timetable: weekly grid (BTST101L A1 + BTST202L F1 theory, BTST101P L1 lab, all MON).
export const TIMETABLE_HTML = `<table class="w3-table-all">
<tr><td>THEORY</td><td>Start</td><td>08:00</td><td>08:55</td><td>Lunch</td></tr>
<tr><td>End</td><td>08:50</td><td>09:45</td><td>Lunch</td></tr>
<tr><td>LAB</td><td>Start</td><td>08:00</td><td>08:50</td><td>Lunch</td></tr>
<tr><td>End</td><td>08:50</td><td>09:40</td><td>Lunch</td></tr>
<tr><td>MON</td><td>THEORY</td><td>A1-BTST101L-TH-AB1-101-ALL</td><td>F1-BTST202L-TH-AB1-102-ALL</td><td>Lunch</td></tr>
<tr><td>LAB</td><td>L1-BTST101P-LO-AB1-201-ALL</td><td>A2</td><td>Lunch</td></tr>
</table>`;

// Marks: #fixedTableContainer is a <div> wrapping the table (the bug we fixed).
export const MARKS_HTML = `
<div id="fixedTableContainer"><table class="customTable">
<tr><td>Sl.No.</td><td>ClassNbr</td><td>Course Code</td><td>Course Title</td><td>Course Type</td><td>Faculty</td><td>Slot</td></tr>
<tr><td>1</td><td>CH999</td><td>BTST101L</td><td>Database Systems</td><td>Theory Only</td><td>PROF X</td><td>A1+TA1</td></tr>
<tr><td colspan="7"><table class="customTable-level1">
  <tr><td>Sl.No.</td><td>Mark Title</td><td>Max. Mark</td><td>Weightage %</td><td>Status</td><td>Scored Mark</td><td>Weightage Mark</td><td>Class Average</td></tr>
  <tr><td>1</td><td>CAT - 1</td><td>50</td><td>15</td><td>Present</td><td>40</td><td>12</td><td>30</td></tr>
</table></td></tr>
</table></div>`;

// Grade history: a CGPA summary table + per-course tr.tableContent rows.
export const GRADE_HISTORY_HTML = `
<table>
  <tr class="tableContent"><td>1</td><td>BTST101L</td><td>Database Systems</td><td>Theory Only</td><td>3</td><td>A</td><td>Nov 2025</td><td>-</td></tr>
  <tr class="tableContent"><td>2</td><td>BTST202L</td><td>Marketing</td><td>Theory Only</td><td>4</td><td>B</td><td>Nov 2025</td><td>-</td></tr>
</table>
<table>
  <tr><td>Credits Registered</td><td>Credits Earned</td><td>CGPA</td></tr>
  <tr><td>7</td><td>7</td><td>8.43</td></tr>
</table>`;

// Student profile (studentsRecord/StudentProfileAllView): a hidden regno input
// plus label/value <td> pairs that parseProfile walks.
export const PROFILE_HTML = `
<input type="hidden" name="regno" value="21BCE1234" />
<table>
  <tr><td>Student Name</td><td>Ada Lovelace</td></tr>
  <tr><td>Application Number</td><td>APP9001</td></tr>
  <tr><td>Programme</td><td>B.Tech</td></tr>
  <tr><td>Branch</td><td>Computer Science and Engineering</td></tr>
  <tr><td>School</td><td>SCOPE</td></tr>
  <tr><td>Email</td><td>ada@vitstudent.ac.in</td></tr>
  <tr><td>Mobile Number</td><td>9000000000</td></tr>
  <tr><td>Blood Group</td><td>O+ve</td></tr>
</table>`;

// One stored semester's grade view (examGradeView/doStudentGradeView): th
// headings (Course Code / Credits / Grade) + a row, ending with an SGPA cell.
export const SEMESTER_GRADES_HTML = `
<table>
  <tr><th>Sl.No</th><th>Course Code</th><th>Credits</th><th>Grade</th></tr>
  <tr><td>1</td><td>BTST101L</td><td>3</td><td>A</td></tr>
  <tr><td>2</td><td>BTST202L</td><td>4</td><td>B</td></tr>
  <tr><td colspan="4">SGPA : 8.43</td></tr>
</table>`;

// Academic-calendar month table (processViewCalendar) for parser tests.
export const CAL_HTML = `<table class="calendar-table">
<tr><th>Sunday</th><th>Monday</th><th>Saturday</th></tr>
<tr>
  <td><span>7</span></td>
  <td><span>8</span><span>Instructional Day - General (Semester)</span><span>(Working Day)</span></td>
  <td><span>13</span><span>Instructional Day - General (Semester)</span><span>(Instructional Day / Thursday Day Order)</span></td>
</tr>
</table>`;
