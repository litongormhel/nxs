import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/portal/service-client";
import { verifyPassword } from "@/lib/portal/password";
import { setPortalSession } from "@/lib/portal/session";
import { escapeLikePattern } from "@/lib/portal/username";
import { checkLockout, clientIp, recordFailure, recordSuccess } from "@/lib/portal/rate-limit";

const PHONE_SHAPED = /^\d{7,15}$/;

const IDENTIFIER_MAX_ATTEMPTS = 5;
const IDENTIFIER_LOCKOUT_MINUTES = 15;
const IP_MAX_ATTEMPTS = 20;
const IP_LOCKOUT_MINUTES = 15;

function lockoutResponse() {
  return NextResponse.json(
    { error: "Too many attempts. Please try again in a few minutes." },
    { status: 429 },
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const identifier = typeof body?.identifier === "string" ? body.identifier.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!identifier || !password) {
    return NextResponse.json({ error: "Username/Phone Number and Password are required." }, { status: 400 });
  }

  const supabase = createServiceClient();

  const identKey = `ident:${identifier.toLowerCase()}`;
  const ipKey = `ip:${clientIp(request)}`;

  const [identLock, ipLock] = await Promise.all([
    checkLockout(supabase, identKey),
    checkLockout(supabase, ipKey),
  ]);
  if (identLock.locked || ipLock.locked) {
    return lockoutResponse();
  }

  const lookup = PHONE_SHAPED.test(identifier)
    ? supabase.from("client_portal_accounts").select("id, password_hash").eq("phone", identifier).maybeSingle()
    : supabase
        .from("client_portal_accounts")
        .select("id, password_hash")
        .ilike("username", escapeLikePattern(identifier))
        .maybeSingle();

  const { data: account } = await lookup;

  if (!account) {
    await Promise.all([
      recordFailure(supabase, identKey, { maxAttempts: IDENTIFIER_MAX_ATTEMPTS, lockoutMinutes: IDENTIFIER_LOCKOUT_MINUTES }),
      recordFailure(supabase, ipKey, { maxAttempts: IP_MAX_ATTEMPTS, lockoutMinutes: IP_LOCKOUT_MINUTES }),
    ]);
    return NextResponse.json({ error: "Invalid username/phone number or password." }, { status: 401 });
  }

  const valid = await verifyPassword(password, account.password_hash);
  if (!valid) {
    await Promise.all([
      recordFailure(supabase, identKey, { maxAttempts: IDENTIFIER_MAX_ATTEMPTS, lockoutMinutes: IDENTIFIER_LOCKOUT_MINUTES }),
      recordFailure(supabase, ipKey, { maxAttempts: IP_MAX_ATTEMPTS, lockoutMinutes: IP_LOCKOUT_MINUTES }),
    ]);
    return NextResponse.json({ error: "Invalid username/phone number or password." }, { status: 401 });
  }

  await Promise.all([recordSuccess(supabase, identKey), recordSuccess(supabase, ipKey)]);
  await setPortalSession(account.id);

  return NextResponse.json({ ok: true });
}
