import { sql } from "@/lib/db";
import { toDateKey } from "@/lib/utils";
import { getSectionsForDepartment } from "./master";

export const OPENING_SECTION_NAME = "Opening";
export const ACTUAL_SECTION_NAME = "In Hand";

export type MovementDef = { id: string; name: string; sign: "PLUS" | "MINUS"; order: number };

export type ReconciliationRow = {
  itemId: string; itemName: string; categoryId: string; categoryName: string;
  departmentId: string; departmentName: string; unit: string;
  opening: number; movements: Record<string, number>;
  actual: number; expected: number; variance: number;
  status: "MATCHED" | "SHORT" | "EXCESS";
};

export type ReconciliationFilters = {
  fromDate: string; toDate: string; departmentId?: string;
  categoryId?: string; itemId?: string; movementSectionId?: string;
};

async function loadAllMovementDefs(): Promise<MovementDef[]> {
  const rows = await sql<{
    id: string; name: string; movement_sign: string; display_order: number;
  }>`
    SELECT id, name, movement_sign, display_order FROM sections
    WHERE active = TRUE
      AND name != ${OPENING_SECTION_NAME}
      AND name != ${ACTUAL_SECTION_NAME}
      AND include_in_reconciliation = TRUE
    ORDER BY display_order
  `;
  return rows.map((s) => ({
    id: s.id, name: s.name, order: s.display_order,
    sign: s.movement_sign?.toUpperCase() === "MINUS" ? "MINUS" : "PLUS" as "PLUS" | "MINUS",
  }));
}

async function loadMovementDefsForDepartment(departmentId: string, all: MovementDef[]): Promise<MovementDef[]> {
  if (!departmentId) return all;
  const deptSections = await getSectionsForDepartment(departmentId);
  const allowedIds = new Set(deptSections.map((s) => s.id));
  return all.filter((m) => allowedIds.has(m.id));
}

export async function getReconciliationReport(filters: ReconciliationFilters) {
  const fromKey = toDateKey(filters.fromDate);
  const toKey = toDateKey(filters.toDate);

  // Load items with department and category info
  let itemQuery = sql<{
    id: string; name: string; unit: string; department_id: string; dept_name: string;
    category_id: string; cat_name: string;
  }>`
    SELECT i.id, i.name, i.unit, i.department_id, d.name AS dept_name,
           i.category_id, c.name AS cat_name
    FROM items i
    JOIN departments d ON d.id = i.department_id
    JOIN categories c ON c.id = i.category_id
    WHERE i.active = TRUE AND d.active = TRUE
      ${filters.departmentId ? sql`AND i.department_id = ${filters.departmentId}` : sql``}
      ${filters.categoryId ? sql`AND i.category_id = ${filters.categoryId}` : sql``}
      ${filters.itemId ? sql`AND i.id = ${filters.itemId}` : sql``}
    ORDER BY d.name, c.name, i.name
  `;
  const items = await itemQuery;
  if (!items.length) return { rows: [], movements: [], summary: { totalItems: 0, expected: 0, actual: 0, variance: 0, matched: 0, short: 0, excess: 0 } };

  const allMovements = await loadAllMovementDefs();

  // Load all relevant entries in one query
  const itemIds = items.map((i) => i.id);
  const entries = await sql<{ item_id: string; section_name: string; qty: number }>`
    SELECT item_id, section_name, SUM(qty::float) AS qty
    FROM inventory_entries
    WHERE item_id = ANY(${itemIds}::text[])
      AND entry_date >= ${fromKey} AND entry_date <= ${toKey}
      AND status = 'Active'
    GROUP BY item_id, section_name
  `;

  // For opening, use the last entry before or on fromDate
  const openingEntries = await sql<{ item_id: string; qty: number }>`
    SELECT DISTINCT ON (item_id) item_id, qty::float AS qty
    FROM inventory_entries
    WHERE item_id = ANY(${itemIds}::text[])
      AND section_name = ${OPENING_SECTION_NAME}
      AND entry_date <= ${fromKey}
      AND status = 'Active'
    ORDER BY item_id, entry_date DESC, created_at DESC
  `;

  const openingMap: Record<string, number> = {};
  openingEntries.forEach((e) => { openingMap[e.item_id] = e.qty; });

  const entryMap: Record<string, Record<string, number>> = {};
  entries.forEach((e) => {
    if (!entryMap[e.item_id]) entryMap[e.item_id] = {};
    entryMap[e.item_id][e.section_name] = (entryMap[e.item_id][e.section_name] || 0) + e.qty;
  });

  const rows: ReconciliationRow[] = [];

  for (const item of items) {
    const deptMovements = filters.departmentId
      ? await loadMovementDefsForDepartment(item.department_id, allMovements)
      : allMovements;

    if (filters.movementSectionId) {
      if (!deptMovements.find((m) => m.id === filters.movementSectionId)) continue;
    }

    const opening = openingMap[item.id] ?? 0;
    const itemEntries = entryMap[item.id] || {};
    const actual = itemEntries[ACTUAL_SECTION_NAME] ?? 0;

    const movements: Record<string, number> = {};
    let expected = opening;
    for (const mv of deptMovements) {
      const qty = itemEntries[mv.name] ?? 0;
      movements[mv.id] = qty;
      if (mv.sign === "PLUS") expected += qty;
      else expected -= qty;
    }

    const variance = actual - expected;
    const status: "MATCHED" | "SHORT" | "EXCESS" =
      Math.abs(variance) < 0.0001 ? "MATCHED" : variance < 0 ? "SHORT" : "EXCESS";

    rows.push({
      itemId: item.id, itemName: item.name, categoryId: item.category_id,
      categoryName: item.cat_name, departmentId: item.department_id,
      departmentName: item.dept_name, unit: item.unit,
      opening, movements, actual, expected, variance, status,
    });
  }

  const summary = {
    totalItems: rows.length,
    expected: rows.reduce((s, r) => s + r.expected, 0),
    actual: rows.reduce((s, r) => s + r.actual, 0),
    variance: rows.reduce((s, r) => s + r.variance, 0),
    matched: rows.filter((r) => r.status === "MATCHED").length,
    short: rows.filter((r) => r.status === "SHORT").length,
    excess: rows.filter((r) => r.status === "EXCESS").length,
  };

  return { rows, movements: allMovements, summary };
}

export async function getReconciliationItemHistory(itemId: string, fromDate: string, toDate: string) {
  const fromKey = toDateKey(fromDate);
  const toKey = toDateKey(toDate);
  const rows = await sql<{
    entry_date: string; section_name: string; qty: number; entered_by: string;
    status: string; void_reason: string; created_at: string;
  }>`
    SELECT entry_date, section_name, qty::float AS qty, entered_by, status, void_reason, created_at::text
    FROM inventory_entries
    WHERE item_id = ${itemId} AND entry_date >= ${fromKey} AND entry_date <= ${toKey}
    ORDER BY entry_date, created_at
  `;
  return {
    history: rows.map((r) => ({
      date: r.entry_date, sectionName: r.section_name, qty: r.qty,
      enteredBy: r.entered_by, status: r.status, voidReason: r.void_reason || "",
      createdAt: r.created_at,
    })),
  };
}
