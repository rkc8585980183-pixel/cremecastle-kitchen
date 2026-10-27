"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { rpc } from "@/lib/api";
import { Department, Category, Item, MovementDef, ReconciliationRow, ReconciliationSummary } from "@/lib/types";

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  MATCHED: { bg: "#E7F6F2", color: "#1E7F72", label: "Matched" },
  SHORT: { bg: "#FDECEA", color: "#C0463F", label: "Short" },
  EXCESS: { bg: "#FFF6E5", color: "#B08A1E", label: "Excess" },
};

const STATUS_HEX: Record<string, string> = { MATCHED: "#1E7F72", SHORT: "#C0463F", EXCESS: "#B08A1E" };
const CATEGORY_HEX = ["#D85A30", "#378ADD", "#1D9E75", "#B08A1E", "#7F77DD", "#D4537E"];

type Props = {
  role: "Admin" | "Department User";
  departments: Department[];
  categories: Category[];
  items: Item[];
  /** Department users are locked to their own department — no picker shown. */
  lockDepartmentId?: string;
  showToast: (msg: string, err?: boolean) => void;
};
export default function ReconciliationView({ departments, categories, items, lockDepartmentId, showToast }: Props) {
  const [from, setFrom] = useState(todayLocal());
  const [to, setTo] = useState(todayLocal());
  const [deptId, setDeptId] = useState(lockDepartmentId || "");
  const [catId, setCatId] = useState("");
  const [itemId, setItemId] = useState("");
  const [movementId, setMovementId] = useState("");
  const [rows, setRows] = useState<ReconciliationRow[]>([]);
  const [movements, setMovements] = useState<MovementDef[]>([]);
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [drill, setDrill] = useState<ReconciliationRow | null>(null);

  const filteredCategories = useMemo(
    () => (deptId ? categories.filter((c) => c.deptId === deptId) : categories),
    [categories, deptId]
  );
  const filteredItems = useMemo(
    () =>
      items.filter((i) => {
        const ids = String(i.deptId || "").split(",").map((x) => x.trim()).filter(Boolean);
        const deptOk = !deptId || ids.length === 0 || ids.includes(deptId);
        return deptOk && (!catId || i.catId === catId);
      }),
    [items, deptId, catId]
  );

  const run = useCallback(async () => {
    setLoading(true);
    const res = await rpc<{ rows: ReconciliationRow[]; movements: MovementDef[]; summary: ReconciliationSummary }>(
      "getReconciliationReport",
      { fromDate: from, toDate: to, departmentId: deptId || undefined, categoryId: catId || undefined, itemId: itemId || undefined, movementSectionId: movementId || undefined }
    );
    setLoading(false);
    if (!res.ok) { showToast(res.error, true); return; }
    setRows(res.rows);
    setMovements(res.movements);
    setSummary(res.summary);
  }, [from, to, deptId, catId, itemId, movementId, showToast]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { run(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Chart data, derived purely from what's already loaded — no extra API calls ----
  const statusChartData = useMemo(() => {
    if (!summary) return [];
    return [
      { name: "Matched", value: summary.matched, key: "MATCHED" },
      { name: "Short", value: summary.short, key: "SHORT" },
      { name: "Excess", value: summary.excess, key: "EXCESS" },
    ].filter((d) => d.value > 0);
  }, [summary]);

  const topVarianceData = useMemo(() => {
    return [...rows]
      .filter((r) => r.variance !== 0)
      .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
      .slice(0, 5)
      .map((r) => ({ name: r.itemName.length > 16 ? r.itemName.slice(0, 15) + "…" : r.itemName, variance: r.variance }));
  }, [rows]);

  const categoryVarianceData = useMemo(() => {
    const byCat: Record<string, number> = {};
    rows.forEach((r) => {
      byCat[r.categoryName || "Uncategorized"] = (byCat[r.categoryName || "Uncategorized"] || 0) + r.variance;
    });
    return Object.entries(byCat)
      .filter(([, v]) => v !== 0)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 6)
      .map(([name, value]) => ({ name, value: Math.abs(value) }));
  }, [rows]);

  function exportCsv() {
    if (!rows.length) { showToast("Run a report first", true); return; }
    const header = ["Item", "Category", "Department", "Opening", ...movements.map((m) => `${m.name} (${m.sign})`), "Expected", "Actual", "Variance", "Status"];
    const body = rows.map((r) => [
      r.itemName, r.categoryName, r.departmentName, r.opening,
      ...movements.map((m) => r.movements[m.id] ?? 0),
      r.expected, r.actual, r.variance, r.status,
    ]);
    const csv = [header, ...body].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "stock_reconciliation.csv";
    a.click();
  }

  return (
    <div>
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-5">
          {[
            { label: "Total items", value: summary.totalItems },
            { label: "Expected", value: summary.expected },
            { label: "Actual", value: summary.actual },
            { label: "Variance", value: summary.variance },
            { label: "Matched", value: summary.matched, color: "#1E7F72" },
            { label: "Short", value: summary.short, color: "#C0463F" },
            { label: "Excess", value: summary.excess, color: "#B08A1E" },
          ].map((s) => (
            <div key={s.label} className="bg-white border border-[#E2E7E4] rounded-2xl p-4">
              <div className="text-xl font-extrabold" style={{ color: s.color || "#142845" }}>{s.value}</div>
              <div className="text-[11.5px] font-semibold text-[#6B7876]">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {summary && (rows.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
          <div className="bg-white border border-[#E2E7E4] rounded-2xl p-4">
            <h4 className="text-[12.5px] font-bold mb-2">Item status summary</h4>
            <div className="flex items-center gap-3">
              <ResponsiveContainer width={110} height={110}>
                <PieChart>
                  <Pie data={statusChartData} dataKey="value" nameKey="name" innerRadius={30} outerRadius={50} paddingAngle={2}>
                    {statusChartData.map((d) => <Cell key={d.key} fill={STATUS_HEX[d.key]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="text-[11px] flex-1 min-w-0">
                {statusChartData.map((d) => (
                  <div key={d.key} className="flex items-center gap-1.5 mb-1">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STATUS_HEX[d.key] }} />
                    <span className="truncate">{d.name} {d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#E2E7E4] rounded-2xl p-4">
            <h4 className="text-[12.5px] font-bold mb-2">Top variance (top 5 items)</h4>
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={topVarianceData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 9.5 }} interval={0} angle={-20} textAnchor="end" height={40} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="variance" radius={[4, 4, 0, 0]}>
                  {topVarianceData.map((d, i) => <Cell key={i} fill={d.variance < 0 ? "#C0463F" : "#B08A1E"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white border border-[#E2E7E4] rounded-2xl p-4">
            <h4 className="text-[12.5px] font-bold mb-2">Category-wise variance</h4>
            <div className="flex items-center gap-3">
              <ResponsiveContainer width={100} height={100}>
                <PieChart>
                  <Pie data={categoryVarianceData} dataKey="value" nameKey="name" outerRadius={48}>
                    {categoryVarianceData.map((d, i) => <Cell key={d.name} fill={CATEGORY_HEX[i % CATEGORY_HEX.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="text-[11px] flex-1 min-w-0">
                {categoryVarianceData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-1.5 mb-1">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: CATEGORY_HEX[i % CATEGORY_HEX.length] }} />
                    <span className="truncate">{d.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-[#E2E7E4] rounded-2xl p-5 mb-5">
        <div className="flex flex-wrap gap-2.5 items-end">
          <div>
            <label className="text-xs font-bold text-[#6B7876] block mb-1.5">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-[42px] border-[1.5px] border-[#E2E7E4] rounded-lg px-3 text-sm bg-[#FBFAF7]" />
          </div>
          <div>
            <label className="text-xs font-bold text-[#6B7876] block mb-1.5">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-[42px] border-[1.5px] border-[#E2E7E4] rounded-lg px-3 text-sm bg-[#FBFAF7]" />
          </div>
          {!lockDepartmentId && (
            <div>
              <label className="text-xs font-bold text-[#6B7876] block mb-1.5">Outlet / Department</label>
              <select value={deptId} onChange={(e) => { setDeptId(e.target.value); setCatId(""); setItemId(""); }} className="h-[42px] border-[1.5px] border-[#E2E7E4] rounded-lg px-3 text-sm bg-[#FBFAF7]">
                <option value="">All outlets</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs font-bold text-[#6B7876] block mb-1.5">Category</label>
            <select value={catId} onChange={(e) => { setCatId(e.target.value); setItemId(""); }} className="h-[42px] border-[1.5px] border-[#E2E7E4] rounded-lg px-3 text-sm bg-[#FBFAF7]">
              <option value="">All categories</option>
              {filteredCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-[#6B7876] block mb-1.5">Item</label>
            <select value={itemId} onChange={(e) => setItemId(e.target.value)} className="h-[42px] border-[1.5px] border-[#E2E7E4] rounded-lg px-3 text-sm bg-[#FBFAF7]">
              <option value="">All items</option>
              {filteredItems.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-[#6B7876] block mb-1.5">Movement</label>
            <select value={movementId} onChange={(e) => setMovementId(e.target.value)} className="h-[42px] border-[1.5px] border-[#E2E7E4] rounded-lg px-3 text-sm bg-[#FBFAF7]">
              <option value="">All movements</option>
              {movements.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <button onClick={run} disabled={loading} style={{ background: "#5B4FE0", color: "#fff" }} className="rounded-lg px-3.5 py-2 text-[12.5px] font-bold h-[42px] disabled:opacity-50">
            {loading ? "Loading…" : "🔎 Generate report"}
          </button>
          <button onClick={exportCsv} className="rounded-lg px-3.5 py-2 text-[12.5px] font-bold h-[42px] border border-[#E2E7E4] bg-white">
            ⬇️ Export CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto border border-[#E2E7E4] rounded-2xl bg-white">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr>
              {["Item", "Category", ...(lockDepartmentId ? [] : ["Outlet"]), "Opening", ...movements.map((m) => `${m.name} (${m.sign === "PLUS" ? "+" : "−"})`), "Expected", "Actual", "Variance", "Status"].map((h) => (
                <th key={h} className="bg-[#FBFAF7] text-left px-3 py-2.5 text-[#6B7876] text-[10.5px] uppercase tracking-wide border-b border-[#E2E7E4] whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const st = STATUS_STYLE[r.status];
              return (
                <tr key={r.itemId} className="border-b border-[#E2E7E4] hover:bg-[#FBFAF7] cursor-pointer" onClick={() => setDrill(r)}>
                  <td className="px-3 py-2.5 font-semibold">{r.itemName}</td>
                  <td className="px-3 py-2.5">{r.categoryName}</td>
                  {!lockDepartmentId && <td className="px-3 py-2.5">{r.departmentName}</td>}
                  <td className="px-3 py-2.5">{r.opening}</td>
                  {movements.map((m) => <td key={m.id} className="px-3 py-2.5">{r.movements[m.id] ?? 0}</td>)}
                  <td className="px-3 py-2.5 font-bold">{r.expected}</td>
                  <td className="px-3 py-2.5 font-bold">{r.actual}</td>
                  <td className="px-3 py-2.5 font-bold" style={{ color: r.variance === 0 ? "#1E7F72" : r.variance < 0 ? "#C0463F" : "#B08A1E" }}>
                    {r.variance > 0 ? `+${r.variance}` : r.variance}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-[11px] font-bold px-2 py-1 rounded-full" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                  </td>
                </tr>
              );
            })}
            {!rows.length && !loading && (
              <tr><td colSpan={20} className="px-3 py-6 text-center text-[#6B7876]">No items in range / filters. Try widening the date range or filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {drill && (
        <ItemHistoryModal row={drill} movements={movements} fromDate={from} toDate={to} onClose={() => setDrill(null)} />
      )}
    </div>
  );
}

type HistoryEntry = { date: string; dateKey: string; sectionName: string; qty: number; enteredBy: string; createdAt: string };

function ItemHistoryModal({ row, movements, fromDate, toDate, onClose }: { row: ReconciliationRow; movements: MovementDef[]; fromDate: string; toDate: string; onClose: () => void }) {
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    rpc<{ rows: HistoryEntry[] }>("getReconciliationItemHistory", { itemId: row.itemId, fromDate, toDate }).then((res) => {
      if (res.ok) setHistory(res.rows);
    });
  }, [row.itemId, fromDate, toDate]);

  const st = STATUS_STYLE[row.status];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[300]" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold">{row.itemName}</h3>
          <button onClick={onClose} className="text-xl leading-none cursor-pointer">✕</button>
        </div>
        <p className="text-[12.5px] text-[#6B7876] mb-4">{row.categoryName} · {row.departmentName} · {fromDate} → {toDate}</p>

        <div className="bg-[#FBFAF7] border border-[#E2E7E4] rounded-xl p-4 mb-4 text-[13px] space-y-1.5">
          <div className="flex justify-between"><span>Opening</span><span className="font-bold">{row.opening}</span></div>
          {movements.map((m) => (
            <div key={m.id} className="flex justify-between">
              <span>{m.name} ({m.sign === "PLUS" ? "+" : "−"})</span>
              <span className="font-bold">{row.movements[m.id] ?? 0}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-[#E2E7E4] pt-1.5 mt-1.5"><span className="font-bold">Expected</span><span className="font-bold">{row.expected}</span></div>
          <div className="flex justify-between"><span className="font-bold">Actual (In Hand)</span><span className="font-bold">{row.actual}</span></div>
          <div className="flex justify-between items-center">
            <span className="font-bold">Variance</span>
            <span className="text-[11px] font-bold px-2 py-1 rounded-full" style={{ background: st.bg, color: st.color }}>
              {row.variance > 0 ? `+${row.variance}` : row.variance} · {st.label}
            </span>
          </div>
        </div>

        <h4 className="text-[13px] font-bold mb-2">Movement history</h4>
        <div className="overflow-x-auto border border-[#E2E7E4] rounded-xl">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr>
                {["Date", "Section", "Qty", "By"].map((h) => (
                  <th key={h} className="bg-[#FBFAF7] text-left px-2.5 py-2 text-[10px] uppercase text-[#6B7876] border-b border-[#E2E7E4]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(history || []).map((h, i) => (
                <tr key={i} className="border-b border-[#E2E7E4]">
                  <td className="px-2.5 py-2">{h.date}</td>
                  <td className="px-2.5 py-2">{h.sectionName}</td>
                  <td className="px-2.5 py-2">{h.qty}</td>
                  <td className="px-2.5 py-2">{h.enteredBy}</td>
                </tr>
              ))}
              {history && !history.length && <tr><td colSpan={4} className="px-2.5 py-4 text-center text-[#6B7876]">No movement rows in this range.</td></tr>}
              {!history && <tr><td colSpan={4} className="px-2.5 py-4 text-center text-[#6B7876]">Loading…</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
