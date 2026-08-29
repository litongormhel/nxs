import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/portal/service-client";
import { verifyPin } from "@/lib/portal/pin";
import { setPortalSession } from "@/lib/portal/session";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const pin = typeof body?.pin === "string" ? body.pin : "";

  if (!phone || !pin) {
    return NextResponse.json({ error: "Phone and PIN are required." }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: account } = await supabase
    .from("client_portal_accounts")
    .select("id, pin_hash, client_id")
    .eq("phone", phone)
    .maybeSingle();

  if (!account) {
    return NextResponse.json({ error: "Invalid phone number or PIN." }, { status: 401 });
  }

  const valid = await verifyPin(pin, account.pin_hash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid phone number or PIN." }, { status: 401 });
  }

  await setPortalSession(account.id);

  return NextResponse.json({ ok: true });
}
