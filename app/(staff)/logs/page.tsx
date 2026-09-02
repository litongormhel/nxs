import { createClient } from "@/lib/supabase/server";
import { LogsBrowser } from "@/components/logs-browser";
import type { Lookups } from "@/lib/logs/format-detail";

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

  // Batch-fetch only the id sets actually referenced in this page's rows —
  // display-layer joins for formatLogDetail(), keyed off each action's
  // detail fields. Never touches the writers or the action_logs fetch above.
  const detailFields = (logs ?? []).map((l) => {
    const fields: Record<string, string> = {};
    for (const token of (l.detail ?? "").split(" ")) {
      const eq = token.indexOf("=");
      if (eq !== -1) fields[token.slice(0, eq)] = token.slice(eq + 1);
    }
    return { action: l.action, fields };
  });

  const collectIds = (predicate: (row: { action: string; fields: Record<string, string> }) => string | undefined) =>
    [...new Set(detailFields.map(predicate).filter((id): id is string => !!id))];

  const therapistIds = collectIds((r) =>
    r.action === "therapist_toggle_day_off" ||
    r.action === "therapist_mark_absent" ||
    r.action === "therapist_toggle_service"
      ? r.fields.therapist
      : undefined
  );
  const serviceIds = collectIds((r) =>
    r.action === "settings_update_service_points" ||
    r.action === "settings_delete_service" ||
    r.action === "settings_update_service_price" ||
    r.action === "therapist_toggle_service"
      ? r.fields.service
      : undefined
  );
  const addonIds = collectIds((r) => (r.action === "settings_delete_addon" ? r.fields.addon : undefined));
  const clientIds = collectIds((r) => {
    if (r.action === "log_visit" || r.action === "quick_walkin") {
      const v = r.fields.client;
      return v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : undefined;
    }
    return undefined;
  });
  const occupancyIds = collectIds((r) => (r.action === "locker_checkout" ? r.fields.occupancy_id : undefined));

  const [
    { data: therapistRows },
    { data: serviceRows },
    { data: addonRows },
    { data: clientRows },
    { data: occupancyRows },
  ] = await Promise.all([
    therapistIds.length
      ? supabase.from("therapists").select("id, name").in("id", therapistIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    serviceIds.length
      ? supabase.from("services").select("id, name").in("id", serviceIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    addonIds.length
      ? supabase.from("addons").select("id, name").in("id", addonIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    clientIds.length
      ? supabase.from("clients").select("id, codename").in("id", clientIds)
      : Promise.resolve({ data: [] as { id: string; codename: string }[] }),
    occupancyIds.length
      ? supabase.from("locker_occupancy").select("id, locker_number").in("id", occupancyIds)
      : Promise.resolve({ data: [] as { id: string; locker_number: number }[] }),
  ]);

  const lookups: Lookups = {
    therapistNameById: new Map((therapistRows ?? []).map((t) => [t.id, t.name])),
    serviceNameById: new Map((serviceRows ?? []).map((s) => [s.id, s.name])),
    addonNameById: new Map((addonRows ?? []).map((a) => [a.id, a.name])),
    clientCodenameById: new Map((clientRows ?? []).map((c) => [c.id, c.codename])),
    lockerNumberByOccupancyId: new Map((occupancyRows ?? []).map((o) => [o.id, o.locker_number])),
  };

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
        lookups={lookups}
      />
    </div>
  );
}
