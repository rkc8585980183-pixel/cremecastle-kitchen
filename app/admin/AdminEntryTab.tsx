"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { rpc } from "@/lib/api";
import { Department, Item, EntryRow } from "@/lib/types";
import { Field, TextInput, SelectInput, Btn } from "./ui";

type Toast = (msg: string, err?: boolean) => void;
type DeptSection = { id: string; name: string; displayName: string; order: number };

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysAgo(dateStr: string) {
  const [ty, tm, td] = todayLocal().split("-").map(Number);
  const [y, m, d] = dateStr.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 86400000);
}

export default function AdminEntryTab({ departments, items, showToast }: { departments: Department[]; items: Item[]; showToast: Toast }) {
  const [departmentId, setDepartmentId] = useState(departments[0]?.id || "");
  const [date, setDate] = useState(todayLocal());
  const [sections, setSections] = useState<DeptSection[]>([]);
  const [sectionIdx, setSectionIdx] = useState(0);
  const [entries, setEntries] = useState<Record<string, EntryRow>>({});
  const [pending, setPending] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [voidTarget, setVoidTarget] = useState<{ entryId: string; itemName: string; sectionName: string; qty: number } | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [adminDays, setAdminDays] = useState<string>("");
  const [canEditLimit, setCanEditLimit] = useState(false); // only a Super Admin edits the default
  const [savingDays, setSavingDays] = useState(false);

  const deptItems = useMemo(() => {
    return items
      .filter((i) => {
        const ids = String(i.deptId || "").split(",").map((x) => x.trim()).filter(Boolean);
        return ids.length === 0 || ids.includes(departmentId);
      })
      .sort((a, b) => a.order - b.order);
  }, [items, departmentId]);

  const filteredItems = useMemo(() => {
    const s = search.trim().toLowerCase();
    return deptItems.filter((i) => !s || i.name.toLowerCase().includes(s));
  }, [deptItems, search]);

  const section = sections[sectionIdx];

  // View-only when this admin's own back-date limit has been exceeded.
  // A Super Admin is never limited (canEditLimit === true means "is a Super Admin").
  const limitDays = adminDays === "" ? null : Number(adminDays);
  const viewOnly = !canEditLimit && limitDays !== null && !isNaN(limitDays) && !!date && daysAgo(date) > limitDays;

  const load = useCallback(async () => {
    if (!departmentId) return;
    setLoading(true);
    const [secRes, entRes] = await Promise.all([
      rpc<{ sections: DeptSection[] }>("getDeptSections", { departmentId }),
      rpc<{ entries: EntryRow[] }>("getEntriesForDate", { departmentId, date }),
    ]);
    if (secRes.ok) setSections(secRes.sections);
    if (entRes.ok) {
      const map: Record<string, EntryRow> = {};
      entRes.entries.forEach((e) => (map[`${e.itemName}||${e.sectionName}`] = e));
      setEntries(map);
    }
    setPending({});
    setSectionIdx(0);
    setLoading(false);
  }, [departmentId, date]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    rpc<{ days: number | null; canEdit: boolean }>("getAdminBackDateEditDays").then((res) => {
      if (res.ok) { setAdminDays(res.days === null ? "" : String(res.days)); setCanEditLimit(!!res.canEdit); }
    });
  }, []);

  async function saveAdminDays() {
    setSavingDays(true);
    const res = await rpc("setAdminBackDateEditDays", { days: adminDays === "" ? null : Number(adminDays) });
    setSavingDays(false);
    if (!res.ok) { showToast(res.error, true); return; }
    showToast("Default Admin back-date limit updated");
  }

  function setQty(itemName: string, value: string) {
    setPending((prev) => {
      const next = { ...prev };
      if (value === "") delete next[itemName];
      else next[itemName] = value;
      return next;
    });
  }

  async function saveAll() {
    if (!section) return;
    const names = Object.keys(pending);
    if (!names.length) return;
    const list = names.map((itemName) => ({
      departmentId,
      itemName,
      sectionName: section.name,
      qty: Number(pending[itemName]),
      date,
      category: "",
    }));
    if (list.some((e) => isNaN(e.qty) || e.qty < 0)) { showToast("Fix the quantity before saving", true); return; }
    setSaving(true);
    const res = await rpc<{ savedCount: number }>("adminSaveEntries", { entries: list });
    setSaving(false);
    if (!res.ok) { showToast(res.error, true); return; }
    showToast(`Saved ${list.length} item(s)`);
    load();
  }

  async function confirmVoid() {
    if (!voidTarget) return;
    if (!voidReason.trim()) { showToast("A reason is required to void this entry", true); return; }
    const res = await rpc("adminVoidEntry", { entryId: voidTarget.entryId, reason: voidReason.trim() });
    if (!res.ok) { showToast(res.error, true); return; }
    showToast("Entry voided");
    setVoidTarget(null);
    setVoidReason("");
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold">Admin Entry (God Mode)</h2>
          <p className="text-[#8A6F5C] text-sm">Fill or edit any department&apos;s entries — bypasses department locks, limited only by your own back-date limit.</p>
        </div>
      </div>

      {canEditLimit ? (
        <div className="bg-white border border-[#EADFCB] rounded-2xl p-4 mb-4">
          <div className="flex flex-wrap items-end gap-2.5">
            <div className="w-64">
              <Field label="Default back-date limit for Admins (blank = unlimited)">
                <TextInput type="number" min={0} placeholder="Unlimited" value={adminDays} onChange={(e) => setAdminDays(e.target.value)} />
              </Field>
            </div>
            <Btn variant="ghost" onClick={saveAdminDays} disabled={savingDays}>{savingDays ? "Saving…" : "Save default"}</Btn>
          </div>
          <p className="text-[11.5px] text-[#8A6F5C] mt-1">
            Applies to every Admin who is set to &quot;Use default&quot; in the Admins tab. Admins with a custom or unlimited limit are unaffected. As Super Admin you are never limited.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-[#EADFCB] rounded-2xl px-4 py-3 mb-4 text-[12.5px] text-[#8A6F5C]">
          🕒 Your back-date limit:{" "}
          <b className="text-[#2B1810]">{adminDays === "" ? "Unlimited" : `${adminDays} day(s) back`}</b>
          {" "}— set by a Super Admin.
        </div>
      )}

      <div className="bg-white border border-[#EADFCB] rounded-2xl p-4 mb-4">
        <div className="flex flex-wrap gap-2.5 items-end">
          <div className="w-56">
            <Field label="Department">
              <SelectInput value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </SelectInput>
            </Field>
          </div>
          <div className="w-44">
            <Field label="Date">
              <TextInput
                type="date"
                value={date}
                max={todayLocal()}
                onChange={(e) => setDate(e.target.value && e.target.value > todayLocal() ? todayLocal() : e.target.value)}
              />
            </Field>
          </div>
          <div className="flex-1 min-w-[180px]">
            <Field label="Search items">
              <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" />
            </Field>
          </div>
        </div>

        {sections.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 mt-3">
            {sections.map((s, idx) => (
              <button
                key={s.id}
                onClick={() => setSectionIdx(idx)}
                className="flex-shrink-0 rounded-full px-3.5 py-2 text-[12.5px] font-bold cursor-pointer whitespace-nowrap"
                style={idx === sectionIdx ? { background: "#C75B0C", color: "#fff" } : { background: "#fff", border: "1px solid #EADFCB" }}
              >
                {s.displayName}
              </button>
            ))}
          </div>
        )}
      </div>

      {viewOnly && (
        <div className="mb-3 flex items-center gap-2 px-3.5 py-2.5 rounded-xl" style={{ background: "#F5E6D0", border: "1px solid #E8D3B5" }}>
          <span className="text-base">🔒</span>
          <span className="text-[12px] font-semibold" style={{ color: "#6B3414" }}>
            View only — your limit is {limitDays} day{limitDays === 1 ? "" : "s"} back. You can see this date&apos;s data but can&apos;t change it.
          </span>
        </div>
      )}

      {loading ? (
        <div className="text-[#8A6F5C] text-sm">Loading…</div>
      ) : !section ? (
        <div className="text-[#8A6F5C] text-sm">No sections configured for this department.</div>
      ) : (
        <div className="space-y-2">
          {filteredItems.map((it) => {
            const key = `${it.name}||${section.name}`;
            const existing = entries[key];
            const hasActive = !!existing?.hasActive;
            const hasPending = pending[it.name] !== undefined;
            const prefill = hasPending ? pending[it.name] : "";

            return (
              <div key={it.id} className="bg-white border-[1.5px] rounded-2xl px-3.5 py-3" style={{ borderColor: hasPending ? "#E0A030" : "#EADFCB" }}>
                <div className="flex justify-between items-center gap-2.5 mb-2">
                  <span className="text-sm font-bold">{it.name}</span>
                  <span className="text-[11px] text-[#8A6F5C]">{it.unit}</span>
                </div>
                {hasActive ? (
                  <div className="flex items-center justify-between bg-teal-50 rounded-xl px-3 py-2.5">
                    <div>
                      <span className="text-lg font-extrabold text-[#1E7F72]">{existing.qty}</span>
                      <div className="text-[10px] text-[#8A6F5C]">by {existing.enteredBy} · {existing.createdAt}</div>
                    </div>
                    {!viewOnly && (
                      <Btn variant="danger" onClick={() => { setVoidTarget({ entryId: existing.entryId, itemName: it.name, sectionName: section.name, qty: existing.qty }); setVoidReason(""); }}>
                        Void
                      </Btn>
                    )}
                  </div>
                ) : viewOnly ? (
                  <div className="w-full h-11 rounded-xl flex items-center justify-center text-[13px] font-semibold bg-[#FBF5EA] text-[#8A6F5C]" style={{ border: "1px solid #EADFCB" }}>
                    🔒 View only — no entry on this date
                  </div>
                ) : (
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={prefill}
                    onChange={(e) => setQty(it.name, e.target.value)}
                    placeholder="0"
                    className="w-full h-11 border-[1.5px] rounded-xl px-3 text-lg font-extrabold text-center bg-[#FBF5EA] focus:outline-none focus:border-[#E0A030]"
                    style={{ borderColor: hasPending ? "#E0A030" : "#EADFCB", background: hasPending ? "#FFF7E9" : "#FBF5EA" }}
                  />
                )}
              </div>
            );
          })}
          {!filteredItems.length && <div className="text-[#8A6F5C] text-sm">No items found.</div>}
        </div>
      )}

      {Object.keys(pending).length > 0 && (
        <div className="fixed left-0 right-0 bottom-0 z-40 flex justify-center px-4 pb-4">
          <div className="w-full max-w-md bg-gradient-to-br from-[#1E7F72] to-[#155F55] rounded-2xl px-4 py-3 flex items-center justify-between gap-3 shadow-2xl">
            <span className="text-white/90 text-xs font-medium">{Object.keys(pending).length} item(s) ready to save</span>
            <button
              onClick={saveAll}
              disabled={saving}
              style={{ background: "#E0A030", color: "#3B2417" }}
              className="font-extrabold text-sm rounded-xl px-5 py-2.5 disabled:opacity-60 cursor-pointer"
            >
              {saving ? "Saving…" : "Save all"}
            </button>
          </div>
        </div>
      )}

      {voidTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[300]" onClick={() => setVoidTarget(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold mb-1">Void this entry?</h3>
            <p className="text-[13px] text-[#8A6F5C] mb-3">
              <b>{voidTarget.itemName}</b> · {voidTarget.sectionName} · qty <b>{voidTarget.qty}</b>
            </p>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Reason for voiding (required)…"
              rows={3}
              className="w-full border-[1.5px] border-[#EADFCB] rounded-xl px-3 py-2.5 text-sm bg-[#FBF5EA] focus:outline-none focus:border-[#C0463F] resize-none"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <Btn variant="ghost" onClick={() => setVoidTarget(null)}>Cancel</Btn>
              <Btn variant="danger" onClick={confirmVoid} disabled={!voidReason.trim()}>Void entry</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
