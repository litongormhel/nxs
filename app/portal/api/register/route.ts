import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/portal/service-client";
import { hashPin } from "@/lib/portal/pin";
import { generatePortalUsername, generateMemberCode, generateClientUsername } from "@/lib/portal/codes";
import { setPortalSession } from "@/lib/portal/session";

const MAX_CODE_ATTEMPTS = 5;

function normalizePhone(raw: string): string {
  return raw.trim();
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const phone = typeof body?.phone === "string" ? normalizePhone(body.phone) : "";
  const pin = typeof body?.pin === "string" ? body.pin : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (!phone || !pin || !name) {
    return NextResponse.json({ error: "Phone, PIN, and Name are all required." }, { status: 400 });
  }
  if (!/^\d{4,8}$/.test(pin)) {
    return NextResponse.json({ error: "PIN must be 4-8 digits." }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: existingAccount } = await supabase
    .from("client_portal_accounts")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();

  if (existingAccount) {
    return NextResponse.json(
      { error: "This phone number is already registered. Please log in instead." },
      { status: 409 },
    );
  }

  const { data: matchedClient } = await supabase
    .from("clients")
    .select("id, codename")
    .eq("phone", phone)
    .maybeSingle();

  let clientId: string;
  let displayName: string;

  if (matchedClient) {
    clientId = matchedClient.id;
    displayName = matchedClient.codename;
  } else {
    let created: { id: string } | null = null;
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS && !created; attempt++) {
      const { data, error } = await supabase
        .from("clients")
        .insert({
          codename: name,
          phone,
          username: generateClientUsername(),
          member_code: generateMemberCode(),
        })
        .select("id")
        .single();

      if (!error) {
        created = data;
      } else if (error.code !== "23505") {
        return NextResponse.json({ error: "Could not create client record." }, { status: 500 });
      }
    }

    if (!created) {
      return NextResponse.json({ error: "Could not generate a unique client code. Try again." }, { status: 500 });
    }

    clientId = created.id;
    displayName = name;
  }

  const pinHash = await hashPin(pin);

  let portalAccount: { id: string; username: string } | null = null;
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS && !portalAccount; attempt++) {
    const { data, error } = await supabase
      .from("client_portal_accounts")
      .insert({
        client_id: clientId,
        phone,
        pin_hash: pinHash,
        username: generatePortalUsername(),
      })
      .select("id, username")
      .single();

    if (!error) {
      portalAccount = data;
    } else if (error.code !== "23505") {
      return NextResponse.json({ error: "Could not create portal account." }, { status: 500 });
    }
  }

  if (!portalAccount) {
    return NextResponse.json({ error: "Could not generate a unique username. Try again." }, { status: 500 });
  }

  await setPortalSession(portalAccount.id);

  return NextResponse.json({ username: portalAccount.username, name: displayName });
}
