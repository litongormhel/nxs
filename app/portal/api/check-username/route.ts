import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/portal/service-client";
import { isUsernameTaken, isValidUsername } from "@/lib/portal/username";
import { checkLockout, clientIp, recordFailure } from "@/lib/portal/rate-limit";

const IP_MAX_CALLS = 30;
const IP_COOLDOWN_MINUTES = 2;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";

  const supabase = createServiceClient();
  const ipKey = `checkuser-ip:${clientIp(request)}`;

  const { locked } = await checkLockout(supabase, ipKey);
  if (locked) {
    return NextResponse.json(
      { available: false, error: "Too many checks. Please wait a moment and try again." },
      { status: 429 },
    );
  }
  await recordFailure(supabase, ipKey, { maxAttempts: IP_MAX_CALLS, lockoutMinutes: IP_COOLDOWN_MINUTES });

  if (!isValidUsername(username)) {
    return NextResponse.json({ available: false, error: "3-20 characters: letters, numbers, . _ -" });
  }

  const taken = await isUsernameTaken(supabase, username);

  if (taken) {
    return NextResponse.json({ available: false, error: "That username is already taken." });
  }

  return NextResponse.json({ available: true });
}
