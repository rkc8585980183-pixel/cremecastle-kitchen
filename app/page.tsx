"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getDeviceId, getDeviceInfo } from "@/lib/api";

type Profile = { identifier: string; name: string; role: string; pin?: string };

const PROFILES_KEY = "cc_saved_profiles";

function getSavedProfiles(): Profile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function upsertProfile(p: Profile) {
  const list = getSavedProfiles();
  const idx = list.findIndex((x) => x.identifier.toLowerCase() === p.identifier.toLowerCase());
  if (idx === -1) list.push(p);
  else list[idx] = p;
  localStorage.setItem(PROFILES_KEY, JSON.stringify(list));
}
function removeProfile(identifier: string) {
  const list = getSavedProfiles().filter((x) => x.identifier.toLowerCase() !== identifier.toLowerCase());
  localStorage.setItem(PROFILES_KEY, JSON.stringify(list));
}
function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
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

   useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfiles(getSavedProfiles());
  }, []);

  async function doLogin(id: string, pinValue: string, remember: boolean) {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: id, pin: pinValue, deviceId: getDeviceId(), deviceInfo: getDeviceInfo() }),
      });
      const data = await res.json();
      if (!data.ok) {
        setErr(data.error || "Login failed.");
        setLoading(false);
        return;
      }
      upsertProfile({ identifier: id, name: data.user.name, role: data.user.role, pin: remember ? pinValue : undefined });
      router.push(data.user.role === "Admin" || data.user.role === "Super Admin" ? "/admin" : "/app");
      router.refresh();
    } catch {
      setErr("Something went wrong. Try again.");
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || !pin.trim()) return;
    doLogin(identifier.trim(), pin.trim(), keepSignedIn);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white border border-[#E2E7E4] rounded-3xl p-8 shadow-[0_12px_30px_rgba(20,40,69,0.08)]">
        <div className="w-14 h-14 rounded-2xl overflow-hidden mx-auto mb-4 shadow-lg">
          <img src="https://lh3.googleusercontent.com/d/1XNpcNjDPcpFxIoDjHMhoWOYAJtqQWshj=w128-h128" alt="Kitchen Inventory Tracker" className="w-full h-full object-cover" />
        </div>
        <h1 className="text-center text-2xl font-bold text-[#142845] mb-6">Kitchen Inventory Tracker</h1>

        {profiles.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setSwitcherOpen(true)}
              style={{ borderColor: "#1F3A5F", color: "#1F3A5F", borderWidth: "1.5px", borderStyle: "solid" }}
              className="w-full h-12 rounded-xl font-bold text-sm mb-4 flex items-center justify-center gap-2 hover:bg-gray-50 transition cursor-pointer"
            >
              🔑 Quick login <span className="opacity-70 font-medium">— saved accounts</span>
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-[#E2E7E4]" />
              <span className="text-[10px] font-bold text-[#6B7876]">OR SIGN IN MANUALLY</span>
              <div className="flex-1 h-px bg-[#E2E7E4]" />
            </div>
          </>
        )}

        {err && <div className="bg-red-50 text-[#C0463F] text-sm rounded-lg p-2.5 mb-3">{err}</div>}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="text-xs font-bold text-[#6B7876] block mb-1.5">Email, username or name</label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="raj@cremecastle.in"
              className="w-full h-12 border-[1.5px] border-[#E2E7E4] rounded-xl px-3.5 text-base bg-[#FBFAF7] focus:outline-none focus:border-[#1F3A5F] focus:bg-white"
              required
            />
          </div>
          <div>
            <label className="text-xs font-bold text-[#6B7876] block mb-1.5">PIN</label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••••"
              className="w-full h-12 border-[1.5px] border-[#E2E7E4] rounded-xl px-3.5 text-base bg-[#FBFAF7] focus:outline-none focus:border-[#1F3A5F] focus:bg-white"
              required
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="keepSignedIn"
              checked={keepSignedIn}
              onChange={(e) => setKeepSignedIn(e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="keepSignedIn" className="text-xs text-[#6B7876] font-medium cursor-pointer">
              Keep me signed in (enables one-tap quick login next time)
            </label>
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{ background: "linear-gradient(135deg, #1F3A5F, #142845)", color: "#FFFFFF" }}
            className="w-full h-12 rounded-xl font-bold text-base active:scale-[0.98] transition disabled:opacity-60 cursor-pointer"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>

      {switcherOpen && (
        <div className="fixed inset-0 bg-black/55 flex items-center justify-center p-4 z-50" onClick={() => setSwitcherOpen(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm max-h-[82vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-base mb-1">Choose an account</h3>
            <p className="text-xs text-[#6B7876] mb-4">Saved logins on this device — tap one to sign in instantly.</p>
            <div className="flex flex-col gap-2">
              {profiles.map((p) => (
                <div key={p.identifier} className="flex items-center gap-3 bg-[#FBFAF7] border-[1.5px] border-[#E2E7E4] rounded-2xl px-3.5 py-3">
                  <button
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    onClick={() => {
                      setSwitcherOpen(false);
                      setIdentifier(p.identifier);
                      if (p.pin) {
                        doLogin(p.identifier, p.pin, true);
                        return;
                      }
                      const pinTry = prompt(`Enter PIN for ${p.name}`);
                      if (pinTry) doLogin(p.identifier, pinTry, false);
                    }}
                  >
                    <span className="w-10 h-10 rounded-full bg-gradient-to-br from-[#1F3A5F] to-[#142845] text-white flex items-center justify-center text-sm font-extrabold flex-shrink-0">
                      {initialsFor(p.name)}
                    </span>
                    <span className="min-w-0">
                      <div className="text-sm font-bold truncate">{p.name}</div>
                      <div className="text-[11px] text-[#6B7876]">{p.role === "Admin" ? "Administrator" : p.role}</div>
                    </span>
                  </button>
                  <button
                    className="w-6 h-6 rounded-full bg-[#E2E7E4] text-[#6B7876] text-xs font-bold flex items-center justify-center hover:bg-[#C0463F] hover:text-white flex-shrink-0"
                    onClick={() => {
                      if (!confirm(`Remove "${p.name}" from saved logins?`)) return;
                      removeProfile(p.identifier);
                      setProfiles(getSavedProfiles());
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {!profiles.length && <div className="text-sm text-[#6B7876]">No saved accounts on this device yet.</div>}
            </div>
            <button
              className="w-full h-11 rounded-xl border border-[#E2E7E4] font-bold text-sm mt-4"
              onClick={() => setSwitcherOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
