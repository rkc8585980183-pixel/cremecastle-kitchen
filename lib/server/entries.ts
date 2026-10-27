import { v4 as uuid } from "uuid";
import { sql } from "@/lib/db";
import { toDateKey, todayKey, dateKeyToDisplay, shiftDateKey, nowStamp } from "@/lib/utils";
import { isEditAllowed, isAdminEditAllowed } from "./access";
import type { BackDateSetting } from "@/lib/permissions";

// Entries are append-only — we never UPDATE qty or delete rows.
// Only Status/VoidReason/UpdatedAt change on a void.

type EntryRow = {
  id: string; entry_date: string; item_id: string; item_name: string;
  category_name: string; section_name: string; qty: number; entered_by: string;
  status: string; void_reason: string; created_at: string; updated_at: string;
};

// Resolve item by name+department for correct department-scoped lookup
async function resolveItem(itemName: string, departmentId: string) {
  const rows = await sql<{ id: string; category_id: string; department_id: string }>`
    SELECT i.id, i.category_id, i.department_id
    FROM items i
    WHERE i.name = ${itemName} AND i.department_id = ${departmentId} AND i.active = TRUE
    LIMIT 1
  `;
  if (rows.length) return rows[0];
  // Fallback: any department
  const fallback = await sql<{ id: string; category_id: string; department_id: string }>`
    SELECT id, category_id, department_id FROM items WHERE name = ${itemName} AND active = TRUE LIMIT 1
  `;
  return fallback[0] ?? null;
}

async function getCategoryName(catId: string): Promise<string> {
  const rows = await sql<{ name: string }>`SELECT name FROM categories WHERE id = ${catId} LIMIT 1`;
  return rows[0]?.name || "";
}

function isVoid(r: EntryRow) {
  return r.status?.trim().toUpperCase() === "VOID";
}

function groupByKey(rows: EntryRow[]) {
  const groups: Record<string, EntryRow[]> = {};
  rows.forEach((r) => {
    const key = `${r.item_name}||${r.section_name}`;
    (groups[key] ||= []).push(r);
  });
  return groups;
}

export async function getEntriesForDate(departmentId: string, dateInput?: string) {
  const dateKey = toDateKey(dateInput) || todayKey();
  const dateDisplay = dateKeyToDisplay(dateKey);

  // Get all entries for this department on this date (join items to filter by dept)
  const rowsForDate = await sql<EntryRow>`
    SELECT e.id, e.entry_date, e.item_id, e.item_name, e.category_name, e.section_name,
           e.qty::float AS qty, e.entered_by, e.status, e.void_reason,
           e.created_at::text, e.updated_at::text
    FROM inventory_entries e
    JOIN items i ON i.id = e.item_id
    WHERE i.department_id = ${departmentId} AND e.entry_date = ${dateKey}
    ORDER BY e.created_at
  `;

  const groups = groupByKey(rowsForDate);

  const generallyLocked = !(await isEditAllowed(departmentId, "", dateKey));

  const entries = await Promise.all(
    Object.values(groups).map(async (chain) => {
      const active = [...chain].reverse().find((r) => !isVoid(r));
      const history = chain
        .filter((r) => r !== active)
        .map((r) => ({
          entryId: r.id, qty: r.qty, enteredBy: r.entered_by,
          createdAt: r.created_at, status: isVoid(r) ? "Void" : "Active",
          voidReason: r.void_reason || "",
        }));
      const r = active || chain[chain.length - 1];
      const itemLocked = !(await isEditAllowed(departmentId, r.item_id, dateKey));
      return {
        entryId: active ? r.id : "",
        itemName: r.item_name,
        category: r.category_name,
        sectionName: r.section_name,
        qty: active ? r.qty : 0,
        enteredBy: active ? r.entered_by : "",
        createdAt: active ? r.created_at : "",
        updatedAt: active ? r.updated_at : "",
        hasActive: !!active,
        isCorrection: chain.length > 1,
        history,
        locked: itemLocked,
      };
    })
  );

  // Opening suggestions from yesterday's "In Hand"
  const yesterdayKey = shiftDateKey(dateKey, -1);
  const yRows = await sql<EntryRow>`
    SELECT e.id, e.entry_date, e.item_id, e.item_name, e.category_name, e.section_name,
           e.qty::float AS qty, e.entered_by, e.status, e.void_reason,
           e.created_at::text, e.updated_at::text
    FROM inventory_entries e
    JOIN items i ON i.id = e.item_id
    WHERE i.department_id = ${departmentId} AND e.entry_date = ${yesterdayKey}
    ORDER BY e.created_at
  `;
  const yGroups = groupByKey(yRows);
  const openingSuggestions: Record<string, number> = {};
  Object.values(yGroups).forEach((chain) => {
    const active = [...chain].reverse().find((r) => !isVoid(r));
    if (active && active.section_name === "In Hand") {
      openingSuggestions[active.item_name] = active.qty;
    }
  });

  return { entries, openingSuggestions, date: dateDisplay, locked: generallyLocked };
}

export async function saveEntry(
  payload: {
    departmentId: string; itemName: string; sectionName: string; qty: number;
    enteredBy: string; date: string; category?: string;
  },
  opts: { bypassLock?: boolean } = {}
) {
  const dateKey = toDateKey(payload.date);
  const item = await resolveItem(payload.itemName, payload.departmentId);

  if (!opts.bypassLock) {
    const allowed = await isEditAllowed(
      payload.departmentId, item?.id || "", dateKey
    );
    if (!allowed) throw new Error("This date is locked for this item — ask an Admin for Special Edit Access.");
  }

  const catName = item ? await getCategoryName(item.category_id) : (payload.category || "");
  const id = uuid();
  const now = new Date();

  await sql`
    INSERT INTO inventory_entries
      (id, entry_date, item_id, item_name, category_name, section_name, qty, entered_by, status, void_reason, created_at, updated_at)
    VALUES
      (${id}, ${dateKey}, ${item?.id || ""}, ${payload.itemName}, ${catName},
       ${payload.sectionName}, ${payload.qty}, ${payload.enteredBy}, 'Active', '', ${now}, ${now})
  `;

  return {
    EntryID: id, EntryDate: dateKeyToDisplay(dateKey),
    ItemID: item?.id || "", ItemName: payload.itemName,
  };
}

export async function saveBulkEntries(
  list: { itemName: string; sectionName: string; qty: number; enteredBy: string; date: string; category?: string; departmentId?: string }[],
  opts: { bypassLock?: boolean } = {}
) {
  const candidates = list.filter((e) => !isNaN(Number(e.qty)) && Number(e.qty) >= 0);
  const now = new Date();
  let saved = 0;

  for (const e of candidates) {
    const deptId = e.departmentId || "";
    const item = await resolveItem(e.itemName, deptId);
    const dateKey = toDateKey(e.date);
    const allowed = opts.bypassLock || (await isEditAllowed(deptId, item?.id || "", dateKey));
    if (!allowed) continue;
    const catName = item ? await getCategoryName(item.category_id) : (e.category || "");
    const id = uuid();
    await sql`
      INSERT INTO inventory_entries
        (id, entry_date, item_id, item_name, category_name, section_name, qty, entered_by, status, void_reason, created_at, updated_at)
      VALUES
        (${id}, ${dateKey}, ${item?.id || ""}, ${e.itemName}, ${catName},
         ${e.sectionName}, ${Number(e.qty)}, ${e.enteredBy}, 'Active', '', ${now}, ${now})
    `;
    saved++;
  }
  return saved;
}

export async function voidEntry(
  entryId: string, reason: string, voidedBy: string,
  opts: { bypassLock?: boolean; adminBackDate?: BackDateSetting } = {}
) {
  const trimmedReason = String(reason || "").trim();
  if (!trimmedReason) throw new Error("A reason is required to void an entry.");

  const rows = await sql<EntryRow>`
    SELECT e.id, e.entry_date, e.item_id, e.item_name, e.section_name, e.qty::float AS qty, e.status
    FROM inventory_entries e WHERE e.id = ${entryId}
  `;
  if (!rows.length) throw new Error("Entry not found.");
  const row = rows[0];
  if (row.status?.trim().toUpperCase() === "VOID") throw new Error("This entry is already voided.");

  const entryDateKey = toDateKey(row.entry_date);
  if (opts.bypassLock && opts.adminBackDate) {
    const ok = await isAdminEditAllowed(entryDateKey, opts.adminBackDate);
    if (!ok) throw new Error("This entry's date is outside your allowed back-date limit.");
  }
  if (!opts.bypassLock) {
    // Find department from item
    const itemRows = await sql<{ department_id: string }>`SELECT department_id FROM items WHERE id = ${row.item_id} LIMIT 1`;
    const departmentId = itemRows[0]?.department_id || "";
    const allowed = await isEditAllowed(departmentId, row.item_id, entryDateKey);
    if (!allowed) throw new Error("This entry's date is locked — ask an Admin for Special Edit Access.");
  }

  await sql`
    UPDATE inventory_entries
    SET status = 'Void', void_reason = ${`${trimmedReason} (by ${voidedBy})`}, updated_at = NOW()
    WHERE id = ${entryId}
  `;
  return { itemName: row.item_name, sectionName: row.section_name, qty: row.qty };
}

export async function getAdminReport(filters: {
  fromDate?: string; toDate?: string; departmentId?: string; sectionName?: string;
}) {
  const fromKey = filters.fromDate ? toDateKey(filters.fromDate) : null;
  const toKey = filters.toDate ? toDateKey(filters.toDate) : null;

  let rows: EntryRow[];
  if (filters.departmentId) {
    rows = await sql<EntryRow>`
      SELECT e.id, e.entry_date, e.item_id, e.item_name, e.category_name, e.section_name,
             e.qty::float AS qty, e.entered_by, e.status, e.void_reason, e.created_at::text, e.updated_at::text
      FROM inventory_entries e
      JOIN items i ON i.id = e.item_id
      WHERE i.department_id = ${filters.departmentId}
        ${fromKey ? sql`AND e.entry_date >= ${fromKey}` : sql``}
        ${toKey ? sql`AND e.entry_date <= ${toKey}` : sql``}
        ${filters.sectionName ? sql`AND e.section_name = ${filters.sectionName}` : sql``}
      ORDER BY e.entry_date DESC, e.created_at DESC
    `;
  } else {
    rows = await sql<EntryRow>`
      SELECT e.id, e.entry_date, e.item_id, e.item_name, e.category_name, e.section_name,
             e.qty::float AS qty, e.entered_by, e.status, e.void_reason, e.created_at::text, e.updated_at::text
      FROM inventory_entries e
      WHERE TRUE
        ${fromKey ? sql`AND e.entry_date >= ${fromKey}` : sql``}
        ${toKey ? sql`AND e.entry_date <= ${toKey}` : sql``}
        ${filters.sectionName ? sql`AND e.section_name = ${filters.sectionName}` : sql``}
      ORDER BY e.entry_date DESC, e.created_at DESC
    `;
  }

  // Get department id for each item
  const itemDeptMap: Record<string, string> = {};
  const itemIds = [...new Set(rows.map((r) => r.item_id).filter(Boolean))];
  if (itemIds.length) {
    const itemRows = await sql<{ id: string; department_id: string }>`
      SELECT id, department_id FROM items WHERE id = ANY(${itemIds}::text[])
    `;
    itemRows.forEach((i) => { itemDeptMap[i.id] = i.department_id; });
  }

  const out = rows.map((r) => ({
    date: dateKeyToDisplay(r.entry_date),
    dateKey: r.entry_date,
    departmentId: itemDeptMap[r.item_id] || "",
    itemName: r.item_name,
    category: r.category_name || "",
    sectionName: r.section_name,
    qty: r.qty,
    enteredBy: r.entered_by,
    createdAt: r.created_at,
    status: isVoid(r) ? "Void" : "Active",
    voidReason: r.void_reason || "",
  }));

  const totalQty = out.filter((r) => r.status !== "Void").reduce((s, r) => s + r.qty, 0);
  return { rows: out, totalEntries: out.length, totalQty };
}

export async function adminBulkUpload(
  rows: { date: string; itemName: string; sectionName: string; qty: string; departmentId?: string; enteredBy?: string }[]
) {
  const now = new Date();
  let uploaded = 0, skipped = 0;
  for (const r of rows) {
    const qty = Number(r.qty);
    if (!r.date || !r.itemName || !r.sectionName || isNaN(qty)) { skipped++; continue; }
    const item = await resolveItem(r.itemName, r.departmentId || "");
    const catName = item ? await getCategoryName(item.category_id) : "";
    const dateKey = toDateKey(r.date);
    const id = uuid();
    await sql`
      INSERT INTO inventory_entries
        (id, entry_date, item_id, item_name, category_name, section_name, qty, entered_by, status, void_reason, created_at, updated_at)
      VALUES
        (${id}, ${dateKey}, ${item?.id || ""}, ${r.itemName}, ${catName},
         ${r.sectionName}, ${qty}, ${r.enteredBy || "Admin (Bulk Upload)"}, 'Active', '', ${now}, ${now})
    `;
    uploaded++;
  }
  return { uploaded, skipped };
}

export async function getDashboardStats() {
  const [itemStats, entryStats] = await Promise.all([
    sql<{ total: number; active: number }>`
      SELECT COUNT(*) AS total, SUM(CASE WHEN active THEN 1 ELSE 0 END) AS active FROM items
    `,
    sql<{ count: number }>`
      SELECT COUNT(*) AS count FROM inventory_entries WHERE entry_date = ${todayKey()}
    `,
  ]);
  const total = Number(itemStats[0]?.total || 0);
  const active = Number(itemStats[0]?.active || 0);
  return {
    totalItems: total, activeItems: active, inactiveItems: total - active,
    todaysEntries: Number(entryStats[0]?.count || 0),
  };
}
