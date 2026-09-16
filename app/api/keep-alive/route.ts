import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    await supabase.from("addons").select("id", { count: "exact", head: true });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Keep-alive query failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
