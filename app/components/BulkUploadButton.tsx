"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { rpc } from "@/lib/api";

type ItemLite = { name: string; catId: string };
type CategoryLite = { id: string; name: string };

type Props = {
  sectionName: string;
  /** True only for the "In Hand" (System Stock) section — its template
   *  carries its own Date column per row, since a system-stock file may
   *  cover several dates at once. Regular movement sections (Production,
   *  Transfer, KOT, Wastage, …) always use the date already selected in
   *  the header, so no Date column is needed for those. */
  isSystemStock: boolean;
  /** Only used for regular movements, to write a real category name into
   *  the template + resolve it on upload (System Stock doesn't need it). */
  items: ItemLite[];
  categories: CategoryLite[];
  onUploaded: () => void;
  showToast: (msg: string, err?: boolean) => void;
};

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function BulkUploadButton({ sectionName, isSystemStock, items, categories, onUploaded, showToast }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  function downloadTemplate() {
    const catName = (catId: string) => categories.find((c) => c.id === catId)?.name || "";

    let rows: Record<string, string | number>[];
    if (isSystemStock) {
      rows = items.length
        ? items.map((it) => ({ Date: todayLocal(), "Item Name": it.name, Qty: "" }))
        : [{ Date: todayLocal(), "Item Name": "", Qty: "" }];
    } else {
      rows = items.length
        ? items.map((it) => ({ Category: catName(it.catId), "Item Name": it.name, Qty: "", Unit: "" }))
        : [{ Category: "", "Item Name": "", Qty: "", Unit: "" }];
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sectionName.slice(0, 30));
    XLSX.writeFile(wb, `${sectionName.replace(/\s+/g, "_")}_template.xlsx`);
  }

  function parseFile(file: File): Promise<Record<string, unknown>[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: "array" });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          resolve(XLSX.utils.sheet_to_json(sheet, { defval: "" }));
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const raw = await parseFile(file);
      if (!raw.length) {
        showToast("File is empty", true);
        return;
      }

      const entries: { itemName: string; sectionName: string; qty: number; date: string; category?: string }[] = [];
      const skipped: string[] = [];

      for (const row of raw) {
        const itemName = String(row["Item Name"] ?? row["item name"] ?? "").trim();
        const qtyRaw = row["Qty"] ?? row["qty"] ?? "";
        const qty = Number(qtyRaw);

        if (!itemName || qtyRaw === "" || isNaN(qty) || qty < 0) continue; // blank template rows, silently skipped

        let date = todayLocal();
        if (isSystemStock) {
          const d = String(row["Date"] ?? row["date"] ?? "").trim();
          if (!d) { skipped.push(`${itemName}: missing Date`); continue; }
          date = d;
        }

        const known = items.find((it) => it.name.trim().toLowerCase() === itemName.toLowerCase());
        if (!known) { skipped.push(`${itemName}: not found in item master`); continue; }

        entries.push({ itemName, sectionName, qty, date, category: String(row["Category"] ?? "") });
      }

      if (!entries.length) {
        showToast(skipped.length ? `No valid rows. ${skipped[0]}` : "No valid rows found in file", true);
        return;
      }

      const res = await rpc<{ savedCount: number }>("saveBulkEntries", { entries });
      if (!res.ok) {
        showToast(res.error, true);
        return;
      }

      showToast(
        skipped.length
          ? `Uploaded ${res.savedCount} row(s), skipped ${skipped.length} (see console)`
          : `Uploaded ${res.savedCount} row(s)`
      );
      if (skipped.length) console.warn("Bulk upload skipped rows:", skipped);
      onUploaded();
    } catch {
      showToast("Could not read that file — check it's a valid .xlsx or .csv", true);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const chip = { border: "1.5px solid #EBD7BA", background: "#F5E6D0", color: "#4A2A12" };
  const icon = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  return (
    <div className="flex gap-2">
      <button
        onClick={downloadTemplate}
        className="h-10 rounded-xl px-2.5 text-[12px] font-bold cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
        style={chip}
        title="Download template"
      >
        <svg {...icon}><path d="M12 4v11M7.5 11 12 15.5 16.5 11M5 20h14" /></svg>
        Template
      </button>
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="h-10 rounded-xl px-2.5 text-[12px] font-bold cursor-pointer flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
        style={chip}
        title="Upload Excel/CSV"
      >
        <svg {...icon}><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 17.9 8.2 4.8 4.8 0 0 1 17.5 18H16M12 21v-9M8.5 15.5 12 12l3.5 3.5" /></svg>
        {uploading ? "Uploading…" : "Upload"}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
    </div>
  );
}
