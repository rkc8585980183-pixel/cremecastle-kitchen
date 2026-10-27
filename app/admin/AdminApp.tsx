"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { rpc } from "@/lib/api";
import { SessionUser, Department, Category, Item, Section } from "@/lib/types";
import { Modal, Field, TextInput, SelectInput, Btn, Badge, IconBtn, Table } from "./ui";
import ReconciliationView from "../components/ReconciliationView";
import AccessMenuTab from "./AccessMenuTab";
import AdminEntryTab from "./AdminEntryTab";
import AdminsTab from "./AdminsTab";

type Tab = "dashboard" | "report" | "review" | "access" | "godmode" | "upload" | "admins" | "users" | "departments" | "categories" | "items" | "sections" | "devices" | "logs";

type TabGroup = "Overview" | "Operations" | "People" | "Catalog" | "System";
const GROUP_ORDER: TabGroup[] = ["Overview", "Operations", "People", "Catalog", "System"];

const TAB_LIST: { key: Tab; label: string; icon: string; group: TabGroup; hint: string; superOnly?: boolean }[] = [
  { key: "dashboard", label: "Dashboard", icon: "🏠", group: "Overview", hint: "Today at a glance" },
  { key: "report", label: "Reports", icon: "📊", group: "Overview", hint: "Entries by date & department" },
  { key: "review", label: "Review", icon: "🧮", group: "Overview", hint: "Stock reconciliation" },
  { key: "access", label: "Access Menu", icon: "🔐", group: "Operations", hint: "Edit windows & special unlocks" },
  { key: "godmode", label: "Admin Entry", icon: "🛡️", group: "Operations", hint: "Enter or fix any entry" },
  { key: "upload", label: "Bulk Upload", icon: "⬆️", group: "Operations", hint: "Import entries from CSV" },
  { key: "admins", label: "Admins", icon: "👑", group: "People", hint: "Admins & what they can access", superOnly: true },
  { key: "users", label: "Users", icon: "👥", group: "People", hint: "Department staff accounts" },
  { key: "departments", label: "Departments", icon: "🏢", group: "People", hint: "Kitchens & outlets", superOnly: true },
  { key: "categories", label: "Categories", icon: "🗂️", group: "Catalog", hint: "Item groups per department" },
  { key: "items", label: "Items", icon: "📦", group: "Catalog", hint: "Products & units" },
  { key: "sections", label: "Sections", icon: "🧩", group: "Catalog", hint: "Entry sections & movements" },
  { key: "devices", label: "Devices", icon: "💻", group: "System", hint: "Signed-in devices" },
  { key: "logs", label: "Logs", icon: "📄", group: "System", hint: "Audit trail" },
];

// Quick Actions on the dashboard: shown only if the signed-in admin can open that tab.
const QUICK_ORDER: Tab[] = ["godmode", "report", "review", "access", "upload", "users", "admins", "departments"];
const QUICK_STYLE: Partial<Record<Tab, { tile: string; chip: string }>> = {
  godmode: { tile: "#FFF1E0", chip: "linear-gradient(135deg,#F28C38,#D9650F)" },
  report: { tile: "#FFF6DC", chip: "linear-gradient(135deg,#F6C453,#E39A1B)" },
  review: { tile: "#E9F6EE", chip: "linear-gradient(135deg,#55AD83,#2F7D5B)" },
  access: { tile: "#FDE9E3", chip: "linear-gradient(135deg,#E6806A,#C2503A)" },
  upload: { tile: "#E4F4F3", chip: "linear-gradient(135deg,#43AEAA,#1E7F72)" },
  users: { tile: "#FCE8EF", chip: "linear-gradient(135deg,#E8789A,#C24B6D)" },
  admins: { tile: "#F1E6DC", chip: "linear-gradient(135deg,#8A5A3A,#4E2C18)" },
  departments: { tile: "#EEE8F7", chip: "linear-gradient(135deg,#9577BA,#6B4A92)" },
  items: { tile: "#E6EFFA", chip: "linear-gradient(135deg,#5A9BE0,#2E6DAE)" },
};

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function AdminApp({ user }: { user: SessionUser }) {
  const router = useRouter();
  const isSuper = user.role === "Super Admin";
  const [tab, setTab] = useState<Tab>("dashboard");
  // What THIS admin may open — fetched live (not from the 30-day cookie), so a
  // Super Admin's changes apply on the next page load without re-login.
  const [access, setAccess] = useState<{ role: string; tabs: string[]; users: "none" | "view" | "manage" } | null>(null);
  useEffect(() => {
    rpc<{ role: string; tabs: string[]; users: "none" | "view" | "manage" }>("getMyAccess").then((res) => {
      if (res.ok) setAccess({ role: res.role, tabs: res.tabs, users: res.users });
      else setAccess({ role: "Admin", tabs: [], users: "none" });
    });
  }, []);
  const liveSuper = access?.role === "Super Admin";
  const visibleTabs = access
    ? TAB_LIST.filter((t) => {
        if (t.superOnly) return liveSuper;
        if (liveSuper) return true;
        if (t.key === "users") return access.users !== "none";
        return access.tabs.includes(t.key);
      })
    : [];
  const activeTab: Tab | null = visibleTabs.some((t) => t.key === tab) ? tab : visibleTabs[0]?.key ?? null;
  const canManageUsers = liveSuper || access?.users === "manage";
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
    const [departments, setDepartments] = useState<Department[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [today, setToday] = useState("");

   useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("cc_admin_dark") : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === "1") setDarkMode(true);
  }, []);
  useEffect(() => {
    // Client-only so server and browser never disagree on the date (timezone).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToday(todayLocal());
  }, []);
  function toggleDarkMode() {
    setDarkMode((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") localStorage.setItem("cc_admin_dark", next ? "1" : "0");
      return next;
    });
  }

  const showToast = useCallback((msg: string, err?: boolean) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 2400);
  }, []);

  useEffect(() => {
    rpc<{ departments: Department[] }>("listDepartments").then((res) => {
      if (res.ok) setDepartments(res.departments);
    });
  }, [tab === "departments"]); // refetch when leaving departments tab too
  

  useEffect(() => {
    rpc<{ categories: Category[] }>("listCategories").then((res) => { if (res.ok) setCategories(res.categories); });
    rpc<{ items: Item[] }>("listItemsAdmin").then((res) => { if (res.ok) setItems(res.items); });
  }, []);
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const roleLabel = liveSuper || (!access && isSuper) ? "Super Admin" : "Administrator";
  const activeMeta = TAB_LIST.find((t) => t.key === activeTab);
  const quickTabs = QUICK_ORDER.map((k) => visibleTabs.find((t) => t.key === k)).filter(
    (t): t is (typeof TAB_LIST)[number] => !!t
  );
  const goTo = (k: Tab) => {
    setTab(k);
    setSidebarOpen(false);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const chip = darkMode
    ? { background: "#3B2417", border: "1px solid #4A2E1E", color: "#FFF4E3" }
    : { background: "#FBF4E8", border: "1px solid #EADFCB", color: "#3B2417" };

  return (
    <div className={`min-h-screen flex ${darkMode ? "bg-[#1C110B]" : "bg-[#FBF4E8]"}`}>
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-[#1C0F08]/60 backdrop-blur-[2px] z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`w-60 flex-shrink-0 flex flex-col fixed top-0 left-0 h-screen z-40 transition-transform duration-200 text-[#E8D5BF] bg-gradient-to-b from-[#2B1810] to-[#1D0F09] lg:shadow-[4px_0_24px_rgba(43,24,16,0.18)] ${
          sidebarOpen ? "translate-x-0 shadow-[4px_0_24px_rgba(0,0,0,0.35)]" : "-translate-x-full"
        } lg:translate-x-0`}
      >
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-white/10">
          <div className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0 ring-2 ring-[#E8731A]/70 bg-gradient-to-br from-[#F28C38] to-[#C75B0C]">
            <img src="https://lh3.googleusercontent.com/d/1XNpcNjDPcpFxIoDjHMhoWOYAJtqQWshj=w96-h96" alt="" className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[14.5px] font-bold leading-tight text-[#FFF4E3] truncate">Cream Castle</h2>
            <span className="text-[10.5px] text-[#C9A27E]">{roleLabel === "Super Admin" ? "Super Admin Panel" : "Admin Panel"}</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="ml-auto text-[#E8D5BF] text-lg leading-none lg:hidden cursor-pointer" aria-label="Close menu">✕</button>
        </div>

        <nav className="cc-scroll flex-1 overflow-y-auto px-2.5 py-3">
          {GROUP_ORDER.map((g) => {
            const list = visibleTabs.filter((t) => t.group === g);
            if (!list.length) return null;
            return (
              <div key={g} className="mb-3.5">
                <div className="px-3 mb-1 text-[9.5px] font-bold tracking-[0.16em] uppercase text-[#A9856B]">{g}</div>
                <div className="flex flex-col gap-0.5">
                  {list.map((t) => {
                    const active = activeTab === t.key;
                    return (
                      <button
                        key={t.key}
                        onClick={() => goTo(t.key)}
                        style={active ? { background: "linear-gradient(135deg,#F28C38,#D2600B)", color: "#FFFFFF", boxShadow: "0 6px 14px rgba(232,115,26,0.28)" } : undefined}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-semibold text-left transition cursor-pointer ${
                          active ? "" : "text-[#E8D5BF] hover:bg-white/[0.07] hover:text-white"
                        }`}
                      >
                        <span className="w-[18px] text-center text-[15px] leading-none">{t.icon}</span>
                        <span className="truncate">{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.06] px-2.5 py-2">
            <div style={{ background: "linear-gradient(135deg,#F28C38,#C75B0C)", color: "#FFFFFF" }} className="w-8 h-8 rounded-full flex items-center justify-center font-extrabold text-[13px] flex-shrink-0">
              {user.name.trim().charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-bold text-[#FFF4E3] truncate leading-tight">{user.name}</div>
              <div className="text-[10.5px] text-[#C9A27E]">{roleLabel === "Super Admin" ? "👑 Super Admin" : "Administrator"}</div>
            </div>
            <button onClick={logout} title="Sign out" aria-label="Sign out" className="text-[#E8D5BF] hover:text-white text-sm cursor-pointer px-1.5">⏻</button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col lg:ml-60">
        <header className={`sticky top-0 z-20 backdrop-blur border-b px-4 lg:px-6 py-2.5 flex items-center justify-between gap-3 ${darkMode ? "bg-[#2B1810]/90 border-[#3F2819]" : "bg-[#FFFDF9]/90 border-[#EADFCB]"}`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              style={chip}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0 lg:hidden cursor-pointer"
              aria-label="Open menu"
            >
              ☰
            </button>
            <div className="min-w-0">
              <h2 className={`text-[16px] font-bold truncate leading-tight ${darkMode ? "text-[#FFF4E3]" : "text-[#2B1810]"}`}>{activeMeta?.label || "Admin panel"}</h2>
              <p className={`text-[11px] hidden sm:block truncate ${darkMode ? "text-[#C9A27E]" : "text-[#8A6F5C]"}`}>{activeMeta?.hint || "Kitchen inventory admin panel"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div style={chip} className="hidden md:flex items-center gap-1.5 text-[12px] font-semibold rounded-lg px-3 py-1.5">
              📅 {today || "—"}
            </div>
            <button
              onClick={() => setFavorited((v) => !v)}
              style={chip}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm cursor-pointer"
              title={favorited ? "Remove from favorites" : "Add to favorites"}
            >
              {favorited ? "⭐" : "☆"}
            </button>
            <button
              onClick={toggleDarkMode}
              style={chip}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm cursor-pointer"
              title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {darkMode ? "🌙" : "☀️"}
            </button>
            <span style={chip} className="w-8 h-8 rounded-lg hidden sm:flex items-center justify-center text-sm cursor-default" title="Notifications">🔔</span>
            <div className={`hidden sm:block w-px h-7 ${darkMode ? "bg-[#4A2E1E]" : "bg-[#EADFCB]"}`} />
            <div className="hidden sm:flex items-center gap-2">
              <div className="text-right">
                <div className={`text-[12.5px] font-bold leading-tight ${darkMode ? "text-[#FFF4E3]" : "text-[#2B1810]"}`}>{user.name}</div>
                <div className="text-[10px] font-semibold text-[#C75B0C]">{roleLabel === "Super Admin" ? "👑 Super Admin" : "Administrator"}</div>
              </div>
            </div>
            <button
              onClick={logout}
              style={darkMode ? { color: "#FFF4E3", border: "1px solid #E8731A", background: "transparent" } : { color: "#C75B0C", border: "1px solid #E8731A", background: "#FFF3E4" }}
              className="text-xs rounded-full px-3.5 py-1.5 font-bold cursor-pointer hover:brightness-95"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="p-4 lg:p-6 max-w-[1400px] w-full mx-auto">
          {!access && <div className="text-sm text-[#8A6F5C]">Loading your access…</div>}
          {access && !visibleTabs.length && (
            <div className="bg-white border border-[#EADFCB] rounded-2xl p-6 max-w-lg">
              <div className="text-base font-bold mb-1">No sections assigned yet</div>
              <p className="text-sm text-[#8A6F5C]">Your account is active, but a Super Admin hasn&apos;t given you access to any section. Please ask them to update your access.</p>
            </div>
          )}
          {activeTab === "dashboard" && <DashboardTab user={user} showToast={showToast} dark={darkMode} quickTabs={quickTabs} onNavigate={goTo} />}
          {activeTab === "report" && <ReportTab departments={departments} showToast={showToast} />}
                    {activeTab === "review" && <ReconciliationView role="Admin" departments={departments} categories={categories} items={items} showToast={showToast} />}
          {activeTab === "access" && <AccessMenuTab departments={departments} categories={categories} items={items} showToast={showToast} />}
          {activeTab === "godmode" && <AdminEntryTab departments={departments} items={items} showToast={showToast} />}
          {activeTab === "upload" && <UploadTab showToast={showToast} />}
          {activeTab === "admins" && liveSuper && <AdminsTab currentUserId={user.userId} showToast={showToast} />}
          {activeTab === "users" && <UsersTab departments={departments} canManage={canManageUsers} showToast={showToast} />}
          {activeTab === "departments" && liveSuper && <DepartmentsTab departments={departments} setDepartments={setDepartments} showToast={showToast} />}
          {activeTab === "categories" && <CategoriesTab departments={departments} showToast={showToast} />}
          {activeTab === "items" && <ItemsTab departments={departments} showToast={showToast} />}
          {activeTab === "sections" && <SectionsTab departments={departments} showToast={showToast} />}
          {activeTab === "devices" && <DevicesTab showToast={showToast} />}
          {activeTab === "logs" && <LogsTab />}
        </main>
      </div>

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4.5 py-2.5 rounded-xl text-sm font-semibold text-white z-50 shadow-lg ${toast.err ? "bg-[#C0463F]" : "bg-[#3B2417]"}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

type Toast = (msg: string, err?: boolean) => void;

// ==================== DASHBOARD ====================
type QuickTab = { key: Tab; label: string; icon: string; hint: string };

function roleBadgeStyle(role: string): React.CSSProperties {
  if (role === "Super Admin") return { background: "#FDEBD6", color: "#9A4A06" };
  if (role === "Admin") return { background: "#FFF1CC", color: "#8A6200" };
  return { background: "#F3E7D3", color: "#6B4F3B" };
}

function DashboardTab({ user, showToast, dark, quickTabs, onNavigate }: {
  user: SessionUser; showToast: Toast; dark: boolean; quickTabs: QuickTab[]; onNavigate: (k: Tab) => void;
}) {
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [activity, setActivity] = useState<{ timestamp: string; summary: string; role: string }[]>([]);
  const [dateLabel, setDateLabel] = useState("");

  useEffect(() => {
    rpc<Record<string, number>>("getDashboardStats").then((res) => {
      if (res.ok) setStats(res as unknown as Record<string, number>);
      else showToast(res.error, true);
    });
    rpc<{ activity: { timestamp: string; summary: string; role: string }[] }>("getActivityFeed", { limit: 30 }).then((res) => {
      if (res.ok) setActivity(res.activity);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Client-only (avoids a server/browser timezone mismatch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDateLabel(new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
  }, []);

  const cards = [
    { key: "totalItems", label: "Total items", icon: "📦", tint: "#FFF1E0", ring: "#E8731A" },
    { key: "activeItems", label: "Active items", icon: "✅", tint: "#E9F6EE", ring: "#3E8E5B" },
    { key: "inactiveItems", label: "Inactive items", icon: "⛔", tint: "#FDE9E3", ring: "#C0463F" },
    { key: "todaysEntries", label: "Today's entries", icon: "📝", tint: "#FFF6DC", ring: "#E0A030" },
  ];

  const card = dark ? "bg-[#2F1D13] border-[#4A2E1E]" : "bg-white border-[#EADFCB]";
  const head = dark ? "text-[#FFF4E3]" : "text-[#2B1810]";
  const sub = dark ? "text-[#C9A27E]" : "text-[#8A6F5C]";
  const row = dark ? "bg-[#3B2417]/60 border-[#4A2E1E]" : "bg-[#FFFAF2] border-[#F1E6D2]";
  const isSuperUser = user.role === "Super Admin";

  return (
    <div className="space-y-4">
      {/* Welcome */}
      <div
        className="relative overflow-hidden rounded-2xl px-5 py-4 sm:px-6 sm:py-5 text-white"
        style={{ background: "linear-gradient(120deg,#2B1810 0%,#4A2A18 55%,#C75B0C 130%)" }}
      >
        <div className="absolute -right-10 -top-12 w-44 h-44 rounded-full bg-[#E8731A]/25 blur-2xl" aria-hidden />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold tracking-wide text-[#F3C79B]">{dateLabel || "\u00a0"}</div>
            <h3 className="text-xl sm:text-[22px] font-extrabold leading-tight mt-0.5">Welcome back, {user.name.split(" ")[0]}!</h3>
            <p className="text-[12.5px] text-[#F0D9BF] mt-1">Here&rsquo;s what&rsquo;s happening in the kitchen today.</p>
          </div>
          <span className="text-[11.5px] font-bold rounded-full px-3 py-1.5 bg-white/15 border border-white/25">
            {isSuperUser ? "👑 Super Admin" : "Administrator"}
          </span>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.key} className={`rounded-2xl border p-3.5 flex items-center gap-3 shadow-[0_1px_2px_rgba(43,24,16,0.04)] ${card}`}>
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center text-[19px] flex-shrink-0"
              style={{ background: dark ? "rgba(255,255,255,0.08)" : c.tint, boxShadow: `inset 0 0 0 1.5px ${c.ring}33` }}
            >
              {c.icon}
            </div>
            <div className="min-w-0">
              <div className={`text-[22px] leading-none font-extrabold ${head}`}>{stats ? stats[c.key] ?? 0 : "—"}</div>
              <div className={`text-[11.5px] font-semibold mt-1 truncate ${sub}`}>{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Recent Activity */}
        <section className={`order-2 lg:order-1 lg:col-span-2 rounded-2xl border p-4 ${card}`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className={`text-[14.5px] font-bold ${head}`}>Recent Activity</h3>
            <span className="text-[10.5px] font-bold rounded-full px-2.5 py-1" style={{ background: "#FDEBD6", color: "#9A4A06" }}>
              {activity.length} update{activity.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="cc-scroll flex flex-col gap-1.5 max-h-[420px] overflow-y-auto pr-1">
            {activity.length === 0 && <div className={`text-sm py-6 text-center ${sub}`}>No activity yet.</div>}
            {activity.map((a, i) => (
              <div key={i} className={`flex gap-2.5 border rounded-xl px-3 py-2 items-start ${row}`}>
                <div className="w-2 h-2 rounded-full bg-[#E8731A] mt-[7px] flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className={`text-[13px] leading-snug ${head}`}>{a.summary}</div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className={`text-[10.5px] ${sub}`}>{a.timestamp}</span>
                    <span className="text-[9.5px] font-bold rounded-full px-2 py-0.5" style={roleBadgeStyle(a.role)}>{a.role}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Quick Actions */}
        <section className={`order-1 lg:order-2 rounded-2xl border p-4 ${card}`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className={`text-[14.5px] font-bold ${head}`}>Quick Actions</h3>
          </div>
          {quickTabs.length === 0 ? (
            <div className={`text-sm ${sub}`}>No shortcuts available for your access.</div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {quickTabs.map((q) => {
                const st = QUICK_STYLE[q.key] || { tile: "#F3E7D3", chip: "linear-gradient(135deg,#8A5A3A,#4E2C18)" };
                return (
                  <button
                    key={q.key}
                    onClick={() => onNavigate(q.key)}
                    style={{ background: dark ? "rgba(255,255,255,0.06)" : st.tile }}
                    className="group text-left rounded-xl p-2.5 border border-transparent hover:border-[#E8731A]/50 hover:-translate-y-0.5 transition cursor-pointer"
                  >
                    <span
                      style={{ background: st.chip }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-[15px] text-white shadow-sm mb-2"
                    >
                      {q.icon}
                    </span>
                    <div className={`text-[12.5px] font-bold leading-tight ${head}`}>{q.label}</div>
                    <div className={`text-[10.5px] leading-snug mt-0.5 line-clamp-2 ${sub}`}>{q.hint}</div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ==================== REPORTS ====================
function ReportTab({ departments, showToast }: { departments: Department[]; showToast: Toast }) {
  const [from, setFrom] = useState(todayLocal());
  const [to, setTo] = useState(todayLocal());
  const [deptId, setDeptId] = useState("");
  const [section, setSection] = useState("");
  const [rows, setRows] = useState<{ date: string; departmentId: string; itemName: string; sectionName: string; qty: number; enteredBy: string; status: string; voidReason: string }[]>([]);
  const [stats, setStats] = useState({ totalEntries: 0, totalQty: 0 });

  async function run() {
    const res = await rpc<{ rows: typeof rows; totalEntries: number; totalQty: number }>("getAdminReport", {
      fromDate: from, toDate: to, departmentId: deptId, sectionName: section,
    });
    if (!res.ok) { showToast(res.error, true); return; }
    setRows(res.rows); setStats({ totalEntries: res.totalEntries, totalQty: res.totalQty });
  }
  function exportCsv() {
    if (!rows.length) { showToast("Run a report first", true); return; }
    const header = ["Date", "DepartmentID", "Item", "Section", "Qty", "EnteredBy", "Status", "VoidReason"];
    const body = rows.map((r) => [r.date, r.departmentId, r.itemName, r.sectionName, r.qty, r.enteredBy, r.status, r.voidReason]);
    const csv = [header, ...body].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "inventory_report.csv"; a.click();
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-5">
        <div className="bg-white border border-[#EADFCB] rounded-2xl p-4.5"><div className="text-2xl font-extrabold text-[#3B2417]">{stats.totalEntries}</div><div className="text-[12.5px] font-semibold">Total entries</div></div>
        <div className="bg-white border border-[#EADFCB] rounded-2xl p-4.5"><div className="text-2xl font-extrabold text-[#3B2417]">{stats.totalQty}</div><div className="text-[12.5px] font-semibold">Total qty</div></div>
      </div>
      <div className="bg-white border border-[#EADFCB] rounded-2xl p-5 mb-5">
        <div className="flex flex-wrap gap-2.5 items-end">
          <Field label="From"><TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label="Department">
            <SelectInput value={deptId} onChange={(e) => setDeptId(e.target.value)}>
              <option value="">All departments</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </SelectInput>
          </Field>
          <Field label="Section"><TextInput value={section} onChange={(e) => setSection(e.target.value)} placeholder="e.g. Opening" /></Field>
          <Btn variant="primary" onClick={run}>🔎 Generate report</Btn>
          <Btn onClick={exportCsv}>⬇️ Export CSV</Btn>
        </div>
      </div>
      <Table head={["Date", "Dept", "Item", "Section", "Qty", "By", "Status"]}>
        {rows.map((r, i) => {
          const dept = departments.find((d) => d.id === r.departmentId);
          return (
            <tr key={i} className="border-b border-[#EADFCB] hover:bg-[#FBF5EA]">
              <td className="px-3 py-2.5">{r.date}</td>
              <td className="px-3 py-2.5">{dept?.name || r.departmentId}</td>
              <td className="px-3 py-2.5">{r.itemName}</td>
              <td className="px-3 py-2.5">{r.sectionName}</td>
              <td className="px-3 py-2.5">{r.qty}</td>
              <td className="px-3 py-2.5">{r.enteredBy}</td>
              <td className="px-3 py-2.5">
                {r.status === "Void" ? (
                  <span title={r.voidReason} className="text-[11px] font-bold px-2 py-1 rounded-full text-[#C0463F] bg-red-50">Void</span>
                ) : (
                  <span className="text-[11px] font-bold px-2 py-1 rounded-full text-[#1E7F72] bg-teal-50">Active</span>
                )}
              </td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}

// ==================== BULK UPLOAD ====================
function UploadTab({ showToast }: { showToast: Toast }) {
  const [result, setResult] = useState("");
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = String(ev.target?.result || "");
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const headers = lines[0].split(",").map((h) => h.trim());
      const rows = lines.slice(1).map((line) => {
        const cols = line.split(",");
        const obj: Record<string, string> = {};
        headers.forEach((h, idx) => (obj[h] = (cols[idx] || "").trim()));
        return obj;
      });
      const res = await rpc<{ uploaded: number; skipped: number }>("adminBulkUpload", { rows });
      if (!res.ok) { setResult(res.error); return; }
      setResult(`Uploaded ${res.uploaded} rows, skipped ${res.skipped}.`);
      showToast("Bulk upload complete");
    };
    reader.readAsText(file);
  }
  return (
    <div className="bg-white border border-[#EADFCB] rounded-2xl p-5 max-w-xl">
      <p className="text-sm text-[#8A6F5C] mb-4">CSV columns: date, departmentId, itemName, sectionName, qty, enteredBy</p>
      <input type="file" accept=".csv" onChange={handleFile} className="text-sm" />
      {result && <div className="mt-3 text-sm">{result}</div>}
    </div>
  );
}

// ==================== USERS ====================
type UserRow = { userId: string; email: string; name: string; departmentId: string; role: string; active: boolean };
function UsersTab({ departments, canManage, showToast }: { departments: Department[]; canManage: boolean; showToast: Toast }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [editing, setEditing] = useState<UserRow | null | "new">(null);

  const load = useCallback(async () => {
    const res = await rpc<{ users: UserRow[] }>("listUsers");
    if (res.ok) setUsers(res.users); else showToast(res.error, true);
  }, [showToast]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex justify-between items-end mb-4">
        <p className="text-[#8A6F5C] text-sm">
          {canManage ? "Manage department staff accounts and access." : "View department staff accounts (view only — you can't add or edit users)."}
        </p>
        {canManage && <Btn variant="primary" onClick={() => setEditing("new")}>+ Add user</Btn>}
      </div>
      <Table head={canManage ? ["Email", "Name", "Dept", "Role", "Active", "Actions"] : ["Email", "Name", "Dept", "Role", "Active"]}>
        {users.map((u) => {
          const dept = departments.find((d) => d.id === u.departmentId);
          return (
            <tr key={u.email} className="border-b border-[#EADFCB] hover:bg-[#FBF5EA]">
              <td className="px-3 py-2.5">{u.email}</td>
              <td className="px-3 py-2.5">{u.name}</td>
              <td className="px-3 py-2.5">{dept?.name || "—"}</td>
              <td className="px-3 py-2.5">{u.role}</td>
              <td className="px-3 py-2.5"><Badge ok={u.active} /></td>
              {canManage && <td className="px-3 py-2.5">
                <IconBtn onClick={() => setEditing(u)}>✎</IconBtn>
                {u.active && (
                  <IconBtn danger onClick={async () => {
                    if (!confirm(`Deactivate ${u.email}?`)) return;
                    const res = await rpc("deactivateUser", { email: u.email });
                    if (!res.ok) showToast(res.error, true); else load();
                  }}>✕</IconBtn>
                )}
              </td>}
            </tr>
          );
        })}
      </Table>
      {canManage && editing && (
        <Modal title={editing === "new" ? "Add user" : "Edit user"} onClose={() => setEditing(null)}>
          <UserForm departments={departments} user={editing === "new" ? null : editing}
            onSaved={() => { setEditing(null); load(); }} showToast={showToast} />
        </Modal>
      )}
    </div>
  );
}
function UserForm({ departments, user, onSaved, showToast }: { departments: Department[]; user: UserRow | null; onSaved: () => void; showToast: Toast }) {
  const [email, setEmail] = useState(user?.email || "");
  const [name, setName] = useState(user?.name || "");
  const [deptId, setDeptId] = useState(user?.departmentId || "");
  const [pin, setPin] = useState("");
  async function save() {
    if (!email || !name) { showToast("Email and name required", true); return; }
    if (!deptId) { showToast("Select a department", true); return; }
    // This tab only manages Department Users. Admin accounts live in the Admins tab (Super Admin only).
    const res = await rpc("saveUser", { email, name, departmentId: deptId, role: "Department User", pin, active: true });
    if (!res.ok) { showToast(res.error, true); return; }
    showToast("User saved"); onSaved();
  }
  return (
    <div>
      <Field label="Email"><TextInput value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label="Name"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Department">
        <SelectInput value={deptId} onChange={(e) => setDeptId(e.target.value)}>
          <option value="">— Select department —</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </SelectInput>
      </Field>
      <Field label={`PIN ${user ? "(leave blank to keep existing)" : ""}`}><TextInput value={pin} onChange={(e) => setPin(e.target.value)} /></Field>
      <div className="flex justify-end gap-2 mt-4">
        <Btn variant="primary" onClick={save}>Save</Btn>
      </div>
    </div>
  );
}

// ==================== DEPARTMENTS ====================
function DepartmentsTab({ departments, setDepartments, showToast }: { departments: Department[]; setDepartments: (d: Department[]) => void; showToast: Toast }) {
  const [rows, setRows] = useState<(Department & { active: boolean })[]>([]);
  const [editing, setEditing] = useState<Department | null | "new">(null);

  const load = useCallback(async () => {
    const res = await rpc<{ departments: (Department & { active: boolean })[] }>("listDepartments");
      if (res.ok) { setRows(res.departments); setDepartments(res.departments); } else showToast(res.error, true);
  }, [showToast, setDepartments]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex justify-between items-end mb-4">
        <p className="text-[#8A6F5C] text-sm">Kitchen departments & outlets.</p>
        <Btn variant="primary" onClick={() => setEditing("new")}>+ Add department</Btn>
      </div>
      <Table head={["ID", "Name", "Order", "Active", "Actions"]}>
        {rows.map((d) => (
          <tr key={d.id} className="border-b border-[#EADFCB] hover:bg-[#FBF5EA]">
            <td className="px-3 py-2.5">{d.id}</td>
            <td className="px-3 py-2.5">{d.name}</td>
            <td className="px-3 py-2.5">{d.order}</td>
            <td className="px-3 py-2.5"><Badge ok={d.active} /></td>
            <td className="px-3 py-2.5">
              <IconBtn onClick={() => setEditing(d)}>✎</IconBtn>
              {d.active && (
                <IconBtn danger onClick={async () => {
                  if (!confirm(`Disable ${d.name}?`)) return;
                  const res = await rpc("deleteDepartment", { id: d.id });
                  if (!res.ok) showToast(res.error, true); else load();
                }}>✕</IconBtn>
              )}
            </td>
          </tr>
        ))}
      </Table>
      {editing && (
        <Modal title={editing === "new" ? "Add department" : "Edit department"} onClose={() => setEditing(null)}>
          <DeptForm dept={editing === "new" ? null : editing} onSaved={() => { setEditing(null); load(); }} showToast={showToast} />
        </Modal>
      )}
    </div>
  );
}
function DeptForm({ dept, onSaved, showToast }: { dept: Department | null; onSaved: () => void; showToast: Toast }) {
  const [name, setName] = useState(dept?.name || "");
  const [order, setOrder] = useState(dept?.order ?? 0);
  async function save() {
    if (!name.trim()) { showToast("Name required", true); return; }
    const res = await rpc("saveDepartment", { id: dept?.id || "", name, order, active: true });
    if (!res.ok) { showToast(res.error, true); return; }
    showToast("Department saved"); onSaved();
  }
  return (
    <div>
      <Field label="Name"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Display order"><TextInput type="number" value={order} onChange={(e) => setOrder(Number(e.target.value))} /></Field>
      <div className="flex justify-end gap-2 mt-4"><Btn variant="primary" onClick={save}>Save</Btn></div>
    </div>
  );
}

// ==================== CATEGORIES ====================
function CategoriesTab({ departments, showToast }: { departments: Department[]; showToast: Toast }) {
  const [rows, setRows] = useState<(Category & { active: boolean })[]>([]);
  const [editing, setEditing] = useState<Category | null | "new">(null);
  const load = useCallback(async () => {
    const res = await rpc<{ categories: (Category & { active: boolean })[] }>("listCategories");
      if (res.ok) setRows(res.categories); else showToast(res.error, true);
  }, [showToast]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex justify-between items-end mb-4">
        <p className="text-[#8A6F5C] text-sm">Item categories per department.</p>
        <Btn variant="primary" onClick={() => setEditing("new")}>+ Add category</Btn>
      </div>
      <Table head={["Department", "Name", "Order", "Active", "Actions"]}>
        {rows.map((c) => {
          const dept = departments.find((d) => d.id === c.deptId);
          return (
            <tr key={c.id} className="border-b border-[#EADFCB] hover:bg-[#FBF5EA]">
              <td className="px-3 py-2.5">{dept?.name || c.deptId}</td>
              <td className="px-3 py-2.5">{c.name}</td>
              <td className="px-3 py-2.5">{c.order}</td>
              <td className="px-3 py-2.5"><Badge ok={c.active} /></td>
              <td className="px-3 py-2.5">
                <IconBtn onClick={() => setEditing(c)}>✎</IconBtn>
                {c.active && (
                  <IconBtn danger onClick={async () => {
                    if (!confirm(`Disable ${c.name}?`)) return;
                    const res = await rpc("deleteCategory", { id: c.id });
                    if (!res.ok) showToast(res.error, true); else load();
                  }}>✕</IconBtn>
                )}
              </td>
            </tr>
          );
        })}
      </Table>
      {editing && (
        <Modal title={editing === "new" ? "Add category" : "Edit category"} onClose={() => setEditing(null)}>
          <CatForm departments={departments} cat={editing === "new" ? null : editing} onSaved={() => { setEditing(null); load(); }} showToast={showToast} />
        </Modal>
      )}
    </div>
  );
}
function CatForm({ departments, cat, onSaved, showToast }: { departments: Department[]; cat: Category | null; onSaved: () => void; showToast: Toast }) {
  const [deptId, setDeptId] = useState(cat?.deptId || departments[0]?.id || "");
  const [name, setName] = useState(cat?.name || "");
  const [order, setOrder] = useState(cat?.order ?? 0);
  async function save() {
    if (!name.trim()) { showToast("Name required", true); return; }
    const res = await rpc("saveCategory", { id: cat?.id || "", departmentId: deptId, name, order, active: true });
    if (!res.ok) { showToast(res.error, true); return; }
    showToast("Category saved"); onSaved();
  }
  return (
    <div>
      <Field label="Department">
        <SelectInput value={deptId} onChange={(e) => setDeptId(e.target.value)}>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </SelectInput>
      </Field>
      <Field label="Name"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Display order"><TextInput type="number" value={order} onChange={(e) => setOrder(Number(e.target.value))} /></Field>
      <div className="flex justify-end gap-2 mt-4"><Btn variant="primary" onClick={save}>Save</Btn></div>
    </div>
  );
}

// ==================== ITEMS ====================
function ItemsTab({ departments, showToast }: { departments: Department[]; showToast: Toast }) {
  const [rows, setRows] = useState<(Item & { active: boolean; remarks: string })[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Item | null | "new">(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkResult, setBulkResult] = useState("");
  const [bulkRunning, setBulkRunning] = useState(false);

  const load = useCallback(async () => {
    const [ires, cres] = await Promise.all([
      rpc<{ items: (Item & { active: boolean; remarks: string })[] }>("listItemsAdmin"),
      rpc<{ categories: Category[] }>("listCategories"),
    ]);
    if (ires.ok) setRows(ires.items); else showToast(ires.error, true);
       if (cres.ok) setCategories(cres.categories);
  }, [showToast]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => rows.filter((r) => !search || r.name.toLowerCase().includes(search.toLowerCase())), [rows, search]);

  async function handleBulkFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = String(ev.target?.result || "");
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (!lines.length) { showToast("Empty file", true); return; }
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const rowsToImport = lines.slice(1).map((line) => {
        const cols = line.split(",");
        const obj: Record<string, string> = {};
        headers.forEach((h, idx) => (obj[h] = (cols[idx] || "").trim()));
        return {
          department: obj["department"] || "",
          category: obj["category"] || "",
          itemName: obj["itemname"] || obj["item name"] || obj["item"] || "",
          unit: obj["unit"] || "Pcs",
          remarks: obj["remarks"] || "",
        };
      });
      setBulkRunning(true);
      setBulkResult("");
      const res = await rpc<{ imported: number; skipped: number; categoriesCreated: number; errors: string[] }>("bulkImportItems", { rows: rowsToImport });
      setBulkRunning(false);
      if (!res.ok) { setBulkResult(res.error); return; }
      setBulkResult(
        `Imported ${res.imported} items · ${res.categoriesCreated} new categories created · ${res.skipped} rows skipped` +
        (res.errors.length ? `\n\nFirst issues:\n${res.errors.join("\n")}` : "")
      );
      showToast(`Imported ${res.imported} items`);
      load();
    };
    reader.readAsText(file);
  }

  return (
    <div>
      <div className="flex justify-between items-end mb-4 gap-2 flex-wrap">
        <p className="text-[#8A6F5C] text-sm">Master inventory item list.</p>
        <div className="flex gap-2">
          <Btn onClick={() => setBulkOpen((v) => !v)}>⬆️ Bulk import (CSV)</Btn>
          <Btn variant="primary" onClick={() => setEditing("new")}>+ Add item</Btn>
        </div>
      </div>

      {bulkOpen && (
        <div className="bg-white border border-[#EADFCB] rounded-2xl p-5 mb-4">
          <h3 className="text-[14.5px] font-bold mb-1.5">Bulk import items</h3>
          <p className="text-[13px] text-[#8A6F5C] mb-3">
            CSV columns: <b>department, category, itemName, unit, remarks</b> (remarks optional). Department must
            already exist exactly as named — category will be created automatically if it doesn&rsquo;t exist yet.
          </p>
          <input type="file" accept=".csv" onChange={handleBulkFile} disabled={bulkRunning} className="text-sm" />
          {bulkRunning && <div className="mt-3 text-sm text-[#8A6F5C]">Importing… this can take a bit for 200+ rows.</div>}
          {bulkResult && <pre className="mt-3 text-xs whitespace-pre-wrap bg-[#FBF5EA] border border-[#EADFCB] rounded-lg p-3">{bulkResult}</pre>}
        </div>
      )}

      <div className="bg-white border border-[#EADFCB] rounded-2xl p-4 mb-4">
        <TextInput placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <Table head={["Department", "Category", "Name", "Unit", "Active", "Actions"]}>
        {filtered.map((it) => {
          const deptIdList = String(it.deptId || "").split(",").map((x) => x.trim()).filter(Boolean);
          const deptNames = deptIdList.length
            ? deptIdList.map((id) => departments.find((d) => d.id === id)?.name || id).join(", ")
            : "All departments";
          const cat = categories.find((c) => c.id === it.catId);
          return (
            <tr key={it.id} className="border-b border-[#EADFCB] hover:bg-[#FBF5EA]">
              <td className="px-3 py-2.5">{deptNames}</td>
              <td className="px-3 py-2.5">{cat?.name || it.catId}</td>
              <td className="px-3 py-2.5">{it.name}</td>
              <td className="px-3 py-2.5">{it.unit}</td>
              <td className="px-3 py-2.5"><Badge ok={it.active} /></td>
              <td className="px-3 py-2.5">
                <IconBtn onClick={() => setEditing(it)}>✎</IconBtn>
                {it.active && (
                  <IconBtn danger onClick={async () => {
                    if (!confirm(`Disable ${it.name}?`)) return;
                    const res = await rpc("deleteItem", { id: it.id });
                    if (!res.ok) showToast(res.error, true); else load();
                  }}>✕</IconBtn>
                )}
              </td>
            </tr>
          );
        })}
      </Table>
      {editing && (
        <Modal title={editing === "new" ? "Add item" : "Edit item"} onClose={() => setEditing(null)}>
          <ItemForm departments={departments} categories={categories} item={editing === "new" ? null : editing}
            onSaved={() => { setEditing(null); load(); }} showToast={showToast} />
        </Modal>
      )}
    </div>
  );
}
function ItemForm({ departments, categories, item, onSaved, showToast }: {
  departments: Department[]; categories: Category[]; item: (Item & { remarks?: string }) | null; onSaved: () => void; showToast: Toast;
}) {
  const initialDeptIds = item?.deptId ? item.deptId.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const [allDepts, setAllDepts] = useState(initialDeptIds.length === 0);
  const [selectedDepts, setSelectedDepts] = useState<string[]>(initialDeptIds);
  const [catId, setCatId] = useState(item?.catId || "");
  const [name, setName] = useState(item?.name || "");
  const [unit, setUnit] = useState(item?.unit || "Pcs");
  const [order, setOrder] = useState(item?.order ?? 0);
  const [remarks, setRemarks] = useState(item?.remarks || "");
  const catOptions = allDepts ? categories : categories.filter((c) => selectedDepts.includes(c.deptId));

  function toggleDept(id: string) {
    setSelectedDepts((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save() {
    if (!name.trim()) { showToast("Name required", true); return; }
    if (!allDepts && selectedDepts.length === 0) { showToast('Pick at least one department, or check "All departments"', true); return; }
    const departmentId = allDepts ? "" : selectedDepts.join(",");
    const res = await rpc("saveItem", { id: item?.id || "", departmentId, categoryId: catId, name, unit, order, remarks, active: true });
    if (!res.ok) { showToast(res.error, true); return; }
    showToast("Item saved"); onSaved();
  }
  return (
    <div>
      <Field label="Departments (this item is shared across whichever ones you pick)">
        <label className="flex items-center gap-2.5 mb-2.5 p-2.5 bg-[#FBF5EA] border-[1.5px] border-[#EADFCB] rounded-lg cursor-pointer">
          <input type="checkbox" checked={allDepts} onChange={(e) => setAllDepts(e.target.checked)} />
          <span className="text-[13px] font-bold">All departments</span>
        </label>
        {!allDepts && (
          <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto border border-[#EADFCB] rounded-lg p-1.5">
            {departments.map((d) => (
              <label key={d.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-[#FBF5EA]">
                <input type="checkbox" checked={selectedDepts.includes(d.id)} onChange={() => toggleDept(d.id)} />
                <span className="text-[13px]">{d.name}</span>
              </label>
            ))}
          </div>
        )}
      </Field>
      <Field label="Category">
        <SelectInput value={catId} onChange={(e) => setCatId(e.target.value)}>
          <option value="">— Select —</option>
          {catOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </SelectInput>
      </Field>
      <Field label="Item name"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Unit"><TextInput value={unit} onChange={(e) => setUnit(e.target.value)} /></Field>
      <Field label="Display order"><TextInput type="number" value={order} onChange={(e) => setOrder(Number(e.target.value))} /></Field>
      <Field label="Remarks"><TextInput value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>
      <div className="flex justify-end gap-2 mt-4"><Btn variant="primary" onClick={save}>Save</Btn></div>
    </div>
  );
}

// ==================== SECTIONS ====================
function SectionsTab({ departments, showToast }: { departments: Department[]; showToast: Toast }) {
  const [rows, setRows] = useState<(Section & { active: boolean })[]>([]);
  const [editing, setEditing] = useState<Section | null | "new">(null);
  const [overrides, setOverrides] = useState<Record<string, { active: boolean; customName: string }>>({});
  const [filterDept, setFilterDept] = useState(departments[0]?.id || "");

  const load = useCallback(async () => {
    const [sres, ores] = await Promise.all([
      rpc<{ sections: (Section & { active: boolean })[] }>("listSectionsAdmin"),
      rpc<{ overrides: Record<string, { active: boolean; customName: string }> }>("listDeptSectionOverrides"),
    ]);
    if (sres.ok) setRows(sres.sections); else showToast(sres.error, true);
    if (ores.ok) setOverrides(ores.overrides);
  }, [showToast]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!filterDept && departments[0]) setFilterDept(departments[0].id); }, [departments, filterDept]);
  async function toggle(sectionId: string, current: boolean, customName: string) {
    const res = await rpc("saveDeptSectionOverride", { departmentId: filterDept, sectionId, active: !current, customName });
    if (!res.ok) { showToast(res.error, true); return; }
    load();
  }
  async function saveName(sectionId: string, active: boolean, name: string) {
    const res = await rpc("saveDeptSectionOverride", { departmentId: filterDept, sectionId, active, customName: name });
    if (!res.ok) { showToast(res.error, true); return; }
    showToast("Saved"); load();
  }

  return (
    <div>
      <div className="flex justify-between items-end mb-4">
        <p className="text-[#8A6F5C] text-sm">Opening, Production, Wastage, etc.</p>
        <Btn variant="primary" onClick={() => setEditing("new")}>+ Add section</Btn>
      </div>
      <Table head={["Name", "Scope", "Order", "Active", "Actions"]}>
        {rows.map((s) => {
          const scopeLabel = !s.deptId ? "All departments" :
            s.deptId.split(",").map((id) => departments.find((d) => d.id === id.trim())?.name || id).join(", ");
          return (
            <tr key={s.id} className="border-b border-[#EADFCB] hover:bg-[#FBF5EA]">
              <td className="px-3 py-2.5">{s.name}</td>
              <td className="px-3 py-2.5">{scopeLabel}</td>
              <td className="px-3 py-2.5">{s.order}</td>
              <td className="px-3 py-2.5"><Badge ok={s.active} /></td>
              <td className="px-3 py-2.5">
                <IconBtn onClick={() => setEditing(s)}>✎</IconBtn>
                {s.active && (
                  <IconBtn danger onClick={async () => {
                    if (!confirm(`Disable section "${s.name}"?`)) return;
                    const res = await rpc("deleteSection", { id: s.id });
                    if (!res.ok) showToast(res.error, true); else load();
                  }}>✕</IconBtn>
                )}
              </td>
            </tr>
          );
        })}
      </Table>

      <div className="bg-white border border-[#EADFCB] rounded-2xl p-5 mt-6">
        <h3 className="text-[14.5px] font-bold mb-1.5">Per-department visibility</h3>
        <p className="text-[13px] text-[#8A6F5C] mb-3">Turn a section off for a department to hide it from that department&rsquo;s app.</p>
        <Field label="Department">
          <SelectInput value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </SelectInput>
        </Field>
      </div>
      <div className="flex flex-col gap-2 mt-3">
        {rows.filter((s) => s.active).map((s) => {
          const key = `${filterDept}||${s.id}`;
          const ov = overrides[key];
          const active = ov ? ov.active : true;
          const nameVal = ov?.customName || "";
          return <SectionToggleRow key={s.id} section={s} active={active} customName={nameVal} onToggle={() => toggle(s.id, active, nameVal)} onSaveName={(n) => saveName(s.id, active, n)} />;
        })}
      </div>

      {editing && (
        <Modal title={editing === "new" ? "Add section" : "Edit section"} onClose={() => setEditing(null)}>
          <SectionForm departments={departments} section={editing === "new" ? null : editing} onSaved={() => { setEditing(null); load(); }} showToast={showToast} />
        </Modal>
      )}
    </div>
  );
}
function SectionToggleRow({ section, active, customName, onToggle, onSaveName }: {
  section: Section; active: boolean; customName: string; onToggle: () => void; onSaveName: (n: string) => void;
}) {
  const [name, setName] = useState(customName);
  return (
    <div className="bg-white border border-[#EADFCB] rounded-xl px-3.5 py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-bold text-[13.5px]">{section.name}</span>
        <Btn variant={active ? "primary" : "ghost"} onClick={onToggle}>{active ? "Visible" : "Hidden"}</Btn>
      </div>
      <div className="flex gap-2">
        <TextInput placeholder={`Custom name (blank = "${section.name}")`} value={name} onChange={(e) => setName(e.target.value)} />
        <Btn onClick={() => onSaveName(name)}>Save name</Btn>
      </div>
    </div>
  );
}
function SectionForm({ departments, section, onSaved, showToast }: { departments: Department[]; section: Section | null; onSaved: () => void; showToast: Toast }) {
  const initialDepts = section?.deptId ? section.deptId.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const [name, setName] = useState(section?.name || "");
  const [order, setOrder] = useState(section?.order ?? 0);
  const [all, setAll] = useState(initialDepts.length === 0);
  const [selected, setSelected] = useState<string[]>(initialDepts);
  const isReserved = name === "Opening" || name === "In Hand";
  const [movementSign, setMovementSign] = useState<"PLUS" | "MINUS">(section?.movementSign === "MINUS" ? "MINUS" : "PLUS");
  const [includeInReconciliation, setIncludeInReconciliation] = useState(section?.includeInReconciliation ?? false);
  async function save() {
    if (!name.trim()) { showToast("Name required", true); return; }
    if (!all && selected.length === 0) { showToast('Pick at least one department, or check "All departments"', true); return; }
    const res = await rpc("saveSection", {
      id: section?.id || "", name, order, active: true, departmentId: all ? "" : selected.join(","),
      movementSign, includeInReconciliation: isReserved ? false : includeInReconciliation,
    });
    if (!res.ok) { showToast(res.error, true); return; }
    showToast("Section saved"); onSaved();
  }




  return (
    <div>
      <Field label="Section name"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Display order"><TextInput type="number" value={order} onChange={(e) => setOrder(Number(e.target.value))} /></Field>
      <Field label="Visible to">
        <label className="flex items-center gap-2.5 mb-2.5 p-2.5 bg-[#FBF5EA] border-[1.5px] border-[#EADFCB] rounded-lg cursor-pointer">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
          <span className="text-[13px] font-bold">All departments</span>
        </label>
        <div className={`flex flex-col gap-1.5 max-h-48 overflow-y-auto border border-[#EADFCB] rounded-lg p-1.5 ${all ? "opacity-40 pointer-events-none" : ""}`}>
          {departments.map((d) => (
            <label key={d.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-md cursor-pointer">
              <input type="checkbox" checked={selected.includes(d.id)}
                onChange={(e) => setSelected((prev) => e.target.checked ? [...prev, d.id] : prev.filter((x) => x !== d.id))} />
              <span className="text-[13px]">{d.name}</span>
            </label>
          ))}
        </div>
      </Field>
      {!isReserved && (
  <>
    <Field label="Movement type (for Stock Reconciliation)">
      <SelectInput value={movementSign} onChange={(e) => setMovementSign(e.target.value as "PLUS" | "MINUS")}>
        <option value="PLUS">+ Plus (adds to expected stock)</option>
        <option value="MINUS">− Minus (subtracts from expected stock)</option>
      </SelectInput>
    </Field>
    <label className="flex items-center gap-2.5 mb-2.5 p-2.5 bg-[#FBF5EA] border-[1.5px] border-[#EADFCB] rounded-lg cursor-pointer">
      <input type="checkbox" checked={includeInReconciliation} onChange={(e) => setIncludeInReconciliation(e.target.checked)} />
      <span className="text-[13px] font-bold">Include in Stock Reconciliation report</span>
    </label>
  </>
)}
      <div className="flex justify-end gap-2 mt-4"><Btn variant="primary" onClick={save}>Save</Btn></div>
    </div>
  );
}

// ==================== DEVICES ====================
function DevicesTab({ showToast }: { showToast: Toast }) {
  const [rows, setRows] = useState<{ userId: string; userName: string; deviceId: string; deviceInfo: string; loginTime: string }[]>([]);
  const [search, setSearch] = useState("");
  const load = useCallback(async () => {
    const res = await rpc<{ sessions: typeof rows }>("listDeviceSessions");
    if (res.ok) setRows(res.sessions); else showToast(res.error, true);
  }, [showToast]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  const filtered = rows.filter((r) => !search || r.userName.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="bg-white border border-[#EADFCB] rounded-2xl p-4 mb-4">
        <TextInput placeholder="Search by user name…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <Table head={["User", "Device", "Last login", "Actions"]}>
        {filtered.map((x) => (
          <tr key={x.userId + x.deviceId} className="border-b border-[#EADFCB] hover:bg-[#FBF5EA]">
            <td className="px-3 py-2.5">{x.userName}</td>
            <td className="px-3 py-2.5">{x.deviceInfo}</td>
            <td className="px-3 py-2.5">{new Date(x.loginTime).toLocaleString()}</td>
            <td className="px-3 py-2.5">
              <IconBtn danger onClick={async () => {
                if (!confirm(`Remove this device from ${x.userName}'s account?`)) return;
                const res = await rpc("removeDeviceSession", { userId: x.userId, deviceId: x.deviceId });
                if (!res.ok) showToast(res.error, true); else { showToast("Device removed"); load(); }
              }}>✕</IconBtn>
            </td>
          </tr>
        ))}
        {!filtered.length && <tr><td colSpan={4} className="px-3 py-4 text-[#8A6F5C]">No device logins recorded yet.</td></tr>}
      </Table>
    </div>
  );
}

// ==================== LOGS ====================
function LogsTab() {
  const [rows, setRows] = useState<{ timestamp: string; userName: string; action: string; entityType: string; entityId: string; details: string }[]>([]);
  useEffect(() => {
    rpc<{ logs: typeof rows }>("getLogs", { limit: 300 }).then((res) => { if (res.ok) setRows(res.logs); });
  }, []);
  return (
    <Table head={["Time", "User", "Action", "Entity", "Details"]}>
      {rows.map((l, i) => (
        <tr key={i} className="border-b border-[#EADFCB] hover:bg-[#FBF5EA]">
          <td className="px-3 py-2.5">{new Date(l.timestamp).toLocaleString()}</td>
          <td className="px-3 py-2.5">{l.userName}</td>
          <td className="px-3 py-2.5">{l.action}</td>
          <td className="px-3 py-2.5">{l.entityType} {l.entityId}</td>
          <td className="px-3 py-2.5">{l.details}</td>
        </tr>
      ))}
    </Table>
  );
}
