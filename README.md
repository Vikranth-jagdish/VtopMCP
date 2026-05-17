# vtop-mcp

> MCP server for VIT's VTOP student portal — read attendance, marks, timetable, exam schedule, grades, and curriculum progress from any MCP client (Claude Desktop, Claude Code, Cursor, …).

[![npm version](https://img.shields.io/npm/v/vtop-mcp.svg)](https://www.npmjs.com/package/vtop-mcp)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Built by reverse-engineering the [android-vtop-chennai](https://github.com/therealsujitk/android-vtop-chennai) app's communication with VTOP. Talks to the live portal with cookies + CSRF + authorizedID, exactly like a browser would.

<!-- mcp-name: io.github.Vikranth-jagdish/vtop-mcp -->

---

## Quick start (Claude Desktop)

Add this block to `claude_desktop_config.json` (Windows: `%APPDATA%\Claude\claude_desktop_config.json`; macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "vtop": {
      "command": "npx",
      "args": ["-y", "vtop-mcp"],
      "env": {
        "NODE_OPTIONS": "--use-system-ca",
        "VTOP_USERNAME": "your-vtop-username",
        "VTOP_PASSWORD": "your-vtop-password"
      }
    }
  }
}
```

Fully quit Claude Desktop (tray → Quit) and reopen. Then in a new chat, just say:

> *"What's my attendance?"*

The model will auto-fetch a captcha, OCR it, log in with your stored credentials, pick the current semester, and answer — without asking you anything.

---

## Other clients

**Claude Code:**
```bash
claude mcp add vtop -- npx -y vtop-mcp
```

**Cursor / Windsurf / Cline / Zed** — same JSON shape as Claude Desktop, dropped into the client's MCP config file.

---

## Available tools (12)

| Tool | Args | Returns |
|---|---|---|
| `get_captcha` | — | Captcha image (the model OCRs it) |
| `login` | `captcha`, `username?`, `password?` | Login result. User/pass optional when env vars are set. |
| `logout` | — | Clears the session |
| `get_semesters` | — | `[{id, name}]` of all available semesters |
| `get_profile` | — | Name, regNo, program, branch, school, email, phone, blood group |
| `get_attendance` | `semesterId?` | Per-course attended/total/percentage |
| `get_timetable` | `semesterId?` | Courses, slots, venues, faculty, credits |
| `get_marks` | `semesterId?` | Internal assessment components + weightages |
| `get_exam_schedule` | `semesterId?` | CAT-1 / CAT-2 / FAT dates, venues, seat numbers |
| `get_semester_grades` | `semesterId?` | Course-wise grades + GPA |
| `get_grade_history` | — | CGPA, total credits, per-semester GPA + courses |
| `get_curriculum_progress` | — | Credits earned vs required, per-category, per-basket, grade-letter counts |

All per-semester tools auto-pick the current semester if `semesterId` is omitted. The server probes the timetable for the 3 most recent semesters to find one with real course data (skips Summer Term when you're not enrolled).

---

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `VTOP_USERNAME` | Recommended | — | Auto-login username. If unset, the model will ask for it the first time. |
| `VTOP_PASSWORD` | Recommended | — | Auto-login password. If unset, the model will ask. |
| `NODE_OPTIONS` | Recommended on Windows | — | Set to `--use-system-ca` so Node trusts VIT's TLS chain via the OS store. Without this you'll see `unable to verify the first certificate`. |
| `VTOP_BASE_URL` | Optional | `https://vtopcc.vit.ac.in/vtop` | Override for other VIT campuses (see below). |

### Supported campuses

| Campus | `VTOP_BASE_URL` |
|---|---|
| VIT Chennai (default) | `https://vtopcc.vit.ac.in/vtop` |
| VIT Vellore | `https://vtop.vit.ac.in/vtop` |
| VIT-AP | `https://vtop.vitap.ac.in/vtop` |
| VIT Bhopal | `https://vtop.vitbhopal.ac.in/vtop` |

---

## Security

Credentials in the `env` block of `claude_desktop_config.json` are stored in plaintext on disk, in your user's `%APPDATA%`. Only your OS user can read them. They are passed to the spawned `node` child process at startup and never traverse the network except to VTOP itself — they do not go to Anthropic, npm, or anywhere else.

The MCP server is a local stdio process; there's no listening port, no remote endpoint. Session cookies live in memory only and are cleared when Claude Desktop restarts.

---

## Troubleshooting

**`unable to verify the first certificate`** — set `NODE_OPTIONS: "--use-system-ca"` in the `env` block. Node ≥ 22 needs the explicit flag to trust the OS CA store on Windows.

**"It seems there are no attendance records"** — almost always a stale spawned MCP process. Quit Claude Desktop fully (tray → Quit, not just the X), then reopen.

**Login keeps failing** — likely captcha misread. The model fetches a fresh one and retries automatically (up to 3 tries). After that, check the credentials in your `env` block.

**Empty results when classes are running** — VTOP HTML occasionally changes. Open an issue with a sanitized HTML snippet from the affected endpoint.

---

## Development

```bash
git clone https://github.com/Vikranth-jagdish/VtopMCP
cd VtopMCP
npm install
npm run build
npm run test:mcp          # spawns dist/index.js, checks the wire protocol
npm run test:e2e          # interactive: solves a captcha and exercises every tool
```

Local `claude_desktop_config.json` for dev: point `command` at `node` and `args` at the absolute path to your `dist/index.js` instead of `npx`.

### Project layout

```
src/
├── index.ts              stdio transport entry
├── server.ts             registers all 12 tools
├── services/
│   ├── vtop-client.ts    HTTP client, cookie jar, login flow, semester probe
│   ├── vtop-parser.ts    cheerio HTML → JSON parsers
│   └── constants.ts      endpoints, error strings, grade letters
├── tools/                one file per tool group
└── schemas/index.ts      Zod input schemas
```

---

## How it works (high level)

1. **Login is a 3-step dance.** `/vtop/login` is a portal selector page (Student/Employee/Parent/Alumni) with no captcha. POSTing to `/prelogin/setup?flag=VTOP` (after grabbing the CSRF token) returns the actual student login page, which embeds a base64 captcha. We POST credentials + captcha back to `/login`; a hidden `<input id="authorizedIDX">` in the response is the session token used for every subsequent request.
2. **All data tools POST** to endpoints like `processViewStudentAttendance` with `authorizedID`, `_csrf`, and `semesterSubId`. Responses are HTML; cheerio extracts the relevant tables.
3. **Auto-semester selection** probes the timetable for the three most recent terms and picks the first with real course rows — so it handles students not enrolled in Summer Term.

---

## License

MIT — see [LICENSE](LICENSE).

The HTML parsing logic is adapted from the [android-vtop-chennai](https://github.com/therealsujitk/android-vtop-chennai) source under its respective license. This project is not affiliated with VIT.
