import { v4 as uuid } from "uuid";
import { sql, clearCache } from "@/lib/db";

// ── Categories ───────────────────────────────────────────────────────

export async function listCategories() {
  const rows = await sql<{
    id: string; department_id: string; name: string; display_order: number; active: boolean;
  }>`SELECT id, department_id, name, display_order, active FROM categories ORDER BY display_order, name`;
  return rows.map((c) => ({
    id: c.id, deptId: c.department_id, name: c.name, order: c.display_order, active: c.active,
  }));
}

export async function saveCategory(payload: {
  id?: string; departmentId: string; name: string; order: number; active: boolean;
}) {
  if (payload.id) {
    await sql`
      UPDATE categories SET department_id = ${payload.departmentId}, name = ${payload.name},
        display_order = ${payload.order}, active = ${payload.active}, updated_at = NOW()
      WHERE id = ${payload.id}
    `;
  } else {
    const id = "CAT-" + uuid().slice(0, 6);
    await sql`
      INSERT INTO categories (id, department_id, name, display_order, active, created_at, updated_at)
      VALUES (${id}, ${payload.departmentId}, ${payload.name}, ${payload.order}, ${payload.active}, NOW(), NOW())
    `;
  }
  clearCache("categories");
}

export async function deleteCategory(id: string) {
  await sql`UPDATE categories SET active = FALSE, updated_at = NOW() WHERE id = ${id}`;
  clearCache("categories");
}

// ── Items ────────────────────────────────────────────────────────────

export async function listItems() {
  const rows = await sql<{
    id: string; department_id: string; category_id: string; name: string;
    unit: string; display_order: number; remarks: string; active: boolean;
  }>`SELECT id, department_id, category_id, name, unit, display_order, remarks, active FROM items ORDER BY display_order, name`;
  return rows.map((i) => ({
    id: i.id, deptId: i.department_id, catId: i.category_id, name: i.name,
    unit: i.unit, order: i.display_order, remarks: i.remarks || "", active: i.active,
  }));
}

export async function saveItem(payload: {
  id?: string; departmentId: string; categoryId: string; name: string; unit: string; order: number; remarks?: string;
}) {
  if (payload.id) {
    await sql`
      UPDATE items SET department_id = ${payload.departmentId}, category_id = ${payload.categoryId},
        name = ${payload.name}, unit = ${payload.unit}, display_order = ${payload.order},
        remarks = ${payload.remarks || ""}, updated_at = NOW()
      WHERE id = ${payload.id}
    `;
  } else {
    const id = "ITEM-" + uuid().slice(0, 8);
    await sql`
      INSERT INTO items (id, department_id, category_id, name, unit, display_order, remarks, active, created_at, updated_at)
      VALUES (${id}, ${payload.departmentId}, ${payload.categoryId}, ${payload.name}, ${payload.unit},
              ${payload.order}, ${payload.remarks || ""}, TRUE, NOW(), NOW())
    `;
  }
  clearCache("items");
}

export async function deleteItem(id: string) {
  await sql`UPDATE items SET active = FALSE, updated_at = NOW() WHERE id = ${id}`;
  clearCache("items");
}

// ── Sections ─────────────────────────────────────────────────────────

export async function listSections() {
  const rows = await sql<{
    id: string; name: string; display_order: number; department_scope: string;
    movement_sign: string; include_in_reconciliation: boolean; active: boolean;
  }>`SELECT id, name, display_order, department_scope, movement_sign, include_in_reconciliation, active FROM sections ORDER BY display_order, name`;
  return rows.map((s) => ({
    id: s.id, name: s.name, order: s.display_order, active: s.active,
    departmentScope: s.department_scope || "",
    movementSign: (s.movement_sign?.toUpperCase() === "MINUS" ? "MINUS" : "PLUS") as "PLUS" | "MINUS",
    includeInReconciliation: !!s.include_in_reconciliation,
  }));
}

export async function saveSection(payload: {
  id?: string; name: string; order: number; active: boolean; departmentScope: string;
  movementSign?: "PLUS" | "MINUS"; includeInReconciliation?: boolean;
}) {
  const sign = payload.movementSign === "MINUS" ? "MINUS" : "PLUS";
  const include = !!payload.includeInReconciliation;
  if (payload.id) {
    await sql`
      UPDATE sections SET name = ${payload.name}, display_order = ${payload.order},
        active = ${payload.active}, department_scope = ${payload.departmentScope},
        movement_sign = ${sign}, include_in_reconciliation = ${include}, updated_at = NOW()
      WHERE id = ${payload.id}
    `;
  } else {
    const id = "SEC-" + uuid().slice(0, 6);
    await sql`
      INSERT INTO sections (id, name, display_order, department_scope, movement_sign, include_in_reconciliation, active, created_at, updated_at)
      VALUES (${id}, ${payload.name}, ${payload.order}, ${payload.departmentScope}, ${sign}, ${include}, ${payload.active}, NOW(), NOW())
    `;
  }
  clearCache("sections");
}

export async function deleteSection(id: string) {
  await sql`UPDATE sections SET active = FALSE, updated_at = NOW() WHERE id = ${id}`;
  clearCache("sections");
}

export async function saveDeptSectionOverride(
  departmentId: string, sectionId: string, active: boolean, customName: string
) {
  await sql`
    INSERT INTO dept_section_overrides (department_id, section_id, active, custom_name)
    VALUES (${departmentId}, ${sectionId}, ${active}, ${customName})
    ON CONFLICT (department_id, section_id)
    DO UPDATE SET active = EXCLUDED.active, custom_name = EXCLUDED.custom_name
  `;
}

// ── Device Sessions ───────────────────────────────────────────────────

export async function listDeviceSessions() {
  const rows = await sql<{
    user_id: string; user_name: string; device_id: string; device_info: string; login_time: string;
  }>`SELECT user_id, user_name, device_id, device_info, login_time::text FROM device_sessions ORDER BY login_time DESC`;
  return rows.map((r) => ({
    userId: r.user_id, userName: r.user_name, deviceId: r.device_id,
    deviceInfo: r.device_info, loginTime: r.login_time,
  }));
}

export async function removeDeviceSession(userId: string, deviceId: string) {
  const result = await sql<{ id: string }>`
    DELETE FROM device_sessions WHERE user_id = ${userId} AND device_id = ${deviceId} RETURNING id
  `;
  return result.length > 0;
}

export function clearAllCache() {
  clearCache();
}

// ── Bulk Import Items ─────────────────────────────────────────────────

export async function bulkImportItems(
  rows: { department: string; category: string; itemName: string; unit: string; remarks?: string }[]
) {
  const deptRows = await sql<{ id: string; name: string }>`SELECT id, name FROM departments WHERE active = TRUE`;
  const deptByName: Record<string, string> = {};
  deptRows.forEach((d) => { deptByName[d.name.trim().toLowerCase()] = d.id; });

  const catRows = await sql<{ id: string; department_id: string; name: string }>`
    SELECT id, department_id, name FROM categories WHERE active = TRUE
  `;
  const catByKey: Record<string, string> = {};
  catRows.forEach((c) => { catByKey[`${c.department_id}||${c.name.trim().toLowerCase()}`] = c.id; });

  const existingItems = await sql<{ department_id: string; name: string }>`SELECT department_id, name FROM items`;
  const existingItemKeys = new Set(existingItems.map((i) => `${i.department_id}||${i.name.trim().toLowerCase()}`));

  let skipped = 0;
  const errors: string[] = [];
  const newCategories: { id: string; deptId: string; name: string }[] = [];
  const itemsToCreate: { deptId: string; catKey: string; itemName: string; unit: string; remarks: string }[] = [];

  for (const row of rows) {
    const deptName = String(row.department || "").trim();
    const catName = String(row.category || "").trim();
    const itemName = String(row.itemName || "").trim();
    if (!deptName || !catName || !itemName) { skipped++; errors.push(`Missing fields: ${JSON.stringify(row)}`); continue; }
    const deptId = deptByName[deptName.toLowerCase()];
    if (!deptId) { skipped++; errors.push(`Unknown department "${deptName}" for item "${itemName}"`); continue; }
    const dupKey = `${deptId}||${itemName.toLowerCase()}`;
    if (existingItemKeys.has(dupKey)) { skipped++; errors.push(`Item "${itemName}" already exists in "${deptName}" — skipped`); continue; }
    const catKey = `${deptId}||${catName.toLowerCase()}`;
    if (!catByKey[catKey] && !newCategories.find((c) => c.deptId === deptId && c.name.toLowerCase() === catName.toLowerCase())) {
      const catId = "CAT-" + uuid().slice(0, 6);
      catByKey[catKey] = catId;
      newCategories.push({ id: catId, deptId, name: catName });
    }
    existingItemKeys.add(dupKey);
    itemsToCreate.push({ deptId, catKey, itemName, unit: String(row.unit || "Pcs"), remarks: String(row.remarks || "") });
  }

  let categoriesCreated = 0;
  for (const cat of newCategories) {
    await sql`
      INSERT INTO categories (id, department_id, name, display_order, active, created_at, updated_at)
      VALUES (${cat.id}, ${cat.deptId}, ${cat.name}, 0, TRUE, NOW(), NOW())
      ON CONFLICT DO NOTHING
    `;
    categoriesCreated++;
  }

  let imported = 0;
  for (const it of itemsToCreate) {
    const itemId = "ITEM-" + uuid().slice(0, 8);
    await sql`
      INSERT INTO items (id, department_id, category_id, name, unit, display_order, remarks, active, created_at, updated_at)
      VALUES (${itemId}, ${it.deptId}, ${catByKey[it.catKey]}, ${it.itemName}, ${it.unit}, 0, ${it.remarks}, TRUE, NOW(), NOW())
      ON CONFLICT DO NOTHING
    `;
    imported++;
  }

  clearCache("categories");
  clearCache("items");
  return { imported, skipped, categoriesCreated, errors: errors.slice(0, 50) };
}
