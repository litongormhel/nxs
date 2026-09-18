import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]{3,20}$/;

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

export function escapeLikePattern(value: string): string {
  return value.replace(/[%_\\]/g, (char) => `\\${char}`);
}

export async function isUsernameTaken(
  supabase: SupabaseClient<Database>,
  username: string,
): Promise<boolean> {
  const pattern = escapeLikePattern(username);
  const { data: portalAccount } = await supabase
    .from("client_portal_accounts")
    .select("id")
    .ilike("username", pattern)
    .maybeSingle();

  if (portalAccount) return true;

  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .ilike("username", pattern)
    .maybeSingle();

  return !!client;
}
