import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

export function isTrue(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (typeof v === "string") {
    const s = v.trim().toUpperCase();
    return s === "TRUE" || s === "1" || s === "YES" || s === "ACTIVE";
  }
  return false;
}

// =====================================================================
// DATE / TIME — everything below is IST (Asia/Kolkata), regardless of
// server or browser timezone. Two representations are used:
//   - "date key": YYYY-MM-DD — internal, sortable, used for matching/
//     grouping/locking logic. Never shown to the user.
//   - "display date": DD-MM-YY — what gets written to the sheet and
//     shown everywhere in the UI (department, admin, history, reports).
// =====================================================================

const IST_TZ = "Asia/Kolkata";

function istParts(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TZ,
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return { day: get("day"), month: get("month"), year: get("year"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

// Today's date key (YYYY-MM-DD) as of right now, in IST.
export function todayKey(): string {
  const p = istParts(new Date());
  return `${p.year}-${p.month}-${p.day}`;
}

// Normalizes ANY date-ish input (ISO yyyy-mm-dd from a <input type=date>,
// DD-MM-YY / DD-MM-YYYY display strings, legacy dd-MMM-yyyy rows already
// in the sheet from before this change, or a Date object) into a
// canonical YYYY-MM-DD key for internal comparisons.
export function toDateKey(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (Object.prototype.toString.call(v) === "[object Date]") {
    const d = v as Date;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  const s = String(v).trim();

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = s.match(/^(\d{2})-(\d{2})-(\d{2,4})$/);
  if (m) {
    let yr = m[3];
    if (yr.length === 2) yr = (Number(yr) < 70 ? "20" : "19") + yr;
    return `${yr}-${m[2]}-${m[1]}`;
  }

  const months: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
  m = s.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (m && months[m[2]]) return `${m[3]}-${months[m[2]]}-${m[1]}`;

  const d = new Date(s);
  if (!isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return "";
}

// YYYY-MM-DD -> DD-MM-YY (what gets displayed/stored going forward)
export function dateKeyToDisplay(key: string): string {
  const m = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return key;
  return `${m[3]}-${m[2]}-${m[1].slice(2)}`;
}

// Any accepted date input -> DD-MM-YY display string directly.
export function toDateStr(v: unknown): string {
  const key = toDateKey(v);
  return key ? dateKeyToDisplay(key) : str(v);
}

export function todayStr(): string {
  return dateKeyToDisplay(todayKey());
}

export function shiftDateKey(key: string, deltaDays: number): string {
  const m = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return key;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + deltaDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Back-compat wrapper: takes/returns DD-MM-YY display strings.
export function shiftDateStr(dateStr: string, deltaDays: number): string {
  const key = toDateKey(dateStr);
  if (!key) return dateStr;
  return dateKeyToDisplay(shiftDateKey(key, deltaDays));
}

// Current timestamp, IST, "DD-MM-YY HH:mm:ss" — for CreatedAt/UpdatedAt.
export function nowStamp(): string {
  const p = istParts(new Date());
  return `${p.day}-${p.month}-${p.year.slice(2)} ${p.hour}:${p.minute}:${p.second}`;
}

// How many whole days old a date key is, relative to IST "today".
// 0 = today, 1 = yesterday, 2+ = locked.
export function daysOld(dateKey: string): number {
  const today = todayKey();
  const [ty, tm, td] = today.split("-").map(Number);
  const [ky, km, kd] = dateKey.split("-").map(Number);
  const todayMs = Date.UTC(ty, tm - 1, td);
  const keyMs = Date.UTC(ky, km - 1, kd);
  return Math.round((todayMs - keyMs) / 86400000);
}
