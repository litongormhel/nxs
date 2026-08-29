import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/portal/service-client";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/portal/password";
import { generateMemberCode, generateClientUsername } from "@/lib/portal/codes";
import { isUsernameTaken, isValidUsername } from "@/lib/portal/username";
import { setPortalSession } from "@/lib/portal/session";

const MAX_CODE_ATTEMPTS = 5;

function normalizePhone(raw: string): string {
  return raw.trim();
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const phone = typeof body?.phone === "string" ? normalizePhone(body.phone) : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!name || !username || !phone || !password) {
    return NextResponse.json({ error: "Name, Username, Phone Number, and Password are all required." }, { status: 400 });
  }
  if (!isValidUsername(username)) {
    return NextResponse.json(
      { error: "Username must be 3-20 characters: letters, numbers, . _ -", field: "username" },
      { status: 400 },
    );
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`, field: "password" },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  if (await isUsernameTaken(supabase, username)) {
    return NextResponse.json(
      { error: "That username is already taken.", field: "username" },
      { status: 409 },
    );
  }

  const { data: existingAccount } = await supabase
    .from("client_portal_accounts")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();

  if (existingAccount) {
    // Deliberately generic: do not confirm a phone number already has a
    // portal account (would leak account existence to an anonymous visitor).
    return NextResponse.json(
      { error: "Could not complete registration with these details." },
      { status: 400 },
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

  const passwordHash = await hashPassword(password);

  const { data: portalAccount, error: insertError } = await supabase
    .from("client_portal_accounts")
    .insert({
      client_id: clientId,
      phone,
      password_hash: passwordHash,
      username,
    })
    .select("id, username")
    .single();

  if (insertError || !portalAccount) {
    if (insertError?.code === "23505") {
      return NextResponse.json(
        { error: "That username is already taken.", field: "username" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Could not create portal account." }, { status: 500 });
  }

  await setPortalSession(portalAccount.id);

  return NextResponse.json({ username: portalAccount.username, name: displayName });
}
