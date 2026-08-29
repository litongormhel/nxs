import { createClient } from "@/lib/supabase/server";
import { LogsBrowser } from "@/components/logs-browser";

// Current volume (Activity Logs phase, ohm#3z8k1p6d): a few dozen rows across
// every phase since Core Loop. A flat LIMIT is enough for now — revisit with
// real pagination once this table's growth suggests it (see docs/state/logs_state.md).
const LOGS_LIMIT = 500;

export default async function LogsPage() {
  const supabase = await createClient();

  // action_logs.staff_id carries two FKs (staff + the loginable_staff view
  // over it), which makes a PostgREST embedded select ambiguous — fetch
  // staff names separately and join in app code instead.
  const [{ data: logs }, { data: staff }] = await Promise.all([
    supabase
      .from("action_logs")
      .select("id, action, detail, created_at, staff_id")
      .order("created_at", { ascending: false })
      .limit(LOGS_LIMIT),
    supabase.from("staff").select("id, name"),
  ]);

  const staffNameById = new Map((staff ?? []).map((s) => [s.id, s.name]));

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gold animate-fade-in mb-6">
        Activity Logs
      </h1>
      <LogsBrowser
        initialLogs={(logs ?? []).map((l) => ({
          id: l.id,
          action: l.action,
          detail: l.detail,
          created_at: l.created_at,
          staff_name: staffNameById.get(l.staff_id) ?? "—",
        }))}
      />
    </div>
  );
}
