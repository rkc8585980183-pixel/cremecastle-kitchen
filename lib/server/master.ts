import { sql, cached } from "@/lib/db";

export async function loadMasterData() {
  const [deptRows, catRows, itemRows, sectionRows] = await Promise.all([
    cached("departments", 30_000, () =>
      sql<{ id: string; name: string; display_order: number }>`
        SELECT id, name, display_order FROM departments WHERE active = TRUE ORDER BY display_order, name
      `
    ),
    cached("categories", 30_000, () =>
      sql<{ id: string; department_id: string; name: string; display_order: number }>`
        SELECT id, department_id, name, display_order FROM categories WHERE active = TRUE ORDER BY display_order, name
      `
    ),
    cached("items", 30_000, () =>
      sql<{ id: string; department_id: string; category_id: string; name: string; unit: string; display_order: number }>`
        SELECT id, department_id, category_id, name, unit, display_order FROM items WHERE active = TRUE ORDER BY display_order, name
      `
    ),
    cached("sections", 30_000, () =>
      sql<{ id: string; name: string; display_order: number; department_scope: string; movement_sign: string; include_in_reconciliation: boolean }>`
        SELECT id, name, display_order, department_scope, movement_sign, include_in_reconciliation
        FROM sections WHERE active = TRUE ORDER BY display_order, name
      `
    ),
  ]);

  const departments = deptRows.map((d) => ({ id: d.id, name: d.name, order: d.display_order }));
  const categories = catRows.map((c) => ({ id: c.id, deptId: c.department_id, name: c.name, order: c.display_order }));
  const items = itemRows.map((i) => ({ id: i.id, deptId: i.department_id, catId: i.category_id, name: i.name, unit: i.unit, order: i.display_order }));
  const sections = sectionRows.map((s) => ({
    id: s.id, name: s.name, order: s.display_order, deptId: s.department_scope || "",
    movementSign: (s.movement_sign?.toUpperCase() === "MINUS" ? "MINUS" : "PLUS") as "PLUS" | "MINUS",
    includeInReconciliation: !!s.include_in_reconciliation,
  }));

  return { departments, categories, items, sections };
}

export async function getDeptSectionOverrides() {
  const rows = await sql<{ department_id: string; section_id: string; active: boolean; custom_name: string }>`
    SELECT department_id, section_id, active, custom_name FROM dept_section_overrides
  `;
  const map: Record<string, { active: boolean; customName: string }> = {};
  rows.forEach((r) => {
    map[`${r.department_id}||${r.section_id}`] = { active: r.active, customName: r.custom_name || "" };
  });
  return map;
}

export async function getSectionsForDepartment(deptId: string) {
  const master = await loadMasterData();
  const overrides = await getDeptSectionOverrides();
  return master.sections
    .filter((s) => {
      if (!s.deptId) return true;
      const allowed = s.deptId.split(",").map((x) => x.trim()).filter(Boolean);
      return allowed.includes(deptId);
    })
    .filter((s) => {
      const ov = overrides[`${deptId}||${s.id}`];
      if (ov) return ov.active;
      return true;
    })
    .map((s) => {
      const ov = overrides[`${deptId}||${s.id}`];
      return { id: s.id, name: s.name, displayName: ov?.customName || s.name, order: s.order };
    });
}
