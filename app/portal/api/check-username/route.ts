import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/portal/service-client";
import { isUsernameTaken, isValidUsername } from "@/lib/portal/username";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";

  if (!isValidUsername(username)) {
    return NextResponse.json({ available: false, error: "3-20 characters: letters, numbers, . _ -" });
  }

  const supabase = createServiceClient();
  const taken = await isUsernameTaken(supabase, username);

  if (taken) {
    return NextResponse.json({ available: false, error: "That username is already taken." });
  }

  return NextResponse.json({ available: true });
}
