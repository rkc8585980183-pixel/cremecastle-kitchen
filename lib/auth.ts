// Lightweight signed-cookie session (JWT via `jose`), replacing the old
// "keep me signed in -> localStorage identifier+pin" pattern with a proper
// httpOnly session cookie. Same PIN-based login flow otherwise.
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "cc_session";
const secretKey = () => new TextEncoder().encode(process.env.SESSION_SECRET || "dev-secret-change-me");

export type SessionUser = {
  userId: string;
  email: string;
  name: string;
  departmentId: string;
  role: "Admin" | "Super Admin" | "Department User";
};

export async function createSession(user: SessionUser) {
  const token = await new SignJWT(user)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
