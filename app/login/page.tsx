"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getDeviceId, getDeviceInfo } from "@/lib/api";

type Profile = { identifier: string; name: string; role: string; pin?: string };
const PROFILES_KEY = "cc_saved_profiles";

function getSavedProfiles(): Profile[] {
  try { return JSON.parse(localStorage.getItem(PROFILES_KEY) || "[]"); } catch { return []; }
}
function upsertProfile(p: Profile) {
  const list = getSavedProfiles();
  const idx = list.findIndex((x) => x.identifier.toLowerCase() === p.identifier.toLowerCase());
  if (idx === -1) list.push(p); else list[idx] = p;
  localStorage.setItem(PROFILES_KEY, JSON.stringify(list));
}
function removeProfile(identifier: string) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(
    getSavedProfiles().filter((x) => x.identifier.toLowerCase() !== identifier.toLowerCase())
  ));
}
function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}
function roleColor(role: string) {
  if (role === "Super Admin") return "from-[#7C3AED] to-[#5B21B6]";
  if (role === "Admin") return "from-[#E8731A] to-[#C75B0C]";
  return "from-[#16A07A] to-[#0F7A5C]";
}

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [pin, setPin] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [showPin, setShowPin] = useState(false);

  useEffect(() => { setProfiles(getSavedProfiles()); }, []);

  async function doLogin(id: string, pinValue: string, remember: boolean) {
    setLoading(true); setErr(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: id, pin: pinValue, deviceId: getDeviceId(), deviceInfo: getDeviceInfo() }),
      });
      const data = await res.json();
      if (!data.ok) { setErr(data.error || "Login failed."); setLoading(false); return; }
      upsertProfile({ identifier: id, name: data.user.name, role: data.user.role, pin: remember ? pinValue : undefined });
      router.push(data.user.role === "Admin" || data.user.role === "Super Admin" ? "/admin" : "/app");
      router.refresh();
    } catch { setErr("Something went wrong. Try again."); setLoading(false); }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || !pin.trim()) return;
    doLogin(identifier.trim(), pin.trim(), keepSignedIn);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: "linear-gradient(145deg, #1E0F06 0%, #2B1810 40%, #1A0C04 100%)" }}
    >
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #E8731A, transparent)" }} />
        <div className="absolute -bottom-40 -left-20 w-80 h-80 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #F28C38, transparent)" }} />
        <div className="absolute top-1/2 left-1/4 w-64 h-64 rounded-full opacity-5"
          style={{ background: "radial-gradient(circle, #FFB347, transparent)" }} />
      </div>

      <div className="w-full max-w-sm relative z-10">
        {/* Logo + brand */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 overflow-hidden shadow-2xl ring-2 ring-white/10"
            style={{ background: "linear-gradient(135deg, #F28C38, #C75B0C)" }}>
            <img
              src="https://lh3.googleusercontent.com/d/1XNpcNjDPcpFxIoDjHMhoWOYAJtqQWshj=w128-h128"
              alt="Creme Castle"
              className="w-full h-full object-cover"
            />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Creme Castle</h1>
          <p className="text-[13px] mt-1" style={{ color: "#B08060" }}>Kitchen Inventory System</p>
        </div>

        {/* Main card */}
        <div className="rounded-2xl p-6 shadow-2xl"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", backdropFilter: "blur(20px)" }}>

          {/* Saved accounts quick login */}
          {profiles.length > 0 && (
            <div className="mb-5">
              <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "#B08060" }}>Quick Login</p>
              <div className="flex gap-2 flex-wrap">
                {profiles.slice(0, 3).map((p) => (
                  <button
                    key={p.identifier}
                    onClick={() => {
                      setSwitcherOpen(false);
                      if (p.pin) { doLogin(p.identifier, p.pin, true); return; }
                      const pinTry = prompt(`Enter PIN for ${p.name}`);
                      if (pinTry) doLogin(p.identifier, pinTry, false);
                    }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl flex-1 min-w-0 text-left transition hover:scale-[1.02] active:scale-[0.98]`}
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
                  >
                    <span className={`w-8 h-8 rounded-full bg-gradient-to-br ${roleColor(p.role)} flex items-center justify-center text-xs font-black text-white flex-shrink-0`}>
                      {initials(p.name)}
                    </span>
                    <span className="min-w-0">
                      <div className="text-[12px] font-bold text-white truncate">{p.name}</div>
                      <div className="text-[10px]" style={{ color: "#B08060" }}>{p.role === "Department User" ? "Staff" : p.role}</div>
                    </span>
                  </button>
                ))}
                {profiles.length > 3 && (
                  <button
                    onClick={() => setSwitcherOpen(true)}
                    className="px-3 py-2 rounded-xl text-[12px] font-bold transition hover:bg-white/10"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", color: "#B08060" }}
                  >
                    +{profiles.length - 3} more
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.10)" }} />
                <span className="text-[10px] font-bold tracking-widest" style={{ color: "#7A5A40" }}>OR</span>
                <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.10)" }} />
              </div>
            </div>
          )}

          {/* Error */}
          {err && (
            <div className="rounded-xl px-4 py-3 mb-4 flex items-center gap-2 text-[13px] font-semibold"
              style={{ background: "rgba(217,79,61,0.18)", border: "1px solid rgba(217,79,61,0.30)", color: "#FF8070" }}>
              <span>⚠️</span> {err}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "#B08060" }}>
                Username / Email
              </label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="admin or admin@skkitchen.com"
                className="w-full h-11 rounded-xl px-4 text-[13.5px] text-white placeholder-[#6A4A30] outline-none transition"
                style={{
                  background: "rgba(255,255,255,0.07)",
                  border: "1.5px solid rgba(255,255,255,0.12)",
                }}
                onFocus={(e) => { e.target.style.borderColor = "#E8731A"; e.target.style.boxShadow = "0 0 0 3px rgba(232,115,26,0.18)"; }}
                onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.12)"; e.target.style.boxShadow = "none"; }}
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "#B08060" }}>
                PIN
              </label>
              <div className="relative">
                <input
                  type={showPin ? "text" : "password"}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••••"
                  className="w-full h-11 rounded-xl px-4 pr-12 text-[13.5px] text-white placeholder-[#6A4A30] outline-none transition"
                  style={{
                    background: "rgba(255,255,255,0.07)",
                    border: "1.5px solid rgba(255,255,255,0.12)",
                  }}
                  onFocus={(e) => { e.target.style.borderColor = "#E8731A"; e.target.style.boxShadow = "0 0 0 3px rgba(232,115,26,0.18)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.12)"; e.target.style.boxShadow = "none"; }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] opacity-60 hover:opacity-100"
                  style={{ color: "#B08060" }}
                >
                  {showPin ? "🙈" : "👁️"}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <div
                onClick={() => setKeepSignedIn(!keepSignedIn)}
                className={`w-10 h-5 rounded-full transition-all relative ${keepSignedIn ? "bg-[#E8731A]" : "bg-white/20"}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${keepSignedIn ? "left-5" : "left-0.5"}`} />
              </div>
              <span className="text-[12px]" style={{ color: "#B08060" }}>Keep me signed in</span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl font-black text-[14px] text-white transition active:scale-[0.98] disabled:opacity-60 mt-1"
              style={{ background: loading ? "#7A4010" : "linear-gradient(135deg, #E8731A, #C75B0C)", boxShadow: "0 4px 16px rgba(232,115,26,0.35)" }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in…
                </span>
              ) : "Sign in →"}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] mt-5" style={{ color: "#4A2E1A" }}>
          Creme Castle Kitchen Inventory © 2026
        </p>
      </div>

      {/* Account switcher modal */}
      {switcherOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(15,8,2,0.75)", backdropFilter: "blur(6px)" }}
          onClick={() => setSwitcherOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl p-5 slide-up"
            style={{ background: "#1E1008", border: "1px solid rgba(255,255,255,0.12)" }}
            onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-white text-[15px] mb-1">Choose account</h3>
            <p className="text-[11px] mb-4" style={{ color: "#8A6040" }}>Saved logins on this device</p>
            <div className="flex flex-col gap-2 max-h-72 overflow-y-auto cc-scroll">
              {profiles.map((p) => (
                <div key={p.identifier} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <button className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    onClick={() => {
                      setSwitcherOpen(false);
                      if (p.pin) { doLogin(p.identifier, p.pin, true); return; }
                      const pinTry = prompt(`Enter PIN for ${p.name}`);
                      if (pinTry) doLogin(p.identifier, pinTry, false);
                    }}>
                    <span className={`w-9 h-9 rounded-full bg-gradient-to-br ${roleColor(p.role)} flex items-center justify-center text-xs font-black text-white flex-shrink-0`}>
                      {initials(p.name)}
                    </span>
                    <span>
                      <div className="text-[13px] font-bold text-white">{p.name}</div>
                      <div className="text-[11px]" style={{ color: "#8A6040" }}>{p.role}</div>
                    </span>
                  </button>
                  <button
                    className="w-7 h-7 rounded-full text-[11px] font-bold flex items-center justify-center transition hover:bg-red-500/20 hover:text-red-400"
                    style={{ color: "#6A4A30" }}
                    onClick={() => { removeProfile(p.identifier); setProfiles(getSavedProfiles()); }}>✕</button>
                </div>
              ))}
            </div>
            <button className="w-full h-10 rounded-xl mt-3 text-[13px] font-bold transition hover:bg-white/10"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", color: "#8A6040" }}
              onClick={() => setSwitcherOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
