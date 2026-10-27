import { v4 as uuid } from "uuid";
import { sql, cached, clearCache } from "@/lib/db";
import {
  ALL_TAB_KEYS, parsePermissions, parseBackDate, sanitizePermissions, serializeBackDate,
  type TabKey, type UsersLevel, type BackDateSetting,
} from "@/lib/permissions";

export type Role = "Admin" | "Super Admin" | "Department User";
export type Actor = { userId: string; role: Role };

export function normalizeRole(raw: unknown): Role {
  const r = String(raw ?? "").trim();
  return r === "Super Admin" ? "Super Admin" : r === "Admin" ? "Admin" : "Department User";
}
export const isAdminRole = (r: string) => r === "Admin" || r === "Super Admin";

export type Access = { role: Role; tabs: TabKey[]; users: UsersLevel; backDate: BackDateSetting };

export async function getLiveAccess(userId: string): Promise<Access | null> {
  if (!userId) return null;
  const users = await cached("users_live_access", 5_000, () =>
    sql<{ id: string; role: string; active: boolean; permissions: unknown; admin_back_date_edit_days: string }>`
      SELECT id, role, active, permissions, admin_back_date_edit_days FROM users
    `
  );
  const u = users.find((x) => x.id === userId);
  if (!u || !u.active) return null;
  const role = normalizeRole(u.role);
  if (role === "Super Admin") return { role, tabs: [...ALL_TAB_KEYS], users: "manage", backDate: { mode: "unlimited" } };
  if (role === "Admin") {
    const perms = parsePermissions(u.permissions ? JSON.stringify(u.permissions) : "");
    return { role, tabs: perms.tabs, users: perms.users, backDate: parseBackDate(u.admin_back_date_edit_days) };
  }
  return { role, tabs: [], users: "none", backDate: { mode: "default" } };
}

export async function getLiveRole(userId: string): Promise<Role | null> {
  return (await getLiveAccess(userId))?.role ?? null;
}

function assertCanTouch(actor: Actor, targetRole: Role) {
  if (actor.role !== "Super Admin" && isAdminRole(targetRole)) {
    throw new Error("Access denied: only a Super Admin can manage Admin accounts.");
  }
}

// ── Users ────────────────────────────────────────────────────────────

export async function listUsersForAdmin() {
  const rows = await sql<{
    id: string; email: string; username: string; name: string; role: string;
    department_id: string | null; active: boolean; permissions: unknown; admin_back_date_edit_days: string;
  }>`SELECT id, email, username, name, role, department_id, active, permissions, admin_back_date_edit_days FROM users ORDER BY name`;
  return rows.map((u) => ({
    userId: u.id, email: u.email, name: u.name, username: u.username,
    departmentId: u.department_id || "", role: normalizeRole(u.role) as string,
    active: u.active,
    permissions: parsePermissions(u.permissions ? JSON.stringify(u.permissions) : ""),
    backDate: parseBackDate(u.admin_back_date_edit_days),
  }));
}

export async function saveUser(
  payload: {
    email: string; name: string; departmentId: string; role: string; pin?: string; active?: boolean;
    permissions?: { tabs?: string[]; users?: string }; backDate?: BackDateSetting;
  },
  actor: Actor
) {
  const email = String(payload.email || "").trim();
  if (!email) throw new Error("Email is required.");
  const newRole = normalizeRole(payload.role);
  const username = email.split("@")[0];

  const existing = await sql<{ id: string; role: string; active: boolean }>`
    SELECT id, role, active FROM users WHERE LOWER(email) = LOWER(${email}) LIMIT 1
  `;
  const existingUser = existing[0] ?? null;

  assertCanTouch(actor, newRole);
  if (existingUser) assertCanTouch(actor, normalizeRole(existingUser.role));

  if (newRole === "Department User" && !payload.departmentId) {
    throw new Error("A department is required for a Department User.");
  }
  const departmentId = newRole === "Department User" ? payload.departmentId : null;
  const willBeActive = payload.active !== false;

  let permissionsJson = "{}";
  let adminBackDate = "";
  if (newRole === "Admin") {
    if (payload.permissions !== undefined) permissionsJson = JSON.stringify(sanitizePermissions(payload.permissions));
    if (payload.backDate !== undefined) adminBackDate = serializeBackDate(payload.backDate);
  }

  if (existingUser) {
    if (normalizeRole(existingUser.role) === "Super Admin" && existingUser.active) {
      if (newRole !== "Super Admin" || !willBeActive) {
        const others = await sql<{ id: string }>`
          SELECT id FROM users WHERE role = 'Super Admin' AND active = TRUE AND id != ${existingUser.id}
        `;
        if (!others.length) throw new Error("At least one active Super Admin must remain.");
      }
    }
    if (payload.pin) {
      await sql`
        UPDATE users SET name=${payload.name}, username=${username}, email=${email}, role=${newRole},
          department_id=${departmentId}, active=${willBeActive},
          permissions=${permissionsJson}::jsonb, admin_back_date_edit_days=${adminBackDate},
          pin=${payload.pin}, updated_at=NOW()
        WHERE id=${existingUser.id}
      `;
    } else {
      await sql`
        UPDATE users SET name=${payload.name}, username=${username}, email=${email}, role=${newRole},
          department_id=${departmentId}, active=${willBeActive},
          permissions=${permissionsJson}::jsonb, admin_back_date_edit_days=${adminBackDate},
          updated_at=NOW()
        WHERE id=${existingUser.id}
      `;
    }
    clearCache("users_");
    return { created: false, username };
  }

  if (!payload.pin) throw new Error("PIN is required for a new user.");
  const id = "USR-" + uuid().slice(0, 8);
  await sql`
    INSERT INTO users (id, email, username, name, pin, role, department_id, active, permissions, admin_back_date_edit_days, created_at, updated_at)
    VALUES (${id}, ${email}, ${username}, ${payload.name}, ${payload.pin}, ${newRole},
            ${departmentId}, TRUE, ${permissionsJson}::jsonb, ${adminBackDate}, NOW(), NOW())
  `;
  clearCache("users_");
  return { created: true, username };
}

export async function deactivateUser(idLabel: string, actor: Actor) {
  const rows = await sql<{ id: string; role: string; active: boolean }>`
    SELECT id, role, active FROM users
    WHERE LOWER(email) = LOWER(${idLabel}) OR LOWER(username) = LOWER(${idLabel})
    LIMIT 1
  `;
  if (!rows.length) throw new Error("User not found.");
  const u = rows[0];
  assertCanTouch(actor, normalizeRole(u.role));
  if (u.id === actor.userId) throw new Error("You cannot deactivate your own account.");
  if (normalizeRole(u.role) === "Super Admin") {
    const others = await sql<{ id: string }>`
      SELECT id FROM users WHERE role = 'Super Admin' AND active = TRUE AND id != ${u.id}
    `;
    if (!others.length) throw new Error("At least one active Super Admin must remain.");
  }
  await sql`UPDATE users SET active = FALSE, updated_at = NOW() WHERE id = ${u.id}`;
  clearCache("users_");
}

export async function resetUserPassword(idLabel: string, newPin: string, actor: Actor) {
  const rows = await sql<{ id: string; name: string; role: string }>`
    SELECT id, name, role FROM users
    WHERE LOWER(email) = LOWER(${idLabel}) OR LOWER(username) = LOWER(${idLabel})
    LIMIT 1
  `;
  if (!rows.length) throw new Error("User not found.");
  assertCanTouch(actor, normalizeRole(rows[0].role));
  await sql`UPDATE users SET pin = ${newPin}, updated_at = NOW() WHERE id = ${rows[0].id}`;
  clearCache("users_");
  return { name: rows[0].name };
}

// ── Departments ───────────────────────────────────────────────────────

export async function listDepartmentsForAdmin() {
  const rows = await sql<{
    id: string; name: string; display_order: number; back_date_edit_days: number; active: boolean;
  }>`SELECT id, name, display_order, back_date_edit_days, active FROM departments ORDER BY display_order, name`;
  return rows.map((d) => ({
    id: d.id, name: d.name, order: d.display_order, active: d.active,
    backDateEditDays: d.back_date_edit_days ?? 1,
  }));
}

export async function saveDepartment(payload: { id?: string; name: string; order: number; active?: boolean }) {
  if (payload.id) {
    const rows = await sql<{ id: string }>`SELECT id FROM departments WHERE id = ${payload.id}`;
    if (!rows.length) throw new Error("Department not found.");
    await sql`
      UPDATE departments SET name=${payload.name}, display_order=${payload.order},
        active=${payload.active !== false}, updated_at=NOW()
      WHERE id=${payload.id}
    `;
    clearCache("dept_");
    clearCache("departments");
    return { id: payload.id };
  }
  const id = "DEPT-" + uuid().slice(0, 6);
  await sql`
    INSERT INTO departments (id, name, display_order, back_date_edit_days, active, created_at, updated_at)
    VALUES (${id}, ${payload.name}, ${payload.order}, 1, TRUE, NOW(), NOW())
  `;
  clearCache("dept_");
  clearCache("departments");
  return { id };
}

export async function deleteDepartment(id: string) {
  const rows = await sql<{ id: string }>`SELECT id FROM departments WHERE id = ${id}`;
  if (!rows.length) throw new Error("Department not found.");
  await sql`UPDATE departments SET active = FALSE, updated_at = NOW() WHERE id = ${id}`;
  clearCache("dept_");
  clearCache("departments");
}
