#!/usr/bin/env tsx
/**
 * Offline unit tests for the pure attendance math (no network/login).
 *   npm run test:calc
 */
import assert from "node:assert/strict";
import {
  SAFE_THRESHOLD_PERCENT,
  isSafe,
  bunkBuffer,
  classesToRecover,
  percentOf,
  projectCourse,
  projectDeadline,
  listUpcomingClassDays,
  countUpcoming,
  weekdayOf,
  type WeeklySchedule,
  type CalendarDay,
} from "../src/services/attendance-calc.js";
import type { AttendanceRecord } from "../src/types/index.js";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const T = SAFE_THRESHOLD_PERCENT; // 74

// --- threshold boundary: 37/50 = 74.0% counts as safe ---
check("74.0% is safe (37/50)", () => {
  assert.equal(percentOf(37, 50), 74);
  assert.equal(isSafe(37, 50), true);
});
check("72% is not safe (36/50)", () => {
  assert.equal(isSafe(36, 50), false);
});

// --- bunkBuffer round-trip invariant: a/(n+b) >= t and a/(n+b+1) < t ---
check("bunkBuffer round-trip invariant", () => {
  const t = T / 100;
  for (const [a, n] of [[45, 50], [90, 100], [38, 50], [200, 240], [37, 50]] as const) {
    const b = bunkBuffer(a, n);
    assert.ok(a / (n + b) >= t - 1e-9, `safe at buffer for ${a}/${n} (b=${b})`);
    assert.ok(a / (n + b + 1) < t, `tight at buffer+1 for ${a}/${n} (b=${b})`);
  }
});
check("bunkBuffer is 0 when below threshold", () => {
  assert.equal(bunkBuffer(30, 50), 0);
});

// --- classesToRecover round-trip: (a+r)/(n+r) >= t and one fewer fails ---
check("classesToRecover round-trip invariant", () => {
  const t = T / 100;
  for (const [a, n] of [[30, 50], [10, 20], [70, 100]] as const) {
    const r = classesToRecover(a, n);
    assert.ok(r !== null && r >= 1, `recover positive for ${a}/${n}`);
    assert.ok((a + r!) / (n + r!) >= t - 1e-9, `safe after recover for ${a}/${n} (r=${r})`);
    assert.ok((a + r! - 1) / (n + r! - 1) < t, `still short one fewer for ${a}/${n} (r=${r})`);
  }
});
check("classesToRecover is 0 when already safe", () => {
  assert.equal(classesToRecover(45, 50), 0);
});

// --- edge cases ---
check("total === 0 -> no classes yet", () => {
  const rec: AttendanceRecord = { courseCode: "X", courseName: "X", courseType: "T", slot: "A1", attended: 0, total: 0, percentage: 0 };
  const p = projectCourse(rec);
  assert.equal(p.currentPercent, 0);
  assert.equal(p.isSafe, false);
  assert.equal(p.bunkBuffer, 0);
  assert.equal(p.classesToRecover, null);
});
check("targetPercent 100 -> recover null unless perfect", () => {
  assert.equal(classesToRecover(40, 50, 100), null);
  assert.equal(classesToRecover(50, 50, 100), 0);
  assert.equal(bunkBuffer(50, 50, 100), 0);
});

// --- date-aware projection ---
check("projectDeadline: comfortably safe can skip all upcoming", () => {
  const d = projectDeadline(45, 50, 10, "2026-06-01");
  assert.equal(d.upcomingSessions, 10);
  assert.equal(d.maxSkippableInRange, 10);
  assert.equal(d.mustAttendInRange, 0);
  assert.equal(d.canBeSafeByDeadline, true);
  assert.equal(d.ifSkipAllPercent, 75); // 45/60
});
check("projectDeadline: partial - must attend some", () => {
  const d = projectDeadline(40, 50, 10, "2026-06-01");
  assert.equal(d.maxSkippableInRange, 5);
  assert.equal(d.mustAttendInRange, 5);
  assert.equal(d.canBeSafeByDeadline, true);
});
check("projectDeadline: unreachable by deadline", () => {
  const d = projectDeadline(30, 50, 10, "2026-06-01");
  assert.equal(d.canBeSafeByDeadline, false); // 40/60 = 66.7%
  assert.equal(d.mustAttendInRange, null);
  assert.equal(d.maxSkippableInRange, 0);
});

// --- calendar walk incl. working-Saturday day-order override ---
check("listUpcomingClassDays + countUpcoming with Saturday day-order", () => {
  const schedule: WeeklySchedule = {
    SUN: [], MON: ["CSE", "MAT"], TUE: ["CSE"], WED: ["MAT"], THU: ["CSE"], FRI: [], SAT: [],
  };
  const calendar: CalendarDay[] = [
    { date: "2026-05-25", instructional: true, dayOrderWeekday: "MON" }, // a Monday
    { date: "2026-05-26", instructional: true, dayOrderWeekday: "TUE" },
    { date: "2026-05-27", instructional: false, dayOrderWeekday: null }, // holiday
    { date: "2026-05-30", instructional: true, dayOrderWeekday: "MON" }, // Saturday following MON order
  ];
  const days = listUpcomingClassDays(schedule, calendar, "2026-05-25", "2026-05-30", true);
  assert.equal(days.length, 3); // holiday excluded
  const counts = countUpcoming(days);
  assert.equal(counts["CSE"], 3); // MON, TUE, + Saturday(MON)
  assert.equal(counts["MAT"], 2); // MON + Saturday(MON)
});
check("listUpcomingClassDays respects includeTo and range", () => {
  const schedule: WeeklySchedule = { SUN: [], MON: ["A"], TUE: ["A"], WED: [], THU: [], FRI: [], SAT: [] };
  const calendar: CalendarDay[] = [
    { date: "2026-05-25", instructional: true, dayOrderWeekday: "MON" },
    { date: "2026-05-26", instructional: true, dayOrderWeekday: "TUE" },
  ];
  assert.equal(countUpcoming(listUpcomingClassDays(schedule, calendar, "2026-05-25", "2026-05-26", false))["A"], 1);
  assert.equal(countUpcoming(listUpcomingClassDays(schedule, calendar, "2026-05-25", "2026-05-26", true))["A"], 2);
});
check("weekdayOf is UTC-stable", () => {
  assert.equal(weekdayOf("2026-05-25"), "MON");
  assert.equal(weekdayOf("2026-05-30"), "SAT");
});

console.log(`\n${passed} checks passed.`);
