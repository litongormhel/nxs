import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

type PortalDbClient = SupabaseClient<Database>;

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || "unknown";
}

export async function checkLockout(
  supabase: PortalDbClient,
  attemptKey: string,
): Promise<{ locked: boolean; retryAfter?: string }> {
  const { data } = await supabase
    .from("portal_login_attempts")
    .select("locked_until")
    .eq("attempt_key", attemptKey)
    .maybeSingle();

  if (data?.locked_until && new Date(data.locked_until) > new Date()) {
    return { locked: true, retryAfter: data.locked_until };
  }
  return { locked: false };
}

/**
 * Increments the counter for attemptKey; once it reaches maxAttempts, locks
 * it for lockoutMinutes and resets the counter (same upsert shape as
 * void_sale_with_code's sale_void_attempts handling).
 */
export async function recordFailure(
  supabase: PortalDbClient,
  attemptKey: string,
  { maxAttempts, lockoutMinutes }: { maxAttempts: number; lockoutMinutes: number },
): Promise<void> {
  const { data } = await supabase
    .from("portal_login_attempts")
    .select("failed_count")
    .eq("attempt_key", attemptKey)
    .maybeSingle();

  const nextCount = (data?.failed_count ?? 0) + 1;

  if (nextCount >= maxAttempts) {
    await supabase.from("portal_login_attempts").upsert({
      attempt_key: attemptKey,
      failed_count: 0,
      locked_until: new Date(Date.now() + lockoutMinutes * 60_000).toISOString(),
      updated_at: new Date().toISOString(),
    });
  } else {
    await supabase.from("portal_login_attempts").upsert({
      attempt_key: attemptKey,
      failed_count: nextCount,
      locked_until: null,
      updated_at: new Date().toISOString(),
    });
  }
}

export async function recordSuccess(supabase: PortalDbClient, attemptKey: string): Promise<void> {
  await supabase.from("portal_login_attempts").upsert({
    attempt_key: attemptKey,
    failed_count: 0,
    locked_until: null,
    updated_at: new Date().toISOString(),
  });
}
