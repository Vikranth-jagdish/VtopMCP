# @vikranth2005/vtop-mcp

> MCP server for **VIT Chennai's** VTOP student portal — read attendance, marks, timetable, exam schedule, grades, and curriculum progress from any MCP client (Claude Desktop, Claude Code, Cursor, …).

[![npm version](https://img.shields.io/npm/v/@vikranth2005/vtop-mcp.svg)](https://www.npmjs.com/package/@vikranth2005/vtop-mcp)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> ⚠️ **Tested on VIT Chennai (`vtopcc.vit.ac.in`) only.** Other VIT campuses (Vellore, AP, Bhopal) use different VTOP deployments whose HTML/endpoints may differ — they are **unverified** and the parsers may not work there. Pointing `VTOP_BASE_URL` at another campus is experimental and unsupported until tested. Reports/PRs from other campuses welcome.

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
      "args": ["-y", "@vikranth2005/vtop-mcp"],
      "env": {
        "NODE_OPTIONS": "--use-system-ca"
      }
    }
  }
}
```

That's the minimal config. **`VTOP_USERNAME` and `VTOP_PASSWORD` are optional.** Two ways to use it:

- **Don't set them (above):** the first time you ask something VTOP-related, the assistant will ask you for your VTOP username and password in the chat, then log in. Nothing is stored on disk.
- **Set them (below):** fully hands-free — you're never asked, the assistant logs in silently with the stored values.

```json
{
  "mcpServers": {
    "vtop": {
      "command": "npx",
      "args": ["-y", "@vikranth2005/vtop-mcp"],
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

The assistant fetches a captcha, OCRs it, logs in (asking for credentials only if they aren't in the config), picks the current semester, and answers.

---

## Other clients

**Claude Code:**
```bash
claude mcp add vtop -- npx -y @vikranth2005/vtop-mcp
```

**Cursor / Windsurf / Cline / Zed** — same JSON shape as Claude Desktop, dropped into the client's MCP config file.

---

## Use as a ChatGPT connector

The clients above spawn the server locally over **stdio**. ChatGPT can't spawn a local process — it connects to a **remote MCP server over HTTPS**. The package ships a second entrypoint, `vtop-mcp-http`, that serves the exact same 17 tools over the MCP **Streamable HTTP** transport so you can add it as a custom ChatGPT connector.

> ℹ️ **This is a personal, single-user deployment.** The endpoint has no auth (anyone with the URL can reach it), so don't share it. Each MCP session still gets its own isolated login (its own cookie jar), and no data is returned without valid VTOP credentials.

### 1. Deploy it (get a public HTTPS URL)

ChatGPT needs a URL it can reach. Any host that runs the Docker image works. The repo includes a `Dockerfile` and a Render blueprint.

**Render (one-click):** New ➕ → *Blueprint* → point at this repo. Render reads [`render.yaml`](render.yaml), builds the Dockerfile, and gives you `https://<your-app>.onrender.com`. Your connector URL is that **+ `/mcp`**.

**Railway / Fly.io / Cloud Run / any Docker host:**
```bash
docker build -t vtop-mcp .
docker run -p 3000:3000 vtop-mcp        # listens on /mcp
```
Then expose it behind HTTPS. The server reads `PORT` (default `3000`) and optional `VTOP_BASE_URL`.

**Run it directly (no Docker):**
```bash
npx -y @vikranth2005/vtop-mcp vtop-mcp-http   # or: npm i -g … && vtop-mcp-http
```

Verify it's up: `GET https://<host>/` returns `{"name":"vtop-mcp","transport":"streamable-http","endpoint":"/mcp"}`.

### 2. Add it in ChatGPT

1. **Settings → Connectors** (Plus/Pro/Business/Enterprise). Enable **Developer mode** if you don't see "Create".
2. **Create / Add custom connector**, paste your **`https://<host>/mcp`** URL, authentication **None**.
3. Save. ChatGPT lists the 17 tools. In a chat, enable the connector and ask *"What's my attendance?"* — it'll call `get_captcha` → `login` → `get_attendance`.

> ⚠️ **Captcha caveat.** Login needs a CAPTCHA the model reads from an image. Claude clients OCR the image tool-result natively; whether ChatGPT feeds MCP image results to the model for OCR is **not guaranteed** and may fail or require you to set credentials. If you hit this, the fallback is to bake your own credentials in via `VTOP_USERNAME` / `VTOP_PASSWORD` env vars on the host — but because this endpoint is unauthenticated and single-tenant, **only do that on a deployment that's exclusively yours.**

> ℹ️ **Why ChatGPT can't take your password in chat.** ChatGPT's safety layer refuses to pass credentials into a tool call, so the in-chat login flow stalls on ChatGPT (it works on Claude clients). Use either single-user env vars (above) or **multi-user mode** (below).

### Multi-user mode (one connector, many users)

To let several people share **one** deployment without anyone typing a password into chat, set a `CONNECTOR_SECRET` env var (a long random string). This turns on a self-service flow where each user gets a **personal connector link**.

1. Deploy with `CONNECTOR_SECRET` set, e.g.
   ```bash
   CONNECTOR_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
   ```
   (Set it in Render → *Environment*. Don't also set `VTOP_USERNAME`/`VTOP_PASSWORD` — those force single-user mode.)
2. Each user opens **`https://<host>/register`** and enters their own VTOP credentials. They get back a personal URL: **`https://<host>/mcp/<token>`**.
3. In ChatGPT: **Settings → Connectors → Create**, paste that **`/mcp/<token>`** URL as the MCP Server URL, and choose **Authentication: No Auth**. Done — no password ever goes into chat.

ChatGPT's connector UI only offers OAuth / No Auth (no API-key field), so the token rides **in the URL path** and each user simply uses their own URL. Clients that *do* support auth headers (Claude Desktop, Cursor) can instead use the base `https://<host>/mcp` URL with `Authorization: Bearer <token>` — the `/register` page shows both.

How it works: the token is the user's credentials **encrypted** (AES-256-GCM) with `CONNECTOR_SECRET`. Nothing is stored server-side — no database needed. The server decrypts the token per request and logs that user into VTOP. Rotating `CONNECTOR_SECRET` invalidates every issued link (the only way to revoke).

> ⚠️ **Trust-the-operator model.** Whoever runs the server holds `CONNECTOR_SECRET` and can technically decrypt links (the server must know each user's password to log into VTOP). Only register on a deployment you trust. Note also that because the token is in the URL, it will appear in the host's HTTP access logs — acceptable for personal/student use, but if you need it kept out of logs, use the header form or wait for OAuth support.

---

## Available tools (17)

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
| `calculate_attendance` | `semesterId?`, `courseCode?`, `targetPercent?`, `untilDate?`, `includeUntilDate?` | Bunk calculator: per-course current %, how many classes you can still skip / must attend to stay safe (default 75%, treating 74.x as safe). With `untilDate` it projects real classes to that deadline using the timetable + academic calendar (holidays, working Saturdays). |
| `get_today_classes` | `date?` | Today's (or any date's) classes with time + venue, calendar-aware (holidays, working-Saturday day-orders). |
| `calculate_gpa` | `courses?`, `semesterId?`, `currentCgpa?`, `currentCredits?`, `targetCgpa?`, `plannedCredits?` | GPA/CGPA calculator (VIT 10-point): current CGPA + percentage (CGPA×10) + per-semester GPA, GPA of a grade set, projected CGPA, and the GPA needed for a target. |
| `predict_grades` | `semesterId?`, `assumeRemainingPercent?`, `classAverages?`, `sigma?` | Predicts this semester's grades from current marks → SGPA + projected CGPA, using VIT's real method: **absolute** for lab/soft-skill/project, **relative** for theory. Since VTOP hides the class average, theory courses use your supplied `classAverages` (the tool asks for them otherwise). |
| `calculate_od` | `semesterId?`, `courseCode?` | Totals On-Duty (OD) hours per course and for the semester against VIT's 40-hour limit. |

All per-semester tools auto-pick the current semester if `semesterId` is omitted. The server probes the timetable for the 3 most recent semesters to find one with real course data (skips Summer Term when you're not enrolled).

---

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `VTOP_USERNAME` | Optional | — | Auto-login username. **If unset, the assistant asks you for it in the chat the first time** you request VTOP data. |
| `VTOP_PASSWORD` | Optional | — | Auto-login password. **If unset, the assistant asks you for it in the chat.** Never stored on disk when entered this way. |
| `CONNECTOR_SECRET` | Optional | — | Set a long random string to enable **multi-user mode** on the HTTP connector: users self-register at `/register` and get an encrypted token. See [Multi-user mode](#multi-user-mode-one-connector-many-users). Leave unset for single-user mode. |
| `VTOP_BASE_URL` | Optional | `https://vtopcc.vit.ac.in/vtop` | Override for other VIT campuses (see below). |
| `VTOP_PROXY_URL` | Optional | — | Route VTOP traffic through an HTTP(S) proxy, e.g. `http://user:pass@host:port`. Use a **residential/mobile** proxy when hosting on a datacenter/cloud IP: VTOP raises its risk score for such IPs and serves a Google reCAPTCHA (which this server can't read) instead of the OCR-able image captcha. Falls back to the standard `HTTPS_PROXY` if unset. |
| `VTOP_INSECURE_TLS` | Optional | — | Set to `1` only if you still hit `unable to verify the first certificate` (a TLS-inspecting proxy whose CA isn't in your OS trust store). **Disables certificate verification process-wide — use only on a trusted network.** |

### Campuses

| Campus | `VTOP_BASE_URL` | Status |
|---|---|---|
| VIT Chennai (default) | `https://vtopcc.vit.ac.in/vtop` | ✅ Tested & working |
| VIT Vellore | `https://vtop.vit.ac.in/vtop` | ⚠️ Untested |
| VIT-AP | `https://vtop.vitap.ac.in/vtop` | ⚠️ Untested |
| VIT Bhopal | `https://vtop.vitbhopal.ac.in/vtop` | ⚠️ Untested |

Only VIT Chennai has been verified end-to-end. The other base URLs are provided for experimentation but the HTML parsers were written against VIT Chennai's VTOP and are likely to need adjustment for other campuses.

---

## Security

Credentials in the `env` block of `claude_desktop_config.json` are stored in plaintext on disk, in your user's `%APPDATA%`. Only your OS user can read them. They are passed to the spawned `node` child process at startup and never traverse the network except to VTOP itself — they do not go to Anthropic, npm, or anywhere else.

In **stdio mode** (Claude Desktop, Cursor, …) the server is a local process; there's no listening port, no remote endpoint. Session cookies live in memory only and are cleared when the client restarts.

In **HTTP mode** (`vtop-mcp-http`, used for the ChatGPT connector) the server listens on a port and is reachable over the network. It is unauthenticated by design (single-user deployment) — keep the URL private. Each MCP session gets its own in-memory cookie jar, so concurrent sessions never share login state, and credentials still only ever travel to VTOP.

---

## Troubleshooting

**`'vtop-mcp' is not recognized` / npx fails on Windows** — some Windows npm setups don't resolve `npx`-of-a-scoped-package cleanly. Most reliable fix: install it globally and point the config at the command directly:

```powershell
npm i -g @vikranth2005/vtop-mcp
```

```json
{
  "mcpServers": {
    "vtop": {
      "command": "vtop-mcp",
      "env": { "NODE_OPTIONS": "--use-system-ca" }
    }
  }
}
```

(`npm i -g` installs a `vtop-mcp` command shim on your PATH; Claude Desktop runs it directly, no npx involved.) macOS/Linux/WSL users can use the `npx -y @vikranth2005/vtop-mcp` form from Quick start without issue.

**`unable to verify the first certificate`** — the server now merges your OS trust store into Node's CA list automatically at startup (Node ≥ 22.15), so this should resolve on its own; on older Node you can still set `NODE_OPTIONS: "--use-system-ca"` (Node ≥ 22) in the `env` block. If you're behind a TLS-inspecting proxy whose CA isn't installed in your OS trust store, set `VTOP_INSECURE_TLS: "1"` as a last resort (disables verification — trusted networks only).

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
├── index.ts              stdio transport entry (local clients)
├── http.ts               Streamable HTTP transport entry (ChatGPT connector)
├── server.ts             registers all 17 tools
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
