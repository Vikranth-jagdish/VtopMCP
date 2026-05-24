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

### Fewer logins (optional session persistence)

Logging in is the slow part — VTOP requires a **captcha on every login**, which can't be skipped. The fix is to log in *rarely* by reusing one authenticated VTOP session for as long as possible. The server already reuses a live session in memory (30‑min idle window), but that's lost whenever the process restarts (a redeploy, or a free‑tier **spin‑down after ~15 min idle**), forcing a fresh captcha+login.

**VTOP session limits (measured).** A VTOP web session has two timeouts: an **idle timeout (~30 min)** that *is* reset by activity, and a hard **absolute cap of ~1 hour** that is **not** — a session dies ~60 min after login no matter how often you ping it (verified with periodic pings: alive at 50 min, dead at 60). So a single login lasts **at most ~1 hour**; the mobile app's multi‑day sessions use a mobile auth flow the web portal doesn't expose, which can't be replicated by scraping. The knobs below make logins **rare and re‑login automatic** within that limit — they can't beat the 1‑hour cap.

| Env var | Effect |
|---|---|
| `REDIS_URL` | Persist each authenticated session (cookies only, **encrypted** with `CONNECTOR_SECRET`) to Redis. After a restart/spin‑down the server rehydrates it and **skips captcha+login** — as long as VTOP still considers the session valid (within the ~1 h window). Requires `CONNECTOR_SECRET`. Works with any Redis (e.g. Upstash's free tier). **For a TLS endpoint (Upstash etc.) use the `rediss://` scheme** (double‑s), e.g. `rediss://default:<password>@<host>:6379` — `redis://` won't enable TLS and the connection will fail. The server logs whether Redis is reachable at startup. |
| `KEEPALIVE_TOKEN` | Enables a sweep at the secret path **`/keepalive/<KEEPALIVE_TOKEN>`**. Point an external cron (e.g. cron‑job.org) at that URL every ~10 min: the request **wakes a spun‑down dyno** *and* pings VTOP for **every persisted session** (resetting each idle timer) and re‑saves them. This extends a session from the ~30‑min idle limit out to VTOP's ~1‑hour cap and keeps the box warm so persistence works between visits. Requires `REDIS_URL`. Wrong/missing token → 404. |
| `SESSION_KEEPALIVE_MS` | In‑process keepalive timer (e.g. `600000` = 10 min). Only fires while the dyno is awake, so it's superseded by `KEEPALIVE_TOKEN` on a sleepy free tier. Off by default. |
| `SESSION_PERSIST_TTL_SEC` | How long a persisted blob lives before self‑expiring. Default `7200` (2 h) — the keepalive sweep refreshes it on every pass. |

**When the ~1‑hour cap is hit, re‑login is automatic** (no error, no user action): the next tool call returns `NOT_AUTHENTICATED`, and the client runs get_captcha → login → retry on its own (the proxy ensures a readable image captcha). So in practice it's a brief, occasional re‑auth roughly once an hour of active use — not "every 30 minutes," and never a dead end.

**Recommended setup:** set `REDIS_URL` + `CONNECTOR_SECRET` + `KEEPALIVE_TOKEN`, then point a cron at `https://<host>/keepalive/<KEEPALIVE_TOKEN>` every 10 min. (Don't point the cron at `/mcp` — that's the protocol endpoint and 401/400s a bare GET; `/keepalive/<token>` returns 200 JSON and doubles as the keep‑warm ping.)

What's stored is only an **encrypted session cookie** (never the password — that stays in the user's URL token), namespaced and TTL‑bounded. With no `REDIS_URL` set, behaviour is exactly as before: memory‑only, nothing persisted.

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
| `get_calendar` | `semesterId?`, `month?`, `query?`, `holidaysOnly?` | Academic calendar lookup: holidays, events (e.g. TechnoVIT), working Saturdays/day-orders. Search by name with `query`, list a month, or just holidays. |
| `calculate_gpa` | `courses?`, `semesterId?`, `currentCgpa?`, `currentCredits?`, `targetCgpa?`, `plannedCredits?` | GPA/CGPA calculator (VIT 10-point): current CGPA + percentage (CGPA×10) + per-semester GPA, GPA of a grade set, projected CGPA, and the GPA needed for a target. |
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
| `VTOP_PROXY_URL` | Optional | — | A **residential/mobile** HTTP(S) proxy, e.g. `http://user:pass@host:port`, used **only as a reCAPTCHA fallback for login**. On a datacenter/cloud IP, VTOP raises its risk score and serves an unreadable Google reCAPTCHA instead of the OCR-able image captcha; routing the *login* through a residential IP lowers the score. The server tries **direct first** (fast) and falls back to this proxy only when direct keeps hitting reCAPTCHA. **Authenticated data requests always go direct**, so they stay fast (VTOP doesn't bind sessions to the IP). Falls back to `HTTPS_PROXY` if unset. SOCKS not supported. |
| `VTOP_PROXY_ALL` | Optional | — | Set to `1` to force **all** VTOP traffic (login *and* data) through `VTOP_PROXY_URL`, skipping the direct-first attempt. Slower; only needed if direct requests are blocked entirely. |
| `VTOP_TIMEOUT_MS` | Optional | `30000` | Per-request HTTP timeout (ms). Bump it (e.g. `60000`) if you use a slow residential proxy and see timeouts on login. |
| `VTOP_INSECURE_TLS` | Optional | — | Almost never needed — VTOP omits an intermediate cert, but the server now bundles it and verifies VTOP normally. Set to `1` only as a last resort if you still hit `unable to verify the first certificate` (e.g. a TLS-inspecting proxy whose CA isn't in your OS trust store). **Disables certificate verification process-wide (including Redis) — use only on a trusted network.** |
| `KEEPALIVE_TOKEN` | Optional | — | Enables the keepalive sweep at `/keepalive/<KEEPALIVE_TOKEN>` — point a cron there every ~10 min to keep persisted sessions warm up to VTOP's ~1‑hour cap, and keep the dyno awake (see [Fewer logins](#fewer-logins-optional-session-persistence)). Requires `REDIS_URL`. Wrong/missing token → 404. |
| `STATS_TOKEN` | Optional | — | Enables a private usage dashboard at the secret path **`/stats/<STATS_TOKEN>`** (unique users by registration number, with first/last seen, fresh-login counts, and session-reuse counts). Requires `REDIS_URL`. Without it the route 404s (and any wrong token 404s), so the page is invisible to the public. Reg numbers are recorded on both fresh login and persisted-session resume as fire-and-forget writes, so request speed is unaffected. **Note:** this stores PII (registration numbers), so the landing page wording reflects that basic usage stats are kept. |

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

**`unable to verify the first certificate`** — VTOP's server omits the intermediate cert (`Sectigo RSA Domain Validation Secure Server CA`), which trips Node. The server now **bundles that intermediate and supplies it to the VTOP connection**, so VTOP verifies normally out of the box (no flags needed) while every other connection stays fully verified. It also merges your OS trust store into Node's CA list at startup (Node ≥ 22.15). Only if you're *also* behind a TLS-inspecting proxy whose CA isn't in your OS store should you set `VTOP_INSECURE_TLS: "1"` as a last resort (disables verification process-wide — trusted networks only).

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
