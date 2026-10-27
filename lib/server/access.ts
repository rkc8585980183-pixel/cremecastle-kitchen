import { sql, cached, clearCache } from "@/lib/db";
import { toDateKey, daysOld } from "@/lib/utils";
import type { BackDateSetting } from "@/lib/permissions";
import { v4 as uuid } from "uuid";

export const DEFAULT_BACK_DATE_DAYS = 1;

export async function listDepartmentBackDateLimits() {
  const rows = await cached("dept_backdate_limits", 15_000, () =>
    sql<{ id: string; name: string; active: boolean; back_date_edit_days: number }>`
      SELECT id, name, active, back_date_edit_days FROM departments ORDER BY display_order, name
    `
  );
  return rows.map((d) => ({
    departmentId: d.id,
    departmentName: d.name,
    active: d.active,
    backDateEditDays: d.back_date_edit_days ?? DEFAULT_BACK_DATE_DAYS,
  }));
}

async function getBackDateLimitMap(): Promise<Record<string, number>> {
  const rows = await listDepartmentBackDateLimits();
  const map: Record<string, number> = {};
  rows.forEach((d) => (map[d.departmentId] = d.backDateEditDays));
  return map;
}

export async function setBackDateEditDays(departmentId: string, days: number) {
  const rows = await sql<{ name: string; back_date_edit_days: number }>`
    SELECT name, back_date_edit_days FROM departments WHERE id = ${departmentId}
  `;
  if (!rows.length) throw new Error("Department not found.");
  const dept = rows[0];
  await sql`UPDATE departments SET back_date_edit_days = ${days}, updated_at = NOW() WHERE id = ${departmentId}`;
  clearCache("dept_");
  return { departmentName: dept.name, oldValue: String(dept.back_date_edit_days ?? DEFAULT_BACK_DATE_DAYS), newValue: String(days) };
}

export async function setBackDateEditDaysForAll(days: number) {
  const rows = await sql<{ id: string; name: string; back_date_edit_days: number }>`
    SELECT id, name, back_date_edit_days FROM departments
  `;
  await sql`UPDATE departments SET back_date_edit_days = ${days}, updated_at = NOW()`;
  clearCache("dept_");
  return rows.map((d) => ({
    departmentId: d.id,
    departmentName: d.name,
    oldValue: String(d.back_date_edit_days ?? DEFAULT_BACK_DATE_DAYS),
    newValue: String(days),
  }));
}

export type SpecialAccessGrant = {
  id: string; departmentId: string; departmentName: string; itemId: string;
  itemName: string; dateKey: string; grantedBy: string; grantedAt: string; active: boolean;
};

export async function listSpecialAccess(): Promise<SpecialAccessGrant[]> {
  const rows = await cached("special_access", 15_000, () =>
    sql<{
      id: string; department_id: string; dept_name: string; item_id: string; item_name: string;
      entry_date: string; granted_by: string; granted_at: string; active: boolean;
    }>`
      SELECT s.id, s.department_id, d.name AS dept_name, s.item_id, s.item_name,
             s.entry_date, s.granted_by, s.granted_at::text, s.active
      FROM special_edit_access s
      JOIN departments d ON d.id = s.department_id
      ORDER BY s.granted_at DESC
    `
  );
  return rows.map((r) => ({
    id: r.id, departmentId: r.department_id, departmentName: r.dept_name,
    itemId: r.item_id, itemName: r.item_name, dateKey: toDateKey(r.entry_date),
    grantedBy: r.granted_by, grantedAt: r.granted_at, active: r.active,
  }));
}

export async function grantSpecialAccess(payload: {
  departmentId: string; itemId: string; itemName: string; date: string; grantedBy: string;
}) {
  const dateKey = toDateKey(payload.date);
  if (!dateKey) throw new Error("A valid date is required.");
  const id = uuid();
  await sql`
    INSERT INTO special_edit_access (id, department_id, item_id, item_name, entry_date, granted_by, granted_at, active)
    VALUES (${id}, ${payload.departmentId}, ${payload.itemId}, ${payload.itemName}, ${dateKey}, ${payload.grantedBy}, NOW(), TRUE)
  `;
  clearCache("special_access");
  return { dateKey };
}

export async function revokeSpecialAccess(id: string) {
  const rows = await sql<{ item_name: string; entry_date: string }>`
    SELECT item_name, entry_date FROM special_edit_access WHERE id = ${id}
  `;
  if (!rows.length) throw new Error("Access grant not found.");
  await sql`UPDATE special_edit_access SET active = FALSE WHERE id = ${id}`;
  clearCache("special_access");
  return { itemName: rows[0].item_name, dateKey: toDateKey(rows[0].entry_date) };
}

async function hasActiveSpecialAccess(departmentId: string, itemId: string, dateKey: string): Promise<boolean> {
  const grants = await listSpecialAccess();
  return grants.some(
    (g) => g.active && g.departmentId === departmentId && g.dateKey === dateKey &&
      (g.itemId === itemId || g.itemId === "")
  );
}

const ADMIN_BACKDATE_KEY = "AdminBackDateEditDays";

export async function getAdminBackDateEditDays(): Promise<number | null> {
  const rows = await sql<{ value: string }>`SELECT value FROM admin_settings WHERE key = ${ADMIN_BACKDATE_KEY}`;
  if (!rows.length) return null;
  const v = Number(rows[0].value);
  return !isNaN(v) && v >= 0 ? v : null;
}

export async function setAdminBackDateEditDays(days: number | null) {
  const rows = await sql<{ value: string }>`SELECT value FROM admin_settings WHERE key = ${ADMIN_BACKDATE_KEY}`;
  const oldValue = rows.length ? rows[0].value || "(unlimited)" : "(unlimited)";
  const newValue = days === null ? "" : String(days);
  if (rows.length) {
    await sql`UPDATE admin_settings SET value = ${newValue} WHERE key = ${ADMIN_BACKDATE_KEY}`;
  } else {
    await sql`INSERT INTO admin_settings (key, value) VALUES (${ADMIN_BACKDATE_KEY}, ${newValue})`;
  }
  return { oldValue, newValue: newValue || "(unlimited)" };
}

export async function getEffectiveAdminLimit(backDate: BackDateSetting): Promise<number | null> {
  if (backDate.mode === "unlimited") return null;
  if (backDate.mode === "custom") return backDate.days ?? 0;
  return getAdminBackDateEditDays();
}

export async function isAdminEditAllowed(dateKey: string, backDate: BackDateSetting = { mode: "default" }): Promise<boolean> {
  const age = daysOld(dateKey);
  if (age < 0) return false;
  const limit = await getEffectiveAdminLimit(backDate);
  if (limit === null) return true;
  return age <= limit;
}

export async function isEditAllowed(departmentId: string, itemId: string, dateKey: string): Promise<boolean> {
  const age = daysOld(dateKey);
  if (age < 0) return false;
  const limits = await getBackDateLimitMap();
  const limit = limits[departmentId] ?? DEFAULT_BACK_DATE_DAYS;
  if (age <= limit) return true;
  return hasActiveSpecialAccess(departmentId, itemId, dateKey);
}
