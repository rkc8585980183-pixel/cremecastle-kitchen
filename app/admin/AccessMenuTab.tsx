"use client";

import { useCallback, useEffect, useState } from "react";
import { rpc } from "@/lib/api";
import { Department, Category, Item } from "@/lib/types";
import { Modal, Field, TextInput, SelectInput, Btn, Table } from "./ui";

type Toast = (msg: string, err?: boolean) => void;

type DeptLimit = { departmentId: string; departmentName: string; active: boolean; backDateEditDays: number };
type Grant = {
  id: string; departmentId: string; departmentName: string; itemId: string; itemName: string;
  dateKey: string; grantedBy: string; grantedAt: string; active: boolean;
};

export default function AccessMenuTab({ departments, categories, items, showToast }: { departments: Department[]; categories: Category[]; items: Item[]; showToast: Toast }) {
  const [limits, setLimits] = useState<DeptLimit[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingDept, setEditingDept] = useState<DeptLimit | null>(null);
  const [allDaysModal, setAllDaysModal] = useState(false);
  const [grantModal, setGrantModal] = useState(false);
  const [editEntryModal, setEditEntryModal] = useState<{ departmentId: string; itemName: string; date: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [lRes, gRes] = await Promise.all([
      rpc<{ departments: DeptLimit[] }>("listDepartmentBackDateLimits"),
      rpc<{ grants: Grant[] }>("listSpecialAccess"),
    ]);
    if (lRes.ok) setLimits(lRes.departments);
    if (gRes.ok) setGrants(gRes.grants.filter((g) => g.active));
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function saveDeptDays(departmentId: string, days: number) {
    const res = await rpc("setBackDateEditDays", { departmentId, days });
    if (!res.ok) { showToast(res.error, true); return; }
    showToast("Back-date edit days updated");
    setEditingDept(null);
    load();
  }

  async function saveAllDays(days: number) {
    const res = await rpc<{ updated: number }>("setBackDateEditDaysForAll", { days });
    if (!res.ok) { showToast(res.error, true); return; }
    showToast(`Updated ${res.updated} department(s)`);
    setAllDaysModal(false);
    load();
  }

  async function revokeGrant(id: string) {
    if (!confirm("Revoke this Special Edit Access grant?")) return;
    const res = await rpc("revokeSpecialAccess", { id });
    if (!res.ok) { showToast(res.error, true); return; }
    showToast("Access revoked");
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold">Access Menu</h2>
          <p className="text-[#8A6F5C] text-sm">Control how far back each department can edit entries, and grant one-off exceptions.</p>
        </div>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={() => setAllDaysModal(true)}>🏢 Set for All Departments</Btn>
          <Btn variant="primary" onClick={() => setGrantModal(true)}>➕ Grant Special Access</Btn>
        </div>
      </div>

      <h3 className="text-sm font-bold mb-2 mt-6">Back-Date Edit Days (per department)</h3>
      {loading ? (
        <div className="text-[#8A6F5C] text-sm">Loading…</div>
      ) : (
        <Table head={["Department", "Back-Date Edit Days", "Status", ""]}>
          {limits.map((d) => (
            <tr key={d.departmentId} className="border-b border-[#EADFCB]">
              <td className="px-3 py-2.5 font-semibold">{d.departmentName}</td>
              <td className="px-3 py-2.5">{d.backDateEditDays} day{d.backDateEditDays === 1 ? "" : "s"}</td>
              <td className="px-3 py-2.5">{d.active ? "Active" : "Inactive"}</td>
              <td className="px-3 py-2.5">
                <Btn variant="ghost" onClick={() => setEditingDept(d)}>Edit</Btn>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <h3 className="text-sm font-bold mb-2 mt-8">Special Edit Access (active grants)</h3>
      <Table head={["Department", "Item", "Date", "Granted By", "Granted At", ""]}>
        {grants.map((g) => (
          <tr key={g.id} className="border-b border-[#EADFCB]">
            <td className="px-3 py-2.5 font-semibold">{g.departmentName}</td>
            <td className="px-3 py-2.5">{g.itemName || "All items"}</td>
            <td className="px-3 py-2.5">{g.dateKey}</td>
            <td className="px-3 py-2.5">{g.grantedBy}</td>
            <td className="px-3 py-2.5">{g.grantedAt}</td>
            <td className="px-3 py-2.5">
              <Btn variant="danger" onClick={() => revokeGrant(g.id)}>Revoke</Btn>
            </td>
          </tr>
        ))}
        {!grants.length && (
          <tr><td colSpan={6} className="px-3 py-4 text-center text-[#8A6F5C]">No active special access grants.</td></tr>
        )}
      </Table>

      <h3 className="text-sm font-bold mb-2 mt-8">Open a back-date entry</h3>
      <p className="text-[#8A6F5C] text-xs mb-2.5">
        Pick a department, item and date to fill or edit an entry directly — this bypasses the normal Back-Date Edit Days limit for Admins.
      </p>
      <Btn variant="primary" onClick={() => setEditEntryModal({ departmentId: departments[0]?.id || "", itemName: "", date: new Date().toISOString().slice(0, 10) })}>
        ✏️ Open Back-Date Entry Editor
      </Btn>

      {editingDept && (
        <EditDeptDaysModal dept={editingDept} onClose={() => setEditingDept(null)} onSave={saveDeptDays} />
      )}
      {allDaysModal && (
        <AllDaysModal onClose={() => setAllDaysModal(false)} onSave={saveAllDays} />
      )}
      {grantModal && (
        <GrantAccessModal
          departments={departments} categories={categories} items={items}
          onClose={() => setGrantModal(false)}
          onSaved={() => { setGrantModal(false); load(); }}
          showToast={showToast}
        />
      )}
      {editEntryModal && (
        <BackDateEntryModal
          departments={departments} items={items} initial={editEntryModal}
          onClose={() => setEditEntryModal(null)}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function EditDeptDaysModal({ dept, onClose, onSave }: { dept: DeptLimit; onClose: () => void; onSave: (departmentId: string, days: number) => void }) {
  const [days, setDays] = useState(dept.backDateEditDays);
  return (
    <Modal title={`Back-Date Edit Days — ${dept.departmentName}`} onClose={onClose}>
      <Field label="Days">
        <TextInput type="number" min={0} value={days} onChange={(e) => setDays(Number(e.target.value))} />
      </Field>
    <p className="text-[11.5px] text-[#8A6F5C] mb-3">Example: entering 5 lets this department edit entries up to 5 previous days.</p>
      <div className="flex justify-end gap-2 mt-4">
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={() => onSave(dept.departmentId, days)}>Save</Btn>
      </div>
    </Modal>
  );
}

function AllDaysModal({ onClose, onSave }: { onClose: () => void; onSave: (days: number) => void }) {
  const [days, setDays] = useState(1);
  return (
    <Modal title="Set Back-Date Edit Days — All Departments" onClose={onClose}>
      <Field label="Days">
        <TextInput type="number" min={0} value={days} onChange={(e) => setDays(Number(e.target.value))} />
      </Field>
      <p className="text-[11.5px] text-[#8A6F5C] mb-3">This overwrites every department&apos;s individual setting.</p>
      <div className="flex justify-end gap-2 mt-4">
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={() => onSave(days)}>Apply to All</Btn>
      </div>
    </Modal>
  );
}

function GrantAccessModal({
  departments, items, onClose, onSaved, showToast,
}: { departments: Department[]; categories: Category[]; items: Item[]; onClose: () => void; onSaved: () => void; showToast: Toast }) {
  const [departmentId, setDepartmentId] = useState(departments[0]?.id || "");
  const [itemId, setItemId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const deptItems = items.filter((i) => { const ids = String(i.deptId || "").split(",").map((x) => x.trim()).filter(Boolean); return ids.length === 0 || ids.includes(departmentId); });

  async function save() {
    if (!departmentId || !date) { showToast("Department and date are required", true); return; }
    setSaving(true);
    const chosenItem = deptItems.find((i) => i.id === itemId);
    const res = await rpc("grantSpecialAccess", {
      departmentId, itemId: itemId || "", itemName: chosenItem?.name || "", date,
    });
    setSaving(false);
    if (!res.ok) { showToast(res.error, true); return; }
    showToast("Special access granted");
    onSaved();
  }

  return (
    <Modal title="Grant Special Edit Access" onClose={onClose}>
      <Field label="Department">
        <SelectInput value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setItemId(""); }}>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </SelectInput>
      </Field>
      <Field label="Item (leave blank to allow all items in this department for this date)">
        <SelectInput value={itemId} onChange={(e) => setItemId(e.target.value)}>
          <option value="">— All items —</option>
          {deptItems.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </SelectInput>
      </Field>
      <Field label="Date">
        <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={save} disabled={saving}>{saving ? "Granting…" : "Grant Access"}</Btn>
      </div>
    </Modal>
  );
}

function BackDateEntryModal({
  departments, items, initial, onClose, showToast,
}: { departments: Department[]; items: Item[]; initial: { departmentId: string; itemName: string; date: string }; onClose: () => void; showToast: Toast }) {
  const [departmentId, setDepartmentId] = useState(initial.departmentId);
  const [date, setDate] = useState(initial.date);
  const [itemName, setItemName] = useState("");
  const [sectionName, setSectionName] = useState("Opening");
  const [qty, setQty] = useState("");
  const [saving, setSaving] = useState(false);

  const deptItems = items.filter((i) => { const ids = String(i.deptId || "").split(",").map((x) => x.trim()).filter(Boolean); return ids.length === 0 || ids.includes(departmentId); });

  async function save() {
    if (!departmentId || !itemName || !sectionName || !date || qty === "") {
      showToast("All fields are required", true);
      return;
    }
    setSaving(true);
    const res = await rpc("adminSaveBackDateEntry", { departmentId, itemName, sectionName, date, qty: Number(qty) });
    setSaving(false);
    if (!res.ok) { showToast(res.error, true); return; }
    showToast("Back-date entry saved");
    onClose();
  }

  return (
    <Modal title="Back-Date Entry Editor (Admin)" onClose={onClose}>
      <Field label="Department">
        <SelectInput value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setItemName(""); }}>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </SelectInput>
      </Field>
      <Field label="Item">
        <SelectInput value={itemName} onChange={(e) => setItemName(e.target.value)}>
          <option value="">— Select item —</option>
          {deptItems.map((i) => <option key={i.id} value={i.name}>{i.name}</option>)}
        </SelectInput>
      </Field>
      <Field label="Section / Movement">
        <TextInput value={sectionName} onChange={(e) => setSectionName(e.target.value)} placeholder="e.g. Opening, Production, Wastage" />
      </Field>
      <Field label="Date">
        <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Quantity">
        <TextInput type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Entry"}</Btn>
      </div>
    </Modal>
  );
}
