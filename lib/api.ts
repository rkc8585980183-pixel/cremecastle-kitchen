export type RpcResult<T = Record<string, unknown>> = { ok: true } & T | { ok: false; error: string };

export async function rpc<T = Record<string, unknown>>(action: string, payload: Record<string, unknown> = {}): Promise<RpcResult<T>> {
  try {
    const res = await fetch("/api/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    return (await res.json()) as RpcResult<T>;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function bootstrap(date?: string) {
  const url = date ? `/api/bootstrap?date=${encodeURIComponent(date)}` : "/api/bootstrap";
  const res = await fetch(url, { cache: "no-store" });
  return res.json();
}

export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem("cc_device_id");
  if (!id) {
    id = "dev-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem("cc_device_id", id);
  }
  return id;
}

export function getDeviceInfo(): string {
  if (typeof window === "undefined") return "Server";
  const ua = navigator.userAgent || "";
  let platform = "Unknown";
  if (/Android/i.test(ua)) platform = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) platform = "iOS";
  else if (/Windows/i.test(ua)) platform = "Windows";
  else if (/Macintosh/i.test(ua)) platform = "Mac";
  else if (/Linux/i.test(ua)) platform = "Linux";
  let browser = "Unknown browser";
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = "Safari";
  else if (/Edg\//i.test(ua)) browser = "Edge";
  return `${platform} \u00b7 ${browser}`;
}
