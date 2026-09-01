import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

// Service-role client for staff login provisioning (Owner-gated Server
// Actions only). Used to call the Supabase Admin API (auth.admin.*) to
// create/disable/re-enable auth.users accounts and reset passwords —
// operations the anon-key RLS-governed client can never perform. Every
// caller must independently verify the acting session is Owner before
// invoking anything through this client; it bypasses RLS entirely.
// Never import this from a Client Component or expose the service-role key
// to the browser.
export function createStaffServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase URL or Service Role Key for staff service client.");
  }

  return createSupabaseClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export const STAFF_EMAIL_DOMAIN = "staff.nxsspa.internal";

export function staffSyntheticEmail(username: string) {
  return `${username.trim().toLowerCase()}@${STAFF_EMAIL_DOMAIN}`;
}
