# VtopMCP

MCP (Model Context Protocol) server for VIT Chennai's VTOP student portal. Enables AI agents to access student data like attendance, marks, timetable, grades, and more.

## Features

- **Authentication**: Login with VTOP credentials + CAPTCHA (returned as image for multimodal agents)
- **Attendance**: View attendance records for all courses
- **Timetable**: View class schedule with venues and faculty
- **Marks**: View internal assessment marks
- **Exam Schedule**: View exam dates, timings, and seat numbers
- **Grade History**: View grades across all semesters with CGPA
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
        "VTOP_BASE_URL": "https://vtopcc.vit.ac.in"
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
| `logout` | Logout and clear session | None |
| `get_attendance` | Get attendance records | `semesterId?` |
| `get_timetable` | Get class timetable | `semesterId?` |
| `get_marks` | Get internal marks | `semesterId?` |
| `get_exam_schedule` | Get exam schedule | `semesterId?` |
| `get_grade_history` | Get grade history + CGPA | None |
| `get_profile` | Get student profile | None |

## Login Flow

1. Call `get_captcha` — returns a CAPTCHA image
2. Read the CAPTCHA text (multimodal agents can do this directly)
3. Call `login` with your username, password, and captcha solution
4. Use any data tool to fetch student information

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VTOP_BASE_URL` | `https://vtopcc.vit.ac.in` | VTOP portal base URL |

## Development

```bash
npm run dev    # Watch mode - rebuilds on changes
npm run build  # Production build
npm start      # Run the server
```

## Note

The HTML parsing logic is based on common VTOP page structures. Since VTOP's HTML can change, you may need to update the parsers in `src/services/vtop-parser.ts` if the portal's markup changes. The endpoint URLs in `src/services/vtop-client.ts` may also need adjustment based on the actual portal paths.

## License

MIT
