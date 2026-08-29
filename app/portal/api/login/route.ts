import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/portal/service-client";
import { verifyPassword } from "@/lib/portal/password";
import { setPortalSession } from "@/lib/portal/session";
import { escapeLikePattern } from "@/lib/portal/username";

const PHONE_SHAPED = /^\d{7,15}$/;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const identifier = typeof body?.identifier === "string" ? body.identifier.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!identifier || !password) {
    return NextResponse.json({ error: "Username/Phone Number and Password are required." }, { status: 400 });
  }

  const supabase = createServiceClient();

  const lookup = PHONE_SHAPED.test(identifier)
    ? supabase.from("client_portal_accounts").select("id, password_hash").eq("phone", identifier).maybeSingle()
    : supabase
        .from("client_portal_accounts")
        .select("id, password_hash")
        .ilike("username", escapeLikePattern(identifier))
        .maybeSingle();

  const { data: account } = await lookup;

  if (!account) {
    return NextResponse.json({ error: "Invalid username/phone number or password." }, { status: 401 });
  }

  const valid = await verifyPassword(password, account.password_hash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid username/phone number or password." }, { status: 401 });
  }

  await setPortalSession(account.id);

  return NextResponse.json({ ok: true });
}
