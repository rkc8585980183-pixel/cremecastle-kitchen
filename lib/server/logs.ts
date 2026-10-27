import { sql } from "@/lib/db";

export async function writeLog(
  userId: string, userName: string, action: string,
  entityType: string, entityId: string, details: string
) {
  try {
    await sql`
      INSERT INTO logs (user_id, user_name, action, entity_type, entity_id, details, timestamp)
      VALUES (${userId}, ${userName}, ${action}, ${entityType}, ${entityId}, ${details}, NOW())
    `;
  } catch (e) {
    console.error("writeLog failed", e);
  }
}

export async function writeActivity(
  userName: string, role: string, departmentId: string, activityType: string, summary: string
) {
  try {
    await sql`
      INSERT INTO activity_history (user_name, role, department_id, activity_type, summary, timestamp)
      VALUES (${userName}, ${role}, ${departmentId}, ${activityType}, ${summary}, NOW())
    `;
  } catch (e) {
    console.error("writeActivity failed", e);
  }
}

export async function getActivityFeed(limit = 50) {
  const rows = await sql<{
    timestamp: string; user_name: string; role: string;
    department_id: string; activity_type: string; summary: string;
  }>`
    SELECT timestamp::text, user_name, role, department_id, activity_type, summary
    FROM activity_history
    ORDER BY timestamp DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    timestamp: r.timestamp, userName: r.user_name, role: r.role,
    departmentId: r.department_id, activityType: r.activity_type, summary: r.summary,
  }));
}

export async function getLogs(limit = 200) {
  const rows = await sql<{
    timestamp: string; user_name: string; action: string;
    entity_type: string; entity_id: string; details: string;
  }>`
    SELECT timestamp::text, user_name, action, entity_type, entity_id, details
    FROM logs
    ORDER BY timestamp DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    timestamp: r.timestamp, userName: r.user_name, action: r.action,
    entityType: r.entity_type, entityId: r.entity_id, details: r.details,
  }));
}
