"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { rpc, bootstrap } from "@/lib/api";
import { SessionUser, MasterData, DeptSection, EntryRow, SECTION_COLORS, SECTION_ICONS } from "@/lib/types";
import ReconciliationView from "../components/ReconciliationView";
import BulkUploadButton from "../components/BulkUploadButton";

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function shiftDate(dateStr: string, delta: number) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
function displayDateLong(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${String(d).padStart(2, "0")}-${String(m).padStart(2, "0")}-${y}`;
}
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// "Sunday, 18 October 2026" — built by hand so server and browser always agree.
function displayDateFull(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const wd = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${wd}, ${d} ${MONTHS[m - 1]} ${y}`;
}

// Tiny line icons (inline SVG, inherit text colour)
type IconProps = { size?: number };
const svgProps = (size = 16) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true });
const IconEntry = ({ size }: IconProps) => (<svg {...svgProps(size)}><path d="M9 4h6l1 2h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h2z" /><path d="M9 12h6M9 16h4" /></svg>);
const IconReview = ({ size }: IconProps) => (<svg {...svgProps(size)}><path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7z" /><path d="M14 3v4h4M9 13h6M9 17h4" /></svg>);
const IconCalendar = ({ size }: IconProps) => (<svg {...svgProps(size)}><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg>);
const IconChevron = ({ size }: IconProps) => (<svg {...svgProps(size)}><path d="m6 9 6 6 6-6" /></svg>);
const IconSearch = ({ size }: IconProps) => (<svg {...svgProps(size)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>);
const IconSliders = ({ size }: IconProps) => (<svg {...svgProps(size)}><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg>);

const CHIP_IDLE: React.CSSProperties = { background: "#F5E6D0", border: "1.5px solid #EBD7BA", color: "#4A2A12" };
const CHIP_ACTIVE: React.CSSProperties = { background: "#6B3414", border: "1.5px solid #6B3414", color: "#FFFFFF" };
const PILL_IDLE: React.CSSProperties = { background: "#FFFDF8", border: "1.5px solid #EBD7BA", color: "#5A3A22" };

export default function DeptApp({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [master, setMaster] = useState<MasterData | null>(null);
  const [deptSections, setDeptSections] = useState<DeptSection[]>([]);
  const [date, setDate] = useState(todayLocal());
  const [entries, setEntries] = useState<Record<string, EntryRow>>({});
  const [opening, setOpening] = useState<Record<string, number>>({});
  const [sectionIdx, setSectionIdx] = useState(0);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [dayLocked, setDayLocked] = useState(false);
  const [editWindow, setEditWindow] = useState<number | null>(null); // dept's back-date edit days (for the view-only message)
  const [voidTarget, setVoidTarget] = useState<{ entryId: string; itemName: string; sectionName: string; qty: number } | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);
  const [historyOpenKey, setHistoryOpenKey] = useState<string | null>(null);
  const [view, setView] = useState<"entry" | "review">("entry");
  // UI-only state for the new header menu + the item status filter (default "all" = unchanged list)
  const [menuOpen, setMenuOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "saved">("all");

  const showToast = useCallback((msg: string, err?: boolean) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 2400);
  }, []);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    const res = await bootstrap(d);
    if (res.ok) {
      setMaster(res.master);
      setDeptSections(res.deptSections || []);
      const map: Record<string, EntryRow> = {};
      (res.entries || []).forEach((e: EntryRow) => (map[`${e.itemName}||${e.sectionName}`] = e));
      setEntries(map);
      setOpening(res.openingSuggestions || {});
      setDayLocked(!!res.locked);
      setEditWindow(typeof res.backDateEditDays === "number" ? res.backDateEditDays : null);
    }
    setLoading(false);
  }, []);

   useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deptItems = useMemo(() => {
    if (!master) return [];
    return master.items
      .filter((i) => {
        const ids = String(i.deptId || "").split(",").map((x) => x.trim()).filter(Boolean);
        return ids.length === 0 || ids.includes(user.departmentId);
      })
      .sort((a, b) => a.order - b.order);
  }, [master, user.departmentId]);

  const catName = useCallback(
    (catId: string) => master?.categories.find((c) => c.id === catId)?.name || "",
    [master]
  );

  const section = deptSections[sectionIdx];
  const sectionPending = pending[section?.name || ""] || {};

  const filteredItems = useMemo(() => {
    const s = search.trim().toLowerCase();
    return deptItems.filter((i) => {
      if (s && !i.name.toLowerCase().includes(s)) return false;
      if (statusFilter === "all" || !section) return true;
      const saved = !!entries[`${i.name}||${section.name}`]?.hasActive;
      return statusFilter === "saved" ? saved : !saved;
    });
  }, [deptItems, search, statusFilter, entries, section]);

  // ---- Layering department only: group the item list by Category, with
  // a colored band header per category (matches the "Evening / Night /
  // Finished Cakes" style sheet this department already uses). Every
  // other department keeps the existing flat list — nothing else about
  // entry/save/void logic changes for anyone.
  const currentDeptName = useMemo(
    () => master?.departments.find((d) => d.id === user.departmentId)?.name || "",
    [master, user.departmentId]
  );
  const isLayeringDept = currentDeptName.trim().toLowerCase().includes("layering");

  const groupedByCategory = useMemo(() => {
    if (!isLayeringDept) return null;
    const groups: { catId: string; catName: string; order: number; items: typeof filteredItems }[] = [];
    const byId: Record<string, (typeof groups)[number]> = {};
    filteredItems.forEach((it) => {
      const cat = master?.categories.find((c) => c.id === it.catId);
      const key = it.catId || "uncategorized";
      if (!byId[key]) {
        const g = { catId: key, catName: cat?.name || "Other", order: cat?.order ?? 999, items: [] as typeof filteredItems };
        byId[key] = g;
        groups.push(g);
      }
      byId[key].items.push(it);
    });
    return groups.sort((a, b) => a.order - b.order);
  }, [isLayeringDept, filteredItems, master]);

  const totalFilled = useMemo(() => {
    if (!section) return 0;
    return deptItems.filter((i) => entries[`${i.name}||${section.name}`]?.hasActive).length;
  }, [deptItems, entries, section]);

  function setQty(itemName: string, value: string) {
    setPending((prev) => {
      const secName = section.name;
      const next = { ...prev, [secName]: { ...(prev[secName] || {}) } };
      if (value === "") delete next[secName][itemName];
      else next[secName][itemName] = value;
      return next;
    });
  }

  function openVoidModal(entryId: string, itemName: string, sectionName: string, qty: number) {
    setVoidTarget({ entryId, itemName, sectionName, qty });
    setVoidReason("");
  }

  async function confirmVoid() {
    if (!voidTarget) return;
    const reason = voidReason.trim();
    if (!reason) {
      showToast("A reason is required to void this entry", true);
      return;
    }
    setVoiding(true);
    const res = await rpc("voidEntry", { entryId: voidTarget.entryId, reason });
    setVoiding(false);
    if (!res.ok) {
      showToast(res.error, true);
      return;
    }
    showToast("Entry voided — enter the corrected quantity");
    setVoidTarget(null);
    setVoidReason("");
    await load(date);
  }

  async function saveAll() {
    const names = Object.keys(sectionPending);
    if (!names.length) return;
    if (dayLocked) {
      showToast("This date is locked and can no longer be edited", true);
      return;
    }
    const list = names.map((itemName) => {
      const it = deptItems.find((x) => x.name === itemName)!;
      return {
        departmentId: user.departmentId,
        itemName,
        category: catName(it.catId),
        sectionName: section.name,
        qty: parseFloat(sectionPending[itemName]),
        date,
      };
    });
    if (list.some((e) => isNaN(e.qty) || e.qty < 0)) {
      showToast("Fix the quantity before saving", true);
      return;
    }
    setSaving(true);
    const res = await rpc<{ savedCount: number }>("saveBulkEntries", { entries: list });
    setSaving(false);
    if (!res.ok) {
      showToast(res.error, true);
      return;
    }
    setPending((prev) => ({ ...prev, [section.name]: {} }));
    showToast(`Saved ${list.length} item${list.length > 1 ? "s" : ""}`);
    await load(date);
  }

  async function changeDate(requested: string) {
    // Dates after today are never allowed — clamp to today.
    const newDate = requested && requested > todayLocal() ? todayLocal() : requested;
    setDate(newDate);
    setPending({});
    await load(newDate);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  if (loading || !master) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[#8C7358] text-sm">Loading…</div>
    );
  }

  const color = section ? SECTION_COLORS[section.name] || "#1F3A5F" : "#1F3A5F";

  const SECTION_DARK_ACTIVE: Record<string, string> = {
    Opening: "#D9752E",
    Production: "#2E9E5B",
    "KOT Transfer": "#2E6DAE",
    Transfer: "#7A4FB0",
    Wastage: "#C0463F",
  };
  const activeColor = section ? SECTION_DARK_ACTIVE[section.name] || "#2E9E5B" : "#2E9E5B";

  const initial = user.name?.[0]?.toUpperCase() || "U";
  const filterActive = statusFilter !== "all";

  return (
    <div className="min-h-screen pb-28" style={{ background: "var(--bg)" }}>
      <div className="max-w-3xl mx-auto sm:px-4 sm:pt-3">
        {/* ===== Brand header ===== */}
        <header
          className="px-5 pt-5 pb-10 sm:rounded-t-[28px] relative overflow-hidden"
          style={{ background: "linear-gradient(160deg,#1E0F06 0%,#3A1E0A 60%,#C75B0C 150%)" }}
        >
          {/* Glow decoration */}
          <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle,rgba(232,115,26,0.25),transparent)" }} />
          <div className="flex items-center gap-4 relative">
            <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 shadow-lg" style={{ background: "linear-gradient(135deg,#F28C38,#C75B0C)" }}>
              <img src="https://lh3.googleusercontent.com/d/1XNpcNjDPcpFxIoDjHMhoWOYAJtqQWshj=w128-h128" alt="" className="w-full h-full object-cover" />
            </div>
            <div className="w-px self-stretch my-1 flex-shrink-0" style={{ background: "rgba(255,255,255,0.2)" }} />
            <div className="min-w-0 flex-1">
              <div className="text-white font-black text-[17px] leading-tight truncate">Creme Castle</div>
              <div className="text-[12px] mt-0.5 truncate font-semibold" style={{ color: "rgba(255,255,255,0.65)" }}>{user.name} · {displayDateFull(date)}</div>
            </div>
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-1.5 cursor-pointer"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Account menu"
              >
                <span className="w-9 h-9 rounded-full flex items-center justify-center text-[14px] font-black text-white" style={{ background: "rgba(255,255,255,0.15)", border: "1.5px solid rgba(255,255,255,0.3)" }}>
                  {initial}
                </span>
                <IconChevron size={14} />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-11 z-50 w-52 rounded-2xl p-1.5 shadow-2xl" style={{ background: "var(--surface)", border: "1px solid var(--line)" }}>
                    <div className="px-3 py-2 text-[12px] font-bold truncate" style={{ color: "var(--ink)" }}>{user.name}</div>
                    <div className="h-px mx-2 mb-1" style={{ background: "var(--line)" }} />
                    <button
                      onClick={logout}
                      className="w-full text-left rounded-xl px-3 py-2 text-[13px] font-bold cursor-pointer"
                      style={{ color: "var(--red)" }}
                    >
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* ===== Sticky toolbar ===== */}
        <div
          className="sticky top-0 z-30 -mt-5 rounded-t-[26px] px-4 pt-4 pb-3"
          style={{ background: "var(--bg)", boxShadow: "0 6px 20px -10px rgba(78,37,14,0.20)" }}
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <button
              onClick={() => setView("entry")}
              style={view === "entry" ? CHIP_ACTIVE : CHIP_IDLE}
              className="h-10 rounded-xl px-2.5 text-[12.5px] font-bold cursor-pointer flex items-center gap-1.5"
            >
              <IconEntry size={15} /> Entry
            </button>
            <button
              onClick={() => setView("review")}
              style={view === "review" ? CHIP_ACTIVE : CHIP_IDLE}
              className="h-10 rounded-xl px-2.5 text-[12.5px] font-bold cursor-pointer flex items-center gap-1.5"
            >
              <IconReview size={15} /> Review
            </button>

            {view === "entry" && (
              <>
                <div className="flex items-center gap-0.5 sm:ml-auto">
                  <button
                    onClick={() => changeDate(shiftDate(date, -1))}
                    style={CHIP_IDLE}
                    className="w-6 h-10 rounded-lg flex items-center justify-center text-base cursor-pointer"
                    aria-label="Previous day"
                  >
                    ‹
                  </button>
                  <label style={CHIP_IDLE} className="relative h-10 rounded-xl px-2 flex items-center gap-1 text-[12px] font-bold cursor-pointer">
                    <IconCalendar size={15} />
                    <span>{displayDateLong(date)}</span>
                    <IconChevron size={14} />
                    <input
                      type="date"
                      value={date}
                      max={todayLocal()}
                      onChange={(e) => changeDate(e.target.value)}
                      onClick={(e) => {
                        try {
                          e.currentTarget.showPicker?.();
                        } catch {
                          /* browsers without showPicker still open their own picker */
                        }
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      aria-label="Select date"
                    />
                  </label>
                  <button
                    onClick={() => changeDate(shiftDate(date, 1))}
                    disabled={date >= todayLocal()}
                    style={CHIP_IDLE}
                    className="w-6 h-10 rounded-lg flex items-center justify-center text-base cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
                    aria-label="Next day"
                  >
                    ›
                  </button>
                </div>
                {section && (
                  <BulkUploadButton
                    sectionName={section.name}
                    isSystemStock={section.name === "In Hand"}
                    items={deptItems}
                    categories={master?.categories.filter((c) => c.deptId === user.departmentId) || []}
                    onUploaded={() => load(date)}
                    showToast={showToast}
                  />
                )}
              </>
            )}
          </div>

          {view === "entry" && (
            <>
              {/* Search + filter */}
              <div className="flex items-center gap-2 mt-3">
                <div className="relative flex-1 min-w-0">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#4A2A12" }}>
                    <IconSearch size={18} />
                  </span>
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search item…"
                    className="w-full h-11 rounded-2xl pl-10 pr-3 text-[14px] focus:outline-none"
                    style={{ background: "var(--surface)", border: "1.5px solid var(--line)", color: "var(--ink)" }}
                  />
                </div>
                <div className="relative flex-shrink-0">
                  <button
                    onClick={() => setFilterOpen((v) => !v)}
                    style={CHIP_IDLE}
                    className="relative w-11 h-11 rounded-2xl flex items-center justify-center cursor-pointer"
                    aria-label="Filter items"
                    aria-expanded={filterOpen}
                  >
                    <IconSliders size={18} />
                    {filterActive && <span className="absolute top-2 right-2 w-2 h-2 rounded-full" style={{ background: "#E8731A" }} />}
                  </button>
                  {filterOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setFilterOpen(false)} />
                      <div className="absolute right-0 top-12 z-50 w-44 rounded-2xl p-1.5 shadow-xl" style={{ background: "#FFFDF8", border: "1px solid #EADBC4" }}>
                        <div className="px-3 pt-1.5 pb-1 text-[10px] font-bold tracking-wider uppercase" style={{ color: "#8C7358" }}>Show items</div>
                        {([["all", "All items"], ["pending", "Pending only"], ["saved", "Saved only"]] as const).map(([val, label]) => (
                          <button
                            key={val}
                            onClick={() => { setStatusFilter(val); setFilterOpen(false); }}
                            className="w-full text-left rounded-xl px-3 py-2 text-[13px] font-bold cursor-pointer flex items-center justify-between"
                            style={statusFilter === val ? { background: "#6B3414", color: "#FFFFFF" } : { color: "#3A2414" }}
                          >
                            {label}
                            {statusFilter === val && <span>✓</span>}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Section pills */}
              <div className="cc-hide-scroll flex gap-2 overflow-x-auto mt-3 -mx-4 px-4 pb-0.5">
                {deptSections.map((s, idx) => (
                  <button
                    key={s.id}
                    onClick={() => setSectionIdx(idx)}
                    style={idx === sectionIdx ? CHIP_ACTIVE : PILL_IDLE}
                    className="flex-shrink-0 flex items-center gap-1.5 rounded-xl px-3.5 h-10 text-[13px] font-bold cursor-pointer whitespace-nowrap"
                  >
                    <span className="text-[14px] leading-none">{SECTION_ICONS[s.name] || "•"}</span>
                    {s.displayName}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {view === "review" && (
          <div className="px-4 pt-2">
            <div className="card p-4">
              <ReconciliationView
                role="Department User"
                departments={[]}
                categories={master?.categories.filter((c) => c.deptId === user.departmentId) || []}
                items={deptItems}
                lockDepartmentId={user.departmentId}
                showToast={showToast}
              />
            </div>
          </div>
        )}

        {view === "entry" && (
        <div>
          <div className="overflow-hidden">
            {dayLocked && (
              <div className="mx-4 mt-3 flex items-center gap-2 px-4 py-3 rounded-xl" style={{ background: "var(--amber-bg)", border: "1px solid rgba(217,154,26,0.3)" }}>
                <span className="text-base flex-shrink-0">🔒</span>
                <span className="text-[12.5px] font-semibold" style={{ color: "var(--amber)" }}>
                  {editWindow !== null
                    ? `View only — entries can be edited up to ${editWindow} day${editWindow === 1 ? "" : "s"} back.`
                    : "View only — this date is outside your edit window."}
                </span>
              </div>
            )}

            {/* Section label bar */}
            <div className="mx-4 mt-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">🛍️</span>
                <span className="text-[15px] font-bold" style={{ color: "var(--ink)" }}>{section?.displayName} Items</span>
              </div>
            </div>

            {/* Item rows */}
            <div className="mx-4 mt-3 mb-4 space-y-3">
              {(() => {
                const renderItem = (it: (typeof filteredItems)[number]) => {
                  const key = `${it.name}||${section?.name}`;
                  const existing = entries[key];
                  const hasActive = !!existing?.hasActive;
                  const hasPending = sectionPending[it.name] !== undefined;
                  const isOpeningSuggestion = section?.name === "Opening" && !hasActive && opening[it.name] !== undefined;
                  const prefill = hasPending ? sectionPending[it.name] : isOpeningSuggestion ? String(opening[it.name]) : "";
                  const historyOpen = historyOpenKey === key;
                  const canEditThisItem = !dayLocked;

                  return (
                    <div key={it.id} className="card p-3.5 transition hover:shadow-md">
                      {/* Item name row */}
                      <div className="flex items-start justify-between gap-2 mb-2.5">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0" style={{ background: "var(--brand-light)" }}>
                            🧁
                          </div>
                          <div className="min-w-0">
                            <div className="text-[13.5px] font-bold leading-snug" style={{ color: "var(--ink)" }}>{it.name}</div>
                            <div className="text-[11px]" style={{ color: "var(--ink-3)" }}>{catName(it.catId)} · {it.unit}</div>
                            {existing?.isCorrection && (
                              <span className="badge badge-amber mt-1">Voided history</span>
                            )}
                          </div>
                        </div>
                        {hasActive ? (
                          <span className="badge badge-green badge-dot">Saved</span>
                        ) : !canEditThisItem ? (
                          <span className="text-[11px] font-bold flex-shrink-0" style={{ color: "var(--ink-3)" }}>🔒 Locked</span>
                        ) : (
                          <span className="badge badge-amber badge-dot">Pending</span>
                        )}
                      </div>

                      {/* Qty box */}
                      {canEditThisItem ? (
                        <div className="relative">
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            value={hasActive ? existing.qty : prefill}
                            readOnly={hasActive}
                            onChange={(e) => !hasActive && setQty(it.name, e.target.value)}
                            placeholder="0"
                            className="w-full h-12 rounded-xl px-4 text-xl font-extrabold text-center focus:outline-none"
                            style={{
                              background: hasActive ? "var(--green-bg)" : "var(--surface-2)",
                              border: `1.5px solid ${hasActive ? "var(--green)" : "var(--line)"}`,
                              color: hasActive ? "var(--green)" : "var(--ink)",
                            }}
                          />
                          {isOpeningSuggestion && !hasPending && (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "#F5E6D0", color: "#6B3414" }}>Auto</span>
                          )}
                        </div>
                      ) : hasActive ? (
                        <div className="w-full h-12 rounded-xl flex items-center justify-center text-xl font-extrabold" style={{ background: "#E3F5EC", border: "1.5px solid #B9E6CE", color: "#1E8F5F" }}>
                          {existing.qty}
                        </div>
                      ) : (
                        <div className="w-full h-12 rounded-xl flex items-center justify-center text-[13px] font-semibold" style={{ background: "#F6ECDC", border: "1px solid #E6D6BE", color: "#8C7358" }}>
                          🔒 View only — no entry on this date
                        </div>
                      )}

                      {/* Meta row — qty badge + saved time + void */}
                      {hasActive && (
                        <div className="flex items-center justify-between mt-2.5 gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="text-[10.5px] font-bold px-2 py-1 rounded-md whitespace-nowrap flex-shrink-0"
                              style={{ background: "#F5E6D0", color: "#6B3414" }}
                            >
                              Qty: {existing.qty}
                            </span>
                            <span className="text-[10.5px] font-bold truncate" style={{ color: "#1E8F5F" }}>✓ by {existing.enteredBy} · {existing.createdAt}</span>
                          </div>
                          {canEditThisItem && (
                            <button
                              onClick={() => openVoidModal(existing.entryId, it.name, section.name, existing.qty)}
                              className="text-[10.5px] font-bold px-2.5 py-1 rounded-md cursor-pointer whitespace-nowrap flex-shrink-0"
                              style={{ color: "#FFFFFF", background: "#C0273F" }}
                            >
                              🗑 Void
                            </button>
                          )}
                        </div>
                      )}

                      {existing && existing.history.length > 0 && (
                        <div className="mt-2">
                          <button
                            onClick={() => setHistoryOpenKey(historyOpen ? null : key)}
                            className="text-[10.5px] font-bold cursor-pointer"
                            style={{ color: "#6B3414" }}
                          >
                            {historyOpen ? "Hide" : "Show"} history ({existing.history.length})
                          </button>
                          {historyOpen && (
                            <div className="mt-1.5 space-y-1.5">
                              {existing.history.map((h) => (
                                <div key={h.entryId} className="text-[11px] rounded-lg px-2.5 py-2" style={{ background: "#FAF2E4" }}>
                                  <span
                                    className="font-bold"
                                    style={{ color: h.status === "Void" ? "#C0273F" : "#2E1B0E", textDecoration: h.status === "Void" ? "line-through" : "none" }}
                                  >
                                    {h.qty}
                                  </span>
                                  <span className="text-[#8C7358]"> · by {h.enteredBy} · {h.createdAt}</span>
                                  {h.status === "Void" && h.voidReason && (
                                    <div className="mt-0.5" style={{ color: "#C0273F" }}>Voided: {h.voidReason}</div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                };

                if (isLayeringDept && groupedByCategory) {
                  return groupedByCategory.map((g) => (
                    <div key={g.catId}>
                      <div
                        className="rounded-lg px-3 py-2 mb-3 text-center text-[12.5px] font-extrabold tracking-wide"
                        style={{ background: "#E8C9A0", color: "#4A2E06" }}
                      >
                        {`<<<<< ${g.catName} >>>>>`}
                      </div>
                      <div className="space-y-3 mb-4">{g.items.map((it) => renderItem(it))}</div>
                    </div>
                  ));
                }
                return filteredItems.map((it) => renderItem(it));
              })()}
              {filteredItems.length === 0 && (
                <div className="px-3.5 py-6 text-center text-[12.5px] rounded-2xl" style={{ background: "#FFFDF8", border: "1px solid #EADBC4", color: "#8C7358" }}>
                  No items found.
                </div>
              )}
            </div>

            {/* Bottom stats bar */}
            <div className="mx-4 mb-4 rounded-2xl px-4 py-3.5 flex items-center justify-between gap-3" style={{ background: "#FFFDF8", border: "1px solid #EADBC4" }}>
              <div className="flex items-center gap-4">
                <div>
                  <div className="text-[16px] font-extrabold text-[#2E1B0E]">{deptItems.length}</div>
                  <div className="text-[9.5px] text-[#8C7358]">Total items</div>
                </div>
                <div>
                  <div className="text-[16px] font-extrabold" style={{ color: "#1E8F5F" }}>{totalFilled}</div>
                  <div className="text-[9.5px] text-[#8C7358]">Filled</div>
                </div>
                <div>
                  <div className="text-[16px] font-extrabold" style={{ color: "#6B3414" }}>{deptItems.length - totalFilled}</div>
                  <div className="text-[9.5px] text-[#8C7358]">Remaining</div>
                </div>
              </div>
              <button
                onClick={saveAll}
                disabled={saving || Object.keys(sectionPending).length === 0}
                className="font-extrabold text-[13px] rounded-xl px-5 py-2.5 disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
                style={{ background: "#6B3414", color: "#fff" }}
              >
                💾 {saving ? "Saving…" : `Save entry${Object.keys(sectionPending).length > 1 ? " (" + Object.keys(sectionPending).length + ")" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4.5 py-2.5 rounded-xl text-sm font-semibold z-50"
          style={{ background: toast.err ? "#C0273F" : "#FFFFFF", border: toast.err ? "none" : "1px solid #EADBC4", color: toast.err ? "#fff" : "#2E1B0E" }}
        >
          {toast.msg}
        </div>
      )}

      {voidTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[300]" onClick={() => (!voiding ? setVoidTarget(null) : null)}>
          <div className="rounded-2xl p-6 w-full max-w-sm" style={{ background: "#FFFDF8", border: "1px solid #EADBC4" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold mb-1 text-[#2E1B0E]">Void this entry?</h3>
            <p className="text-[13px] text-[#7A6149] mb-3">
              <b className="text-[#2E1B0E]">{voidTarget.itemName}</b> · {voidTarget.sectionName} · current qty <b className="text-[#2E1B0E]">{voidTarget.qty}</b>
              <br />This entry stays visible in history. A reason is required.
            </p>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Reason for voiding (required)…"
              rows={3}
              className="w-full rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none"
              style={{ background: "#FAF2E4", border: "1.5px solid #E6D6BE", color: "#2E1B0E" }}
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setVoidTarget(null)}
                disabled={voiding}
                className="rounded-lg px-4 py-2 text-sm font-bold cursor-pointer"
                style={{ border: "1px solid #E6D6BE", background: "#FFFFFF", color: "#2E1B0E" }}
              >
                Cancel
              </button>
              <button
                onClick={confirmVoid}
                disabled={voiding || !voidReason.trim()}
                className="rounded-lg px-4 py-2 text-sm font-bold cursor-pointer disabled:opacity-50"
                style={{ background: "#C0273F", color: "#FFFFFF" }}
              >
                {voiding ? "Voiding…" : "Void entry"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
