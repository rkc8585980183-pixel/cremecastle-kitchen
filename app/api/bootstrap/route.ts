import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { loadMasterData, getSectionsForDepartment } from "@/lib/server/master";
import { getEntriesForDate } from "@/lib/server/entries";
import { listDepartmentBackDateLimits } from "@/lib/server/access";
import { toDateKey, todayKey, dateKeyToDisplay } from "@/lib/utils";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date") || undefined;
  const master = await loadMasterData();
  const user = await getSession();

  if (!user) return NextResponse.json({ ok: true, master, user: null });

  const dateKey = toDateKey(dateParam) || todayKey();
  let entries: Awaited<ReturnType<typeof getEntriesForDate>>["entries"] = [];
  let openingSuggestions: Record<string, number> = {};
  let deptSections: Awaited<ReturnType<typeof getSectionsForDepartment>> | typeof master.sections = master.sections;
  let locked = false;
  let backDateEditDays: number | null = null;

  if (user.role === "Department User") {
    const res = await getEntriesForDate(user.departmentId, dateKey);
    entries = res.entries;
    openingSuggestions = res.openingSuggestions;
    locked = res.locked;
    const limits = await listDepartmentBackDateLimits();
    backDateEditDays = limits.find((d) => d.departmentId === user.departmentId)?.backDateEditDays ?? null;
    deptSections = await getSectionsForDepartment(user.departmentId);
  }

  return NextResponse.json({
    ok: true, master, user, date: dateKeyToDisplay(dateKey),
    entries, openingSuggestions, deptSections, locked, backDateEditDays,
  });
}
