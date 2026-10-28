"use client";
import { ReactNode } from "react";

export function Modal({ title, onClose, children, wide }: {
  title: string; onClose: () => void; children: ReactNode; wide?: boolean;
}) {
  return (
    <div className="cc-backdrop" onClick={onClose}>
      <div className={`cc-modal cc-scroll ${wide ? "max-w-2xl" : "max-w-md"}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[15px] font-bold" style={{ color: "var(--ink)" }}>{title}</h3>
          <button onClick={onClose} className="btn-icon btn w-8 h-8 text-lg leading-none">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      {children}
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`cc-input ${props.className || ""}`} />;
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`cc-input cc-select ${props.className || ""}`} />;
}

export function Btn({
  variant = "ghost", ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "ghost" | "primary" | "danger" }) {
  const cls = variant === "primary" ? "btn-primary" : variant === "danger" ? "btn-danger" : "btn-ghost";
  return <button {...props} className={`btn btn-sm ${cls} ${props.className || ""}`} />;
}

export function Badge({ ok }: { ok: boolean }) {
  return (
    <span className={`badge badge-dot ${ok ? "badge-green" : "badge-red"}`}>
      {ok ? "Active" : "Inactive"}
    </span>
  );
}

export function IconBtn({ danger, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return <button {...props} className={`btn btn-icon ${danger ? "danger" : ""} ${props.className || ""}`} />;
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="cc-table-wrap">
      <table className="cc-table">
        <thead>
          <tr>{head.map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
