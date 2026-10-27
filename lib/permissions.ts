// Shared (client + server safe — NO server imports here).
// Per-Admin access model, configured by a Super Admin in the Admins tab.
//
// Stored on the Users sheet, on the Admin's own row:
//   Permissions            -> JSON, e.g. {"tabs":["dashboard","report"],"users":"view"}
//   AdminBackDateEditDays  -> ""           = use the global default (Admin Entry tab)
//                             "unlimited"  = no limit
//                             "3"          = may edit up to 3 days back
//
// A blank Permissions cell = legacy Admin = every section + full user management,
// so existing Admin accounts keep working exactly as before until customised.

export const GRANTABLE_TABS = [
  { key: "dashboard", label: "Dashboard", icon: "🏠" },
  { key: "report", label: "Reports", icon: "📊" },
  { key: "review", label: "Review", icon: "🧮" },
  { key: "access", label: "Access Menu", icon: "🔐" },
  { key: "godmode", label: "Admin Entry", icon: "🛡️" },
  { key: "upload", label: "Bulk Upload", icon: "⬆️" },
  { key: "categories", label: "Categories", icon: "🗂️" },
  { key: "items", label: "Items", icon: "📦" },
  { key: "sections", label: "Sections", icon: "🧩" },
  { key: "devices", label: "Devices", icon: "💻" },
  { key: "logs", label: "Logs", icon: "📄" },
] as const;

export type TabKey = (typeof GRANTABLE_TABS)[number]["key"];
export const ALL_TAB_KEYS: TabKey[] = GRANTABLE_TABS.map((t) => t.key);

export type UsersLevel = "none" | "view" | "manage";
export const USERS_LEVELS: { value: UsersLevel; label: string }[] = [
  { value: "none", label: "No access (Users tab hidden)" },
  { value: "view", label: "View only" },
  { value: "manage", label: "View + add / edit / deactivate" },
];

export type AdminPermissions = { tabs: TabKey[]; users: UsersLevel };
export type BackDateSetting = { mode: "default" | "custom" | "unlimited"; days?: number };

export const DEFAULT_PERMISSIONS: AdminPermissions = { tabs: [...ALL_TAB_KEYS], users: "manage" };

export function parsePermissions(raw: unknown): AdminPermissions {
  const text = String(raw ?? "").trim();
  if (!text) return { ...DEFAULT_PERMISSIONS, tabs: [...ALL_TAB_KEYS] };
  try {
    const j = JSON.parse(text);
    const tabs = Array.isArray(j.tabs) ? (j.tabs.filter((t: unknown) => ALL_TAB_KEYS.includes(t as TabKey)) as TabKey[]) : [];
    const users: UsersLevel = j.users === "manage" || j.users === "view" ? j.users : "none";
    return { tabs, users };
  } catch {
    // Corrupt cell -> fail CLOSED (nothing), never open.
    return { tabs: [], users: "none" };
  }
}

export function sanitizePermissions(input: unknown): AdminPermissions {
  const i = (input || {}) as { tabs?: unknown; users?: unknown };
  const tabs = Array.isArray(i.tabs) ? (i.tabs.filter((t) => ALL_TAB_KEYS.includes(t as TabKey)) as TabKey[]) : [];
  const users: UsersLevel = i.users === "manage" || i.users === "view" ? i.users : "none";
  return { tabs: Array.from(new Set(tabs)), users };
}

export function parseBackDate(raw: unknown): BackDateSetting {
  const t = String(raw ?? "").trim().toLowerCase();
  if (!t) return { mode: "default" };
  if (t === "unlimited") return { mode: "unlimited" };
  const n = Number(t);
  return !isNaN(n) && n >= 0 ? { mode: "custom", days: Math.floor(n) } : { mode: "default" };
}

export function serializeBackDate(b: BackDateSetting | undefined): string {
  if (!b || b.mode === "default") return "";
  if (b.mode === "unlimited") return "unlimited";
  const n = Number(b.days);
  if (isNaN(n) || n < 0) throw new Error("Back-date days must be a non-negative number.");
  return String(Math.floor(n));
}

export function describeBackDate(b: BackDateSetting): string {
  return b.mode === "default" ? "Default" : b.mode === "unlimited" ? "Unlimited" : `${b.days} day(s)`;
}
