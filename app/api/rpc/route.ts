import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getEntriesForDate, saveEntry, saveBulkEntries, voidEntry,
  getAdminReport, adminBulkUpload, getDashboardStats,
} from "@/lib/server/entries";
import { getActivityFeed, getLogs, writeLog, writeActivity } from "@/lib/server/logs";
import {
  listCategories, saveCategory, deleteCategory,
  listItems, saveItem, deleteItem, bulkImportItems,
  listSections, saveSection, deleteSection, saveDeptSectionOverride,
  listDeviceSessions, removeDeviceSession, clearAllCache,
} from "@/lib/server/crud";
import {
  listUsersForAdmin, saveUser, deactivateUser, resetUserPassword,
  listDepartmentsForAdmin, saveDepartment, deleteDepartment,
  getLiveAccess, isAdminRole, type Access,
} from "@/lib/server/directory";
import type { TabKey } from "@/lib/permissions";
import { getDeptSectionOverrides, getSectionsForDepartment } from "@/lib/server/master";
import { getReconciliationReport, getReconciliationItemHistory } from "@/lib/server/reconciliation";
import {
  listDepartmentBackDateLimits, setBackDateEditDays, setBackDateEditDaysForAll,
  listSpecialAccess, grantSpecialAccess, revokeSpecialAccess,
  getAdminBackDateEditDays, setAdminBackDateEditDays, isAdminEditAllowed, getEffectiveAdminLimit,
} from "@/lib/server/access";

function fail(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}
function ok(data: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: true, ...data });
}

export async function POST(req: NextRequest) {
  const { action, payload } = await req.json();
  const p = payload || {};
  const session = await getSession();

  let _access: Access | null | undefined;
  const myAccess = async (): Promise<Access | null> => {
    if (_access === undefined) _access = session ? await getLiveAccess(session.userId) : null;
    return _access;
  };
  const requireAdmin = async (): Promise<Access> => {
    const a = await myAccess();
    if (!a || a.role === "Department User") throw new Error("Access denied: Admin role required.");
    return a;
  };
  const requireTab = async (tab: TabKey): Promise<Access> => {
    const a = await requireAdmin();
    if (a.role !== "Super Admin" && !a.tabs.includes(tab)) {
      throw new Error("Access denied: you don't have permission for this section.");
    }
    return a;
  };
  const requireSuperAdmin = async (): Promise<Access> => {
    const a = await myAccess();
    if (!a || a.role !== "Super Admin") throw new Error("Access denied: Super Admin role required.");
    return a;
  };
  const requireUsers = async (level: "view" | "manage"): Promise<Access> => {
    const a = await requireAdmin();
    if (a.role === "Super Admin") return a;
    const isOk = level === "view" ? a.users !== "none" : a.users === "manage";
    if (!isOk) throw new Error(`Access denied: you don't have permission to ${level === "view" ? "view" : "manage"} users.`);
    return a;
  };
  const liveActor = async () => {
    const a = await requireUsers("manage");
    return { userId: session!.userId, role: a.role };
  };
  const actorName = () => session?.name || "Admin";
  const actorId = () => session?.userId || "";

  try {
    switch (action) {
      case "getEntriesForDate": {
        if (!p.departmentId) return fail("departmentId is required.");
        const res = await getEntriesForDate(p.departmentId, p.date);
        return ok(res as unknown as Record<string, unknown>);
      }
      case "saveEntry": {
        if (!session) return fail("Not signed in.", 401);
        const row = await saveEntry({ ...p, enteredBy: session.name });
        await writeLog(session.userId, session.name, "Inventory Entry", "Item", row.ItemID, `${p.sectionName} = ${p.qty} for ${p.itemName}`);
        return ok({ saved: row });
      }
      case "saveBulkEntries": {
        if (!session) return fail("Not signed in.", 401);
        const list = (p.entries || []).map((e: Record<string, unknown>) => ({
          ...e, enteredBy: session.name, departmentId: e.departmentId || session.departmentId,
        }));
        if (!list.length) return fail("No entries to save.");
        const count = await saveBulkEntries(list);
        await writeLog(session.userId, session.name, "Bulk Inventory Save", "Department", session.departmentId, `${count} item(s) saved for ${list[0]?.sectionName}`);
        await writeActivity(session.name, session.role, session.departmentId, "Inventory Update", `${session.name} saved ${count} item(s) in ${list[0]?.sectionName}`);
        return ok({ savedCount: count });
      }
      case "voidEntry": {
        if (!session) return fail("Not signed in.", 401);
        if (!p.entryId || !p.reason) return fail("entryId and reason are required.");
        const res = await voidEntry(p.entryId, p.reason, session.name);
        await writeLog(session.userId, session.name, "Entry Voided", "Item", p.entryId, `${res.sectionName} = ${res.qty} for ${res.itemName} — reason: ${p.reason}`);
        await writeActivity(session.name, session.role, session.departmentId, "Void", `${session.name} voided ${res.itemName} (${res.sectionName}) — ${p.reason}`);
        return ok({ voided: true });
      }
      case "getAdminReport": {
        await requireTab("report");
        return ok(await getAdminReport(p) as unknown as Record<string, unknown>);
      }
      case "getMyAccess": {
        if (!session) return fail("Not signed in.", 401);
        const a = await requireAdmin();
        const days = a.role === "Super Admin" ? null : await getEffectiveAdminLimit(a.backDate);
        return ok({ role: a.role, tabs: a.tabs, users: a.users, backDateDays: days });
      }
      case "getReconciliationReport": {
        if (!session) return fail("Not signed in.", 401);
        if (!p.fromDate || !p.toDate) return fail("fromDate and toDate are required.");
        const acc = await myAccess();
        if (!acc) return fail("Not signed in.", 401);
        const isAdminNow = acc.role !== "Department User";
        if (isAdminNow) await requireTab("review");
        const departmentId = isAdminNow ? (p.departmentId || undefined) : session.departmentId;
        const res = await getReconciliationReport({
          fromDate: p.fromDate, toDate: p.toDate, departmentId,
          categoryId: p.categoryId || undefined, itemId: p.itemId || undefined,
          movementSectionId: p.movementSectionId || undefined,
        });
        return ok(res as unknown as Record<string, unknown>);
      }
      case "getReconciliationItemHistory": {
        if (!session) return fail("Not signed in.", 401);
        const accH = await myAccess();
        if (accH && accH.role !== "Department User") await requireTab("review");
        if (!p.itemId || !p.fromDate || !p.toDate) return fail("itemId, fromDate and toDate are required.");
        const res = await getReconciliationItemHistory(p.itemId, p.fromDate, p.toDate);
        return ok(res as unknown as Record<string, unknown>);
      }
      case "getDashboardStats": {
        await requireTab("dashboard");
        return ok(await getDashboardStats() as unknown as Record<string, unknown>);
      }
      case "getActivityFeed":
        return ok({ activity: await getActivityFeed(p.limit) });
      case "getLogs": {
        await requireTab("logs");
        return ok({ logs: await getLogs(p.limit) });
      }
      case "adminBulkUpload": {
        await requireTab("upload");
        const res = await adminBulkUpload(p.rows || []);
        await writeLog("", "Admin", "Bulk Upload", "Department", "", `${res.uploaded} rows uploaded, ${res.skipped} skipped`);
        await writeActivity("Admin", "Admin", "", "Bulk Upload", `Admin bulk-uploaded ${res.uploaded} inventory rows`);
        return ok(res as unknown as Record<string, unknown>);
      }
      case "bulkImportItems": {
        await requireTab("items");
        const res = await bulkImportItems(p.rows || []);
        await writeLog(actorId(), actorName(), "Bulk Item Import", "Item", "", `${res.imported} items imported, ${res.skipped} skipped, ${res.categoriesCreated} categories created`);
        await writeActivity(actorName(), "Admin", "", "Item Management", `${actorName()} bulk-imported ${res.imported} items`);
        return ok(res as unknown as Record<string, unknown>);
      }
      case "listUsers": {
        await requireUsers("view");
        const all = await listUsersForAdmin();
        if (p.scope === "admins") {
          await requireSuperAdmin();
          return ok({ users: all.filter((u) => isAdminRole(u.role)) });
        }
        return ok({ users: all.filter((u) => !isAdminRole(u.role)) });
      }
      case "saveUser": {
        const actor = await liveActor();
        const res = await saveUser(p, actor);
        const idLabel = p.username || p.email;
        await writeLog(actorId(), actorName(), res.created ? "User Created" : "User Updated", "User", idLabel, `${idLabel} (${p.role || "Department User"})`);
        await writeActivity(actorName(), actor.role, "", "User Management", `${actorName()} saved user ${idLabel}`);
        return ok({ saved: true, username: res.username });
      }
      case "deactivateUser": {
        const actor = await liveActor();
        const idLabel = p.username || p.email;
        await deactivateUser(idLabel, actor);
        await writeLog(actorId(), actorName(), "User Deactivated", "User", idLabel, idLabel);
        return ok({ deactivated: true });
      }
      case "resetUserPassword": {
        const actor = await liveActor();
        const idLabel = p.username || p.email;
        if (!idLabel || !p.newPin) return fail("username/email and newPin are required.");
        const res = await resetUserPassword(idLabel, p.newPin, actor);
        await writeLog(actorId(), actorName(), "Password Reset", "User", idLabel, `${res.name}'s temporary password was reset`);
        return ok({ reset: true });
      }
      case "listDepartments":
        await requireAdmin();
        return ok({ departments: await listDepartmentsForAdmin() });
      case "saveDepartment": {
        await requireSuperAdmin();
        const res = await saveDepartment(p);
        await writeLog(actorId(), actorName(), p.id ? "Department Updated" : "Department Created", "Department", res.id, p.name);
        return ok({ saved: true });
      }
      case "deleteDepartment": {
        await requireSuperAdmin();
        await deleteDepartment(p.id);
        await writeLog(actorId(), actorName(), "Department Deleted", "Department", p.id, "");
        return ok({ deleted: true });
      }
      case "listDepartmentBackDateLimits": {
        await requireTab("access");
        return ok({ departments: await listDepartmentBackDateLimits() });
      }
      case "setBackDateEditDays": {
        await requireTab("access");
        if (!p.departmentId || p.days === undefined) return fail("departmentId and days are required.");
        const days = Number(p.days);
        if (isNaN(days) || days < 0) return fail("days must be a non-negative number.");
        const res = await setBackDateEditDays(p.departmentId, days);
        await writeLog(actorId(), actorName(), "Back-Date Edit Days Changed", "Department", p.departmentId, `${res.departmentName}: ${res.oldValue} -> ${res.newValue} day(s)`);
        return ok({ saved: true });
      }
      case "setBackDateEditDaysForAll": {
        await requireTab("access");
        if (p.days === undefined) return fail("days is required.");
        const days = Number(p.days);
        if (isNaN(days) || days < 0) return fail("days must be a non-negative number.");
        const changes = await setBackDateEditDaysForAll(days);
        for (const c of changes) {
          await writeLog(actorId(), actorName(), "Back-Date Edit Days Changed (All Departments)", "Department", c.departmentId, `${c.departmentName}: ${c.oldValue} -> ${c.newValue} day(s)`);
        }
        return ok({ updated: changes.length });
      }
      case "listSpecialAccess": {
        await requireTab("access");
        return ok({ grants: await listSpecialAccess() });
      }
      case "grantSpecialAccess": {
        await requireTab("access");
        if (!p.departmentId || !p.date) return fail("departmentId and date are required.");
        const res = await grantSpecialAccess({
          departmentId: p.departmentId, itemId: p.itemId || "", itemName: p.itemName || "(All items)",
          date: p.date, grantedBy: actorName(),
        });
        await writeLog(actorId(), actorName(), "Special Edit Access Granted", "Item", p.itemId || "", `${p.itemName || "All items"} in department ${p.departmentId} unlocked for ${res.dateKey}`);
        return ok({ saved: true });
      }
      case "revokeSpecialAccess": {
        await requireTab("access");
        if (!p.id) return fail("id is required.");
        const res = await revokeSpecialAccess(p.id);
        await writeLog(actorId(), actorName(), "Special Edit Access Revoked", "Item", p.id, `${res.itemName} — ${res.dateKey}`);
        return ok({ revoked: true });
      }
      case "adminSaveBackDateEntry": {
        const accA = await requireTab("godmode");
        if (!p.departmentId || !p.itemName || !p.sectionName || !p.date) return fail("departmentId, itemName, sectionName and date are required.");
        const allowedSelf = await isAdminEditAllowed(p.date, accA.backDate);
        if (!allowedSelf) return fail("This date is outside your allowed back-date limit.");
        const before = await getEntriesForDate(p.departmentId, p.date);
        const prior = before.entries.find((e) => e.itemName === p.itemName && e.sectionName === p.sectionName && e.hasActive);
        const oldValue = prior ? String(prior.qty) : "(none)";
        const row = await saveEntry({ ...p, enteredBy: actorName() }, { bypassLock: true });
        await writeLog(actorId(), actorName(), "Back-Date Entry Saved (Admin)", "Item", row.ItemID, `${p.departmentId} / ${p.itemName} / ${p.sectionName} / ${row.EntryDate}: ${oldValue} -> ${p.qty}`);
        return ok({ saved: row });
      }
      case "getDeptSections": {
        await requireTab("godmode");
        if (!p.departmentId) return fail("departmentId is required.");
        return ok({ sections: await getSectionsForDepartment(p.departmentId) });
      }
      case "getAdminBackDateEditDays": {
        const a = await requireTab("godmode");
        if (a.role === "Super Admin") return ok({ days: await getAdminBackDateEditDays(), canEdit: true });
        return ok({ days: await getEffectiveAdminLimit(a.backDate), canEdit: false });
      }
      case "setAdminBackDateEditDays": {
        await requireSuperAdmin();
        const days = p.days === null || p.days === "" ? null : Number(p.days);
        if (days !== null && (isNaN(days) || days < 0)) return fail("days must be a non-negative number or blank for unlimited.");
        const res = await setAdminBackDateEditDays(days);
        await writeLog(actorId(), actorName(), "Default Admin Back-Date Edit Days Changed", "Admin", "", `${res.oldValue} -> ${res.newValue} day(s)`);
        return ok({ saved: true });
      }
      case "adminSaveEntries": {
        const accE = await requireTab("godmode");
        const list = (p.entries || []) as { departmentId: string; itemName: string; sectionName: string; qty: number; date: string; category?: string }[];
        if (!list.length) return fail("No entries to save.");
        const badDate = list.find((e) => !e.date);
        if (badDate) return fail("Every entry needs a date.");
        for (const e of list) {
          const allowedSelf = await isAdminEditAllowed(e.date, accE.backDate);
          if (!allowedSelf) return fail(`Date ${e.date} is outside your allowed back-date limit.`);
        }
        const withActor = list.map((e) => ({ ...e, enteredBy: actorName() }));
        const count = await saveBulkEntries(withActor, { bypassLock: true });
        await writeLog(actorId(), actorName(), "Bulk Back-Date Entries Saved (Admin)", "Department", list[0]?.departmentId || "", `${count} item(s) saved for ${list[0]?.sectionName} on ${list[0]?.date}`);
        return ok({ savedCount: count });
      }
      case "adminVoidEntry": {
        const accV = await requireTab("godmode");
        if (!p.entryId || !p.reason) return fail("entryId and reason are required.");
        const res = await voidEntry(p.entryId, p.reason, actorName(), { bypassLock: true, adminBackDate: accV.backDate });
        await writeLog(actorId(), actorName(), "Entry Voided (Admin God Mode)", "Item", p.entryId, `${res.sectionName} = ${res.qty} for ${res.itemName} — reason: ${p.reason}`);
        return ok({ voided: true });
      }
      case "listCategories":
        await requireAdmin();
        return ok({ categories: (await listCategories()).map((c) => ({ id: c.id, deptId: c.deptId, name: c.name, order: c.order, active: c.active })) });
      case "saveCategory": {
        await requireTab("categories");
        await saveCategory({ id: p.id, departmentId: p.departmentId, name: p.name, order: Number(p.order) || 0, active: p.active !== false });
        return ok({ saved: true });
      }
      case "deleteCategory":
        await requireTab("categories");
        await deleteCategory(p.id);
        return ok({ deleted: true });
      case "listItemsAdmin":
        await requireAdmin();
        return ok({
          items: (await listItems()).map((i) => ({
            id: i.id, deptId: i.deptId, catId: i.catId, name: i.name, unit: i.unit,
            order: i.order, active: i.active, remarks: i.remarks,
          })),
        });
      case "saveItem": {
        await requireTab("items");
        await saveItem({ id: p.id, departmentId: p.departmentId, categoryId: p.categoryId, name: p.name, unit: p.unit, order: Number(p.order) || 0, remarks: p.remarks });
        return ok({ saved: true });
      }
      case "deleteItem":
        await requireTab("items");
        await deleteItem(p.id);
        return ok({ deleted: true });
      case "listSectionsAdmin":
        await requireTab("sections");
        return ok({
          sections: (await listSections()).map((s) => ({
            id: s.id, name: s.name, order: s.order, active: s.active,
            deptId: s.departmentScope, movementSign: s.movementSign,
            includeInReconciliation: s.includeInReconciliation,
          })),
        });
      case "saveSection": {
        await requireTab("sections");
        await saveSection({
          id: p.id, name: p.name, order: Number(p.order) || 0, active: p.active !== false,
          departmentScope: p.departmentId || "",
          movementSign: p.movementSign === "MINUS" ? "MINUS" : "PLUS",
          includeInReconciliation: !!p.includeInReconciliation,
        });
        return ok({ saved: true });
      }
      case "deleteSection":
        await requireTab("sections");
        await deleteSection(p.id);
        return ok({ deleted: true });
      case "listDeptSectionOverrides":
        await requireTab("sections");
        return ok({ overrides: await getDeptSectionOverrides() });
      case "saveDeptSectionOverride": {
        await requireTab("sections");
        if (!p.departmentId || !p.sectionId) return fail("departmentId and sectionId are required.");
        await saveDeptSectionOverride(p.departmentId, p.sectionId, !!p.active, String(p.customName || "").trim());
        return ok({ saved: true });
      }
      case "listDeviceSessions":
        await requireTab("devices");
        return ok({
          sessions: (await listDeviceSessions()).map((s) => ({
            userId: s.userId, userName: s.userName, deviceId: s.deviceId, deviceInfo: s.deviceInfo, loginTime: s.loginTime,
          })),
        });
      case "removeDeviceSession": {
        await requireTab("devices");
        const removed = await removeDeviceSession(p.userId, p.deviceId);
        if (!removed) return fail("Device record not found.");
        return ok({ removed: true });
      }
      case "clearCache":
        await requireAdmin();
        clearAllCache();
        return ok({ cleared: true });
      default:
        return fail("Unknown action: " + action);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(message, message.startsWith("Access denied") ? 403 : 400);
  }
}
