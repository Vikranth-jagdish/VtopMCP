#!/usr/bin/env tsx
/**
 * VtopMCP local end-to-end test harness.
 *
 * Runs through the full tool surface against the real VTOP portal using a
 * single shared VtopClient. Imports VtopClient + parsers directly (bypasses
 * the MCP stdio layer) so failures attribute cleanly to client/parser bugs.
 *
 * Requires: a `.env` with VTOP_USERNAME + VTOP_PASSWORD, and a VIT-reachable
 * network. Captcha is solved interactively.
 *
 * Set VTOP_DUMP_HTML=1 to also capture raw HTML responses for fixture seeding.
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { VtopClient } from "../src/services/vtop-client.js";
import {
  parseAttendance,
  parseTimetable,
  parseMarks,
  parseExamSchedule,
  parseGradeHistory,
  parseSemesterGrades,
  parseProfile,
} from "../src/services/vtop-parser.js";

type Status = "PASS" | "WARN" | "FAIL";
type Result = {
  tool: string;
  status: Status;
  durationMs: number;
  bytes: number;
  rows: number | string;
  note?: string;
};

const rl = readline.createInterface({ input: stdin, output: stdout });

async function prompt(q: string): Promise<string> {
  return (await rl.question(q)).trim();
}

async function promptPassword(q: string): Promise<string> {
  stdout.write(q);
  return new Promise((resolve) => {
    const wasRaw = stdin.isRaw;
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let buf = "";
    const CTRL_C = 0x03;
    const CTRL_D = 0x04;
    const BACKSPACE = 0x7f;
    const BS = 0x08;
    const CR = 0x0d;
    const LF = 0x0a;
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        const code = ch.charCodeAt(0);
        if (code === CR || code === LF || code === CTRL_D) {
          stdin.setRawMode?.(wasRaw ?? false);
          stdin.removeListener("data", onData);
          stdin.pause();
          stdout.write("\n");
          resolve(buf);
          return;
        }
        if (code === CTRL_C) {
          stdin.setRawMode?.(wasRaw ?? false);
          stdout.write("\n");
          process.exit(130);
        }
        if (code === BACKSPACE || code === BS) {
          buf = buf.slice(0, -1);
        } else if (code >= 0x20) {
          buf += ch;
        }
      }
    };
    stdin.on("data", onData);
  });
}

function openInDefaultViewer(file: string): void {
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", file], { detached: true, stdio: "ignore" }).unref();
  } else if (process.platform === "darwin") {
    spawn("open", [file], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("xdg-open", [file], { detached: true, stdio: "ignore" }).unref();
  }
}

async function saveCaptcha(dataUrl: string, dir: string): Promise<string> {
  const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!match) throw new Error("Captcha is not a data URL");
  const [, ext, b64] = match;
  const file = path.join(dir, `captcha.${ext}`);
  await writeFile(file, Buffer.from(b64, "base64"));
  return file;
}

async function captureCaptchaAndLogin(
  client: VtopClient,
  username: string,
  password: string,
  outDir: string
): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.error(`\n[auth] attempt ${attempt}/3: fetching captcha...`);
    const dataUrl = await client.getCaptcha();
    const file = await saveCaptcha(dataUrl, outDir);
    console.error(`[auth] captcha saved to ${file} (opening in default viewer)`);
    openInDefaultViewer(file);
    const captcha = await prompt("captcha text: ");

    console.error("[auth] logging in...");
    const res = await client.login(username, password, captcha);
    if (res.success) {
      console.error("[auth] login OK");
      return;
    }
    console.error(`[auth] failed: ${res.message}`);
    if (!/captcha/i.test(res.message)) {
      throw new Error(`Login failed: ${res.message}`);
    }
  }
  throw new Error("Login failed after 3 captcha attempts");
}

type Step = {
  name: string;
  run: () => Promise<{ rows: number | string; bytes: number; data: unknown; warnIfEmpty?: boolean }>;
  passCheck?: (data: unknown) => boolean;
};

function makeSteps(client: VtopClient, semesterId: string): Step[] {
  const semPayload: Record<string, string> = semesterId ? { semesterSubId: semesterId } : {};
  return [
    {
      name: "get_profile",
      run: async () => {
        const html = await client.fetchPage("studentsRecord/StudentProfileAllView", {
          verifyMenu: "true",
          nocache: String(Date.now()),
        });
        const data = parseProfile(html);
        return { rows: 1, bytes: html.length, data };
      },
      passCheck: (d: any) => !!d?.name && !!d?.registrationNumber,
    },
    {
      name: "get_attendance",
      run: async () => {
        const html = await client.fetchPage("processViewStudentAttendance", semPayload);
        const data = parseAttendance(html);
        return { rows: data.length, bytes: html.length, data };
      },
      passCheck: (d: any) =>
        Array.isArray(d) &&
        d.length > 0 &&
        typeof d[0].courseCode === "string" &&
        Number.isFinite(d[0].percentage),
    },
    {
      name: "get_timetable",
      run: async () => {
        const html = await client.fetchPage("processViewTimeTable", semPayload);
        const data = parseTimetable(html);
        return { rows: data.length, bytes: html.length, data };
      },
      passCheck: (d: any) =>
        Array.isArray(d) && d.length > 0 && typeof d[0].courseCode === "string",
    },
    {
      name: "get_marks",
      run: async () => {
        const html = await client.fetchPage("examinations/doStudentMarkView", semPayload);
        const data = parseMarks(html);
        return { rows: data.length, bytes: html.length, data, warnIfEmpty: true };
      },
      passCheck: (d: any) => Array.isArray(d) && d.length > 0,
    },
    {
      name: "get_exam_schedule",
      run: async () => {
        const html = await client.fetchPage(
          "examinations/doSearchExamScheduleForStudent",
          semPayload
        );
        const data = parseExamSchedule(html);
        return { rows: data.length, bytes: html.length, data, warnIfEmpty: true };
      },
      passCheck: (d: any) => Array.isArray(d) && d.length > 0,
    },
    {
      name: "get_semester_grades",
      run: async () => {
        const html = await client.fetchPage(
          "examinations/examGradeView/doStudentGradeView",
          semPayload
        );
        const data = parseSemesterGrades(html);
        return {
          rows: data.grades?.length ?? 0,
          bytes: html.length,
          data,
          warnIfEmpty: true,
        };
      },
      passCheck: (d: any) => Array.isArray(d?.grades) && d.grades.length > 0,
    },
    {
      name: "get_grade_history",
      run: async () => {
        const html = await client.fetchPage("examinations/examGradeView/StudentGradeHistory", {
          verifyMenu: "true",
          nocache: String(Date.now()),
        });
        const data = parseGradeHistory(html);
        return {
          rows: data.semesters?.length ?? 0,
          bytes: html.length,
          data,
        };
      },
      passCheck: (d: any) =>
        Number.isFinite(d?.cgpa) && Array.isArray(d?.semesters) && d.semesters.length > 0,
    },
  ];
}

function fmtRow(r: Result): string {
  const status = r.status.padEnd(4);
  const dur = `${r.durationMs}ms`.padStart(7);
  const bytes = `${r.bytes}b`.padStart(8);
  const rows = String(r.rows).padStart(4);
  const note = r.note ? `  ${r.note}` : "";
  return `  ${status}  ${r.tool.padEnd(22)} ${dur}  ${bytes}  rows=${rows}${note}`;
}

async function main() {
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.resolve(process.cwd(), "test-output", runId);
  await mkdir(outDir, { recursive: true });
  console.error(`[harness] run-id: ${runId}`);
  console.error(`[harness] output: ${outDir}`);

  if (process.env.VTOP_DUMP_HTML) {
    process.env.VTOP_DUMP_DIR = outDir;
    console.error("[harness] VTOP_DUMP_HTML=1 — raw HTML will be captured");
  }

  const username = process.env.VTOP_USERNAME || (await prompt("VTOP username: "));
  const password = process.env.VTOP_PASSWORD || (await promptPassword("VTOP password: "));
  if (!username || !password) throw new Error("Missing credentials");

  const client = new VtopClient();
  await captureCaptchaAndLogin(client, username, password, outDir);

  console.error("\n[harness] fetching semesters...");
  const semesters = await client.getSemesters();
  await writeFile(path.join(outDir, "semesters.json"), JSON.stringify(semesters, null, 2));
  console.error(`[harness] ${semesters.length} semesters found`);

  let semesterId = process.env.VTOP_SEMESTER_ID || "";
  if (!semesterId) {
    semesters.slice(0, 15).forEach((s, i) => {
      console.error(`  [${i}] ${s.name}  (id=${s.id})`);
    });
    const idx = await prompt("pick semester index (default 0): ");
    const picked = semesters[Number(idx) || 0];
    if (!picked) throw new Error("Invalid semester index");
    semesterId = picked.id;
  }
  console.error(`[harness] using semesterId=${semesterId}\n`);

  const results: Result[] = [];
  const steps = makeSteps(client, semesterId);

  for (const step of steps) {
    const t0 = Date.now();
    let status: Status = "PASS";
    let rows: number | string = 0;
    let bytes = 0;
    let note: string | undefined;
    try {
      const out = await step.run();
      rows = out.rows;
      bytes = out.bytes;
      await writeFile(
        path.join(outDir, `${step.name}.json`),
        JSON.stringify(out.data, null, 2)
      );
      const empty =
        (Array.isArray(out.data) && out.data.length === 0) || out.rows === 0;
      const passed = step.passCheck ? step.passCheck(out.data) : !empty;
      if (passed) {
        status = "PASS";
      } else if (empty && out.warnIfEmpty) {
        status = "WARN";
        note = "empty result (may be legit — check JSON)";
      } else {
        status = "FAIL";
        note = "shape mismatch or empty when data expected";
      }
    } catch (err: unknown) {
      status = "FAIL";
      const msg = err instanceof Error ? err.message : String(err);
      note = `exception: ${msg}`;
      await writeFile(
        path.join(outDir, `${step.name}.error.txt`),
        err instanceof Error ? (err.stack ?? err.message) : String(err)
      );
    }
    const durationMs = Date.now() - t0;
    const r: Result = { tool: step.name, status, durationMs, bytes, rows, note };
    results.push(r);
    console.error(fmtRow(r));
  }

  // logout
  const t0 = Date.now();
  let logoutStatus: Status = "PASS";
  let logoutNote: string | undefined;
  try {
    await client.logout();
  } catch (err: unknown) {
    logoutStatus = "FAIL";
    logoutNote = err instanceof Error ? err.message : String(err);
  }
  const logoutR: Result = {
    tool: "logout",
    status: logoutStatus,
    durationMs: Date.now() - t0,
    bytes: 0,
    rows: "-",
    note: logoutNote,
  };
  results.push(logoutR);
  console.error(fmtRow(logoutR));

  // summary
  console.error("\n[harness] summary:");
  const counts = results.reduce(
    (a, r) => {
      a[r.status]++;
      return a;
    },
    { PASS: 0, WARN: 0, FAIL: 0 } as Record<Status, number>
  );
  console.error(
    `  ${counts.PASS} PASS, ${counts.WARN} WARN, ${counts.FAIL} FAIL  (${results.length} total)`
  );
  console.error(`  artifacts: ${outDir}`);

  await writeFile(
    path.join(outDir, "summary.json"),
    JSON.stringify({ runId, semesterId, results, counts }, null, 2)
  );

  rl.close();
  process.exit(counts.FAIL > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\n[harness] fatal:", err instanceof Error ? err.message : err);
  rl.close();
  process.exit(2);
});
