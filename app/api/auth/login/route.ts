import { NextRequest, NextResponse } from "next/server";
import { loginWithPin, recordDeviceSession } from "@/lib/server/auth";
import { createSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { identifier, pin, deviceId, deviceInfo } = body || {};
  const result = await loginWithPin(identifier, pin);
  if (!result.ok) return NextResponse.json(result, { status: 401 });

  await createSession(result.user);
  try {
    await recordDeviceSession(result.user.userId, result.user.name, deviceId, deviceInfo);
  } catch (e) {
    console.error("recordDeviceSession failed", e);
  }
  return NextResponse.json({ ok: true, user: result.user });
}
