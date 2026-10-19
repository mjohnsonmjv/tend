// Weekly prayer-watch schedule helpers (pure functions, no React).
// A weekly watch stores the weekdays a 24h window STARTS on (0 = Sunday)
// plus a whole-hour start time. Each window runs 24 hours from the start
// time, spilling into the next calendar day automatically.

export const WEEKDAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "10:00" -> "10:00 AM", "18:00" -> "6:00 PM". Tolerates half hours. */
export function formatHourLabel(hhmm: string): string {
  const [hRaw, mRaw] = hhmm.split(":");
  let h = parseInt(hRaw, 10);
  const m = parseInt(mRaw || "0", 10);
  if (Number.isNaN(h)) return hhmm;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  const mm = Number.isNaN(m) || m === 0 ? "00" : String(m).padStart(2, "0");
  return `${h}:${mm} ${ampm}`;
}

/**
 * Human description of a weekly schedule.
 * [6], "10:00" -> "Every Saturday 10:00 AM to Sunday 10:00 AM"
 * [2, 4], "06:00" -> "Every Tuesday, Thursday, starting 6:00 AM, 24 hours each"
 */
export function describeWeeklySchedule(weekdays: number[], startTime: string): string {
  const days = weekdays
    .filter((d, i) => d >= 0 && d <= 6 && weekdays.indexOf(d) === i)
    .sort((a, b) => a - b);
  if (days.length === 0) return "Pick at least one day";
  const t = formatHourLabel(startTime);
  if (days.length === 1) {
    const next = WEEKDAY_NAMES[(days[0] + 1) % 7];
    return `Every ${WEEKDAY_NAMES[days[0]]} ${t} to ${next} ${t}`;
  }
  return `Every ${days.map((d) => WEEKDAY_NAMES[d]).join(", ")}, starting ${t}, 24 hours each`;
}

/** Whole start hour (0-23) from an "HH:MM" time input value. */
export function startHourOf(hhmm: string): number {
  const h = parseInt(hhmm.split(":")[0], 10);
  if (Number.isNaN(h) || h < 0 || h > 23) return 10;
  return h;
}

/**
 * Is this calendar date part of a weekly watch: either a window starts
 * that day, or it is the spillover second half of yesterday's window.
 * A null pattern means a date-range watch: every day counts.
 */
export function isWatchCalendarDay(date: Date, activeWeekdays: number[] | null): boolean {
  if (!activeWeekdays) return true;
  const dow = date.getDay();
  const prev = (dow + 6) % 7;
  return activeWeekdays.includes(dow) || activeWeekdays.includes(prev);
}
