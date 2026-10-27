"use client";

// Super Admin only: create / edit / deactivate Admin and Super Admin accounts,
// reset their PIN, and decide EXACTLY what each Admin can see and do:
//   - which sections (tabs) they get
//   - whether they can view / manage Department Users
//   - how many days back they may edit entries
// Everything is enforced again on the server (see /api/rpc + lib/server/directory.ts).

import { useCallback, useEffect, useState } from "react";
import { rpc } from "@/lib/api";
import {
  GRANTABLE_TABS, ALL_TAB_KEYS, USERS_LEVELS, describeBackDate,
  type AdminPermissions, type BackDateSetting, type TabKey, type UsersLevel,
} from "@/lib/permissions";
import { Modal, Field, TextInput, SelectInput, Btn, Badge, IconBtn, Table } from "./ui";

type Toast = (msg: string, err?: boolean) => void;
type AdminRow = {
  userId: string; email: string; name: string; role: string; active: boolean;
  permissions: AdminPermissions; backDate: BackDateSetting;
};

function accessSummary(u: AdminRow) {
  if (u.role === "Super Admin") return "Full access";
  const p = u.permissions;
  const usersTxt = p.users === "manage" ? "manage" : p.users === "view" ? "view" : "no";
  return `${p.tabs.length}/${ALL_TAB_KEYS.length} sections · Users: ${usersTxt} · Back-date: ${describeBackDate(u.backDate)}`;
}

export default function AdminsTab({ currentUserId, showToast }: { currentUserId: string; showToast: Toast }) {
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [editing, setEditing] = useState<AdminRow | null | "new">(null);
  const [resetting, setResetting] = useState<AdminRow | null>(null);

  const load = useCallback(async () => {
    const res = await rpc<{ users: AdminRow[] }>("listUsers", { scope: "admins" });
    if (res.ok) setRows(res.users); else showToast(res.error, true);
  }, [showToast]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex justify-between items-end mb-4 gap-3 flex-wrap">
        <p className="text-[#8A6F5C] text-sm">
          Create Admins and choose exactly what each one can see and do. Regular Admins cannot see or change these accounts.
        </p>
        <Btn variant="primary" onClick={() => setEditing("new")}>+ Add admin</Btn>
      </div>
      <Table head={["Email", "Name", "Role", "Access", "Active", "Actions"]}>
        {rows.map((u) => {
          const isMe = u.userId === currentUserId;
          return (
            <tr key={u.email} className="border-b border-[#EADFCB] hover:bg-[#FBF5EA]">
              <td className="px-3 py-2.5">{u.email}</td>
              <td className="px-3 py-2.5">{u.name}{isMe && <span className="ml-1.5 text-[10px] font-bold text-[#C75B0C]">(you)</span>}</td>
              <td className="px-3 py-2.5">
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${u.role === "Super Admin" ? "bg-[#FDEBD6] text-[#7A3E0A]" : "bg-[#F3E7D3] text-[#6B4F3B]"}`}>
                  {u.role === "Super Admin" ? "👑 Super Admin" : "Admin"}
                </span>
              </td>
              <td className="px-3 py-2.5 text-[11.5px] text-[#8A6F5C]">{accessSummary(u)}</td>
              <td className="px-3 py-2.5"><Badge ok={u.active} /></td>
              <td className="px-3 py-2.5 whitespace-nowrap">
                <IconBtn title="Edit access" onClick={() => setEditing(u)}>✎</IconBtn>
                <IconBtn title="Reset PIN" onClick={() => setResetting(u)}>🔑</IconBtn>
                {u.active && !isMe && (
                  <IconBtn danger title="Deactivate" onClick={async () => {
                    if (!confirm(`Deactivate ${u.email}?`)) return;
                    const res = await rpc("deactivateUser", { email: u.email });
                    if (!res.ok) showToast(res.error, true); else { showToast("Admin deactivated"); load(); }
                  }}>✕</IconBtn>
                )}
              </td>
            </tr>
          );
        })}
        {!rows.length && (
          <tr><td colSpan={6} className="px-3 py-6 text-center text-[#8A6F5C]">No admin accounts yet.</td></tr>
        )}
      </Table>

      {editing && (
        <Modal wide title={editing === "new" ? "Add admin" : `Edit — ${editing.name}`} onClose={() => setEditing(null)}>
          <AdminForm
            admin={editing === "new" ? null : editing}
            onSaved={() => { setEditing(null); load(); }}
            showToast={showToast}
          />
        </Modal>
      )}
      {resetting && (
        <Modal title={`Reset PIN — ${resetting.name}`} onClose={() => setResetting(null)}>
          <ResetPinForm admin={resetting} onDone={() => setResetting(null)} showToast={showToast} />
        </Modal>
      )}
    </div>
  );
}

function AdminForm({ admin, onSaved, showToast }: { admin: AdminRow | null; onSaved: () => void; showToast: Toast }) {
  const [email, setEmail] = useState(admin?.email || "");
  const [name, setName] = useState(admin?.name || "");
  const [role, setRole] = useState(admin?.role || "Admin");
  const [active, setActive] = useState(admin ? admin.active : true);
  const [pin, setPin] = useState("");
  const [tabs, setTabs] = useState<TabKey[]>(admin ? admin.permissions.tabs : [...ALL_TAB_KEYS]);
  const [usersLevel, setUsersLevel] = useState<UsersLevel>(admin ? admin.permissions.users : "view");
  const [bdMode, setBdMode] = useState<BackDateSetting["mode"]>(admin?.backDate.mode || "default");
  const [bdDays, setBdDays] = useState<string>(admin?.backDate.mode === "custom" ? String(admin.backDate.days ?? 1) : "1");
  const [saving, setSaving] = useState(false);

  const isAdminRole = role === "Admin";
  const toggleTab = (k: TabKey) => setTabs((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  async function save() {
    if (!email.trim() || !name.trim()) { showToast("Email and name required", true); return; }
    if (!admin && !pin.trim()) { showToast("PIN required for a new admin", true); return; }
    if (isAdminRole && bdMode === "custom" && (bdDays.trim() === "" || isNaN(Number(bdDays)) || Number(bdDays) < 0)) {
      showToast("Enter a valid number of days", true); return;
    }
    setSaving(true);
    const body: Record<string, unknown> = { email: email.trim(), name: name.trim(), departmentId: "", role, pin: pin.trim(), active };
    if (isAdminRole) {
      body.permissions = { tabs, users: usersLevel };
      body.backDate = bdMode === "custom" ? { mode: "custom", days: Number(bdDays) } : { mode: bdMode };
    }
    const res = await rpc("saveUser", body);
    setSaving(false);
    if (!res.ok) { showToast(res.error, true); return; }
    showToast("Admin saved"); onSaved();
  }

  return (
    <div>
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field label="Email"><TextInput value={email} disabled={!!admin} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Name"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Role">
          <SelectInput value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="Admin">Admin (custom access)</option>
            <option value="Super Admin">Super Admin (full access)</option>
          </SelectInput>
        </Field>
        <Field label={`PIN ${admin ? "(leave blank to keep existing)" : ""}`}>
          <TextInput value={pin} onChange={(e) => setPin(e.target.value)} />
        </Field>
        {admin && (
          <Field label="Status">
            <SelectInput value={active ? "1" : "0"} onChange={(e) => setActive(e.target.value === "1")}>
              <option value="1">Active</option>
              <option value="0">Inactive</option>
            </SelectInput>
          </Field>
        )}
      </div>

      {!isAdminRole ? (
        <div className="bg-[#FDEBD6] text-[#7A3E0A] text-[12.5px] rounded-xl p-3 mt-1">
          👑 Super Admins always have every section, full user management, Admin / Department management and no back-date limit.
        </div>
      ) : (
        <>
          <div className="mt-2 mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-[#8A6F5C]">Sections this Admin can open ({tabs.length}/{ALL_TAB_KEYS.length})</label>
              <div className="flex gap-1.5">
                <Btn onClick={() => setTabs([...ALL_TAB_KEYS])} style={{ padding: "4px 10px" }}>Select all</Btn>
                <Btn onClick={() => setTabs([])} style={{ padding: "4px 10px" }}>Clear</Btn>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {GRANTABLE_TABS.map((t) => {
                const on = tabs.includes(t.key);
                return (
                  <label
                    key={t.key}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border-[1.5px] text-[12.5px] font-semibold cursor-pointer select-none ${on ? "border-[#C75B0C] bg-[#FDEBD6] text-[#7A3E0A]" : "border-[#EADFCB] bg-[#FBF5EA] text-[#7A5C47]"}`}
                  >
                    <input type="checkbox" checked={on} onChange={() => toggleTab(t.key)} className="w-4 h-4 accent-[#E8731A]" />
                    <span>{t.icon}</span>{t.label}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-x-4">
            <Field label="Department users (Users tab)">
              <SelectInput value={usersLevel} onChange={(e) => setUsersLevel(e.target.value as UsersLevel)}>
                {USERS_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </SelectInput>
            </Field>
            <Field label="Back-date entry limit (Admin Entry)">
              <SelectInput value={bdMode} onChange={(e) => setBdMode(e.target.value as BackDateSetting["mode"])}>
                <option value="default">Use default (set in Admin Entry tab)</option>
                <option value="custom">Custom number of days</option>
                <option value="unlimited">Unlimited</option>
              </SelectInput>
            </Field>
          </div>
          {bdMode === "custom" && (
            <Field label="Can edit entries up to how many days back?">
              <TextInput type="number" min={0} value={bdDays} onChange={(e) => setBdDays(e.target.value)} />
            </Field>
          )}
          <p className="text-[11.5px] text-[#8A6F5C]">
            The back-date limit applies to Admin Entry (saving and voiding). Changes apply to the Admin right away — no re-login needed.
          </p>
        </>
      )}

      <div className="flex justify-end gap-2 mt-4">
        <Btn variant="primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Btn>
      </div>
    </div>
  );
}

function ResetPinForm({ admin, onDone, showToast }: { admin: AdminRow; onDone: () => void; showToast: Toast }) {
  const [pin, setPin] = useState("");
  async function save() {
    if (!pin.trim()) { showToast("Enter a new PIN", true); return; }
    const res = await rpc("resetUserPassword", { email: admin.email, newPin: pin.trim() });
    if (!res.ok) { showToast(res.error, true); return; }
    showToast("PIN reset"); onDone();
  }
  return (
    <div>
      <Field label="New PIN"><TextInput value={pin} onChange={(e) => setPin(e.target.value)} /></Field>
      <div className="flex justify-end gap-2 mt-4"><Btn variant="primary" onClick={save}>Reset PIN</Btn></div>
    </div>
  );
}
