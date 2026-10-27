import { sql } from "@/lib/db";
import { writeLog, writeActivity } from "./logs";

async function findUserByIdentifier(identifier: string) {
  const id = identifier.trim().toLowerCase();
  const rows = await sql<{
    id: string; email: string; username: string; name: string; pin: string;
    role: string; department_id: string | null; active: boolean;
  }>`
    SELECT id, email, username, name, pin, role, department_id, active
    FROM users
    WHERE active = TRUE
      AND (LOWER(email) = ${id} OR LOWER(username) = ${id} OR LOWER(name) = ${id})
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function loginWithPin(identifier: string, pin: string) {
  if (!identifier || !pin) return { ok: false as const, error: "Please enter your username/email and PIN." };
  const user = await findUserByIdentifier(identifier);
  if (!user) return { ok: false as const, error: "User not found or inactive." };
  if (user.pin.trim() !== pin.trim()) {
    await writeLog("", identifier, "Failed Login", "User", identifier, "Incorrect PIN attempt");
    return { ok: false as const, error: "Incorrect PIN." };
  }
  try {
    await sql`UPDATE users SET last_login = NOW() WHERE id = ${user.id}`;
  } catch {}

  const rawRole = user.role.trim();
  const sessionUser = {
    userId: user.id,
    email: user.email,
    name: user.name,
    departmentId: user.department_id || "",
    role: (rawRole === "Super Admin" ? "Super Admin" : rawRole === "Admin" ? "Admin" : "Department User") as
      "Admin" | "Super Admin" | "Department User",
  };

  await writeLog(sessionUser.userId, sessionUser.name, "Login", "User", sessionUser.userId, "User logged in");
  await writeActivity(sessionUser.name, sessionUser.role, sessionUser.departmentId, "Login", `${sessionUser.name} logged in`);
  return { ok: true as const, user: sessionUser };
}

export async function recordDeviceSession(
  userId: string, userName: string, deviceId: string, deviceInfo: string
) {
  deviceId = deviceId || "unknown-device";
  deviceInfo = deviceInfo || "Unknown device";
  try {
    await sql`
      INSERT INTO device_sessions (user_id, user_name, device_id, device_info, login_time)
      VALUES (${userId}, ${userName}, ${deviceId}, ${deviceInfo}, NOW())
      ON CONFLICT (user_id, device_id)
      DO UPDATE SET device_info = EXCLUDED.device_info, login_time = NOW()
    `;
  } catch (e) {
    console.error("recordDeviceSession failed", e);
  }
}
