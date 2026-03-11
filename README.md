# VtopMCP

MCP (Model Context Protocol) server for VIT Chennai's VTOP student portal. Enables AI agents to access student data like attendance, marks, timetable, grades, and more.

Built by reverse-engineering the [android-vtop-chennai](https://github.com/therealsujitk/android-vtop-chennai) app's communication with VTOP.

## Features

- **Authentication**: Login with VTOP credentials + CAPTCHA (returned as image for multimodal agents)
- **Semester Selection**: List available semesters and their IDs
- **Attendance**: View attendance records for all courses
- **Timetable**: View class schedule with courses, slots, venues, and faculty
- **Marks**: View internal assessment marks with component-wise breakdown
- **Exam Schedule**: View exam dates, timings, venues, and seat numbers
- **Grade History**: View CGPA and total earned credits
- **Semester Grades**: View grades for a specific semester with GPA
- **Student Profile**: View profile information

## Setup

### Prerequisites

- Node.js 18+
- npm

### Install & Build

```bash
npm install
npm run build
```

## Usage

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vtop": {
      "command": "node",
      "args": ["/absolute/path/to/VtopMCP/dist/index.js"],
      "env": {
        "VTOP_BASE_URL": "https://vtopcc.vit.ac.in/vtop"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add vtop node /absolute/path/to/VtopMCP/dist/index.js
```

## Available Tools

| Tool | Description | Inputs |
|------|-------------|--------|
| `get_captcha` | Get CAPTCHA image for login | None |
| `login` | Login with credentials + captcha | `username`, `password`, `captcha` |
| `get_semesters` | List available semesters | None |
| `get_attendance` | Get attendance records | `semesterId?` |
| `get_timetable` | Get class timetable | `semesterId?` |
| `get_marks` | Get internal marks | `semesterId?` |
| `get_exam_schedule` | Get exam schedule | `semesterId?` |
| `get_grade_history` | Get CGPA + total credits | None |
| `get_semester_grades` | Get grades for a semester | `semesterId?` |
| `get_profile` | Get student profile | None |
| `logout` | Logout and clear session | None |

## Login Flow

1. Call `get_captcha` — returns a CAPTCHA image
2. Read the CAPTCHA text (multimodal agents like Claude can do this directly)
3. Call `login` with your username, password, and captcha solution
4. Call `get_semesters` to get available semester IDs
5. Use any data tool with the semester ID to fetch student information

## Supported Campuses

| Campus | Base URL |
|--------|----------|
| VIT Chennai (default) | `https://vtopcc.vit.ac.in/vtop` |
| VIT Vellore | `https://vtop.vit.ac.in/vtop` |
| VIT-AP | `https://vtop.vitap.ac.in/vtop` |
| VIT Bhopal | `https://vtop.vitbhopal.ac.in/vtop` |

Set via `VTOP_BASE_URL` environment variable.

## VTOP Endpoints Used

Based on the [android-vtop-chennai](https://github.com/therealsujitk/android-vtop-chennai) source code:

| Feature | Method | Endpoint |
|---------|--------|----------|
| Login page | GET | `/login` |
| Submit login | POST | `/login` |
| Semesters | POST | `academics/common/StudentTimeTableChn` |
| Timetable | POST | `processViewTimeTable` |
| Attendance | POST | `processViewStudentAttendance` |
| Marks | POST | `examinations/doStudentMarkView` |
| Grade History | POST | `examinations/examGradeView/StudentGradeHistory` |
| Semester Grades | POST | `examinations/examGradeView/doStudentGradeView` |
| Exam Schedule | POST | `examinations/doSearchExamScheduleForStudent` |
| Profile | POST | `studentsRecord/StudentProfileAllView` |

## Development

```bash
npm run dev    # Watch mode - rebuilds on changes
npm run build  # Production build
npm start      # Run the server
```

## Note

The HTML parsing logic is based on the DOM selectors used in the Android app. Since VTOP's HTML can change, you may need to update the parsers in `src/services/vtop-parser.ts`. The endpoint URLs and form field names are in `src/services/vtop-client.ts`.

## License

MIT
