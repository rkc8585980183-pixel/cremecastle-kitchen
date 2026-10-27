"use client";

import { ReactNode } from "react";

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[300]" onClick={onClose}>
      <div className={`bg-white rounded-2xl p-6 w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[88vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold mb-3.5">{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <label className="text-xs font-bold text-[#8A6F5C] block mb-1.5">{label}</label>
      {children}
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full h-[42px] border-[1.5px] border-[#EADFCB] rounded-lg px-3 text-sm bg-[#FBF5EA] focus:outline-none focus:border-[#C75B0C] ${props.className || ""}`}
    />
  );
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full h-[42px] border-[1.5px] border-[#EADFCB] rounded-lg px-3 text-sm bg-[#FBF5EA] focus:outline-none focus:border-[#C75B0C] ${props.className || ""}`}
    />
  );
}

const BTN_STYLES: Record<"ghost" | "primary" | "danger", React.CSSProperties> = {
  ghost: { background: "#FFFFFF", color: "#2B1810", border: "1px solid #EADFCB" },
  primary: { background: "#C75B0C", color: "#FFFFFF", border: "1px solid #C75B0C" },
  danger: { background: "#C0463F", color: "#FFFFFF", border: "1px solid #C0463F" },
};

export function Btn({ variant = "ghost", style, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "ghost" | "primary" | "danger" }) {
  return (
    <button
      {...props}
      style={{ ...BTN_STYLES[variant], ...style }}
      className={`rounded-lg px-3.5 py-2 text-[12.5px] font-bold cursor-pointer disabled:opacity-50 ${props.className || ""}`}
    />
  );
}

export function Badge({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${ok ? "text-[#1E7F72] bg-teal-50" : "text-[#C0463F] bg-red-50"}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {ok ? "Yes" : "No"}
    </span>
  );
}

export function IconBtn({ danger, style, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <button
      {...props}
      style={{ background: "#FFFFFF", border: "1px solid #EADFCB", color: danger ? "#C0463F" : "#2B1810", ...style }}
      className={`w-8 h-8 rounded-lg text-[13px] mr-1 cursor-pointer ${props.className || ""}`}
    />
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto border border-[#EADFCB] rounded-2xl bg-white">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className="bg-[#FBF5EA] text-left px-3 py-2.5 text-[#8A6F5C] text-[10.5px] uppercase tracking-wide border-b border-[#EADFCB]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
