import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

// Service-role client, usable only in server-only portal code (Route
// Handlers). Bypasses RLS: client_portal_accounts has zero RLS policies
// (default-deny) and clients.INSERT requires is_staff(), so an anonymous
// portal visitor cannot register through the anon-key RLS-governed path
// the rest of the app uses. Never import this from a Client Component or
// expose the service-role key to the browser.
export function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase URL or Service Role Key for portal service client.");
  }

  return createSupabaseClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
