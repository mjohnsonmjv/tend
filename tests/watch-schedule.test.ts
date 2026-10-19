import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatHourLabel,
  describeWeeklySchedule,
  startHourOf,
  isWatchCalendarDay,
} from "../client/src/lib/watchSchedule";

/* ---------- formatHourLabel ---------- */

test("formatHourLabel converts 24h times to 12h labels", () => {
  assert.equal(formatHourLabel("10:00"), "10:00 AM");
  assert.equal(formatHourLabel("18:00"), "6:00 PM");
  assert.equal(formatHourLabel("00:00"), "12:00 AM");
  assert.equal(formatHourLabel("12:00"), "12:00 PM");
  assert.equal(formatHourLabel("23:00"), "11:00 PM");
});

test("formatHourLabel tolerates half hours", () => {
  assert.equal(formatHourLabel("10:30"), "10:30 AM");
});

/* ---------- describeWeeklySchedule ---------- */

test("describeWeeklySchedule describes a single-day 24h window", () => {
  assert.equal(
    describeWeeklySchedule([6], "10:00"),
    "Every Saturday 10:00 AM to Sunday 10:00 AM"
  );
});

test("describeWeeklySchedule wraps the week boundary", () => {
  assert.equal(
    describeWeeklySchedule([0], "00:00"),
    "Every Sunday 12:00 AM to Monday 12:00 AM"
  );
});

test("describeWeeklySchedule describes multiple days", () => {
  assert.equal(
    describeWeeklySchedule([4, 2], "06:00"),
    "Every Tuesday, Thursday, starting 6:00 AM, 24 hours each"
  );
});

test("describeWeeklySchedule asks for a day when none picked", () => {
  assert.equal(describeWeeklySchedule([], "10:00"), "Pick at least one day");
});

/* ---------- startHourOf ---------- */

test("startHourOf reads the whole hour, defaulting to 10", () => {
  assert.equal(startHourOf("10:00"), 10);
  assert.equal(startHourOf("09:30"), 9);
  assert.equal(startHourOf(""), 10);
  assert.equal(startHourOf("nope"), 10);
});

/* ---------- isWatchCalendarDay ---------- */

// 2026-10-24 is a Saturday, 2026-10-25 a Sunday, 2026-10-26 a Monday,
// 2026-10-28 a Wednesday.
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);

test("isWatchCalendarDay covers the start day and its spillover", () => {
  assert.equal(isWatchCalendarDay(day(2026, 10, 24), [6]), true); // Saturday: window starts
  assert.equal(isWatchCalendarDay(day(2026, 10, 25), [6]), true); // Sunday: spillover second half
  assert.equal(isWatchCalendarDay(day(2026, 10, 26), [6]), false); // Monday: not covered
});

test("isWatchCalendarDay works midweek", () => {
  assert.equal(isWatchCalendarDay(day(2026, 10, 28), [3]), true); // Wednesday start
  assert.equal(isWatchCalendarDay(day(2026, 10, 26), [3]), false); // Monday: not covered
});

test("isWatchCalendarDay returns true for every day when no pattern", () => {
  assert.equal(isWatchCalendarDay(day(2026, 10, 26), null), true);
});
