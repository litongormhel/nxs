import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const PORTAL_SESSION_COOKIE = "nxs_portal_session";

function sessionSecret(): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY. Required to sign portal sessions.");
  }
  return secret;
}

function sign(portalAccountId: string): string {
  return createHmac("sha256", sessionSecret()).update(portalAccountId).digest("hex");
}

export function createSessionToken(portalAccountId: string): string {
  return `${portalAccountId}.${sign(portalAccountId)}`;
}

function verifySessionToken(token: string): string | null {
  const separatorIndex = token.lastIndexOf(".");
  if (separatorIndex === -1) return null;

  const portalAccountId = token.slice(0, separatorIndex);
  const providedSignature = token.slice(separatorIndex + 1);
  const expectedSignature = sign(portalAccountId);

  const provided = Buffer.from(providedSignature, "hex");
  const expected = Buffer.from(expectedSignature, "hex");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  return portalAccountId;
}

export async function setPortalSession(portalAccountId: string) {
  const cookieStore = await cookies();
  cookieStore.set(PORTAL_SESSION_COOKIE, createSessionToken(portalAccountId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/portal",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function getPortalAccountId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function clearPortalSession() {
  const cookieStore = await cookies();
  cookieStore.delete({ name: PORTAL_SESSION_COOKIE, path: "/portal" });
}
