"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { staffSyntheticEmail } from "@/lib/staff/service-client";

function safeNextPath(next: FormDataEntryValue | null): string {
  const value = String(next ?? "");
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

export async function login(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(formData.get("next"));

  if (!username || !password) {
    redirect(`/login?error=${encodeURIComponent("Username and password are required.")}&next=${encodeURIComponent(next)}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: staffSyntheticEmail(username),
    password,
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent("Invalid username or password.")}&next=${encodeURIComponent(next)}`);
  }

  redirect(next);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
