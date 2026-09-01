import { createClient } from "@/lib/supabase/server";
import { SettingsBrowser } from "@/components/settings-browser";
import { compareSlotTimes } from "@/lib/bookings/slots";

export default async function SettingsPage() {
  const supabase = await createClient();

  const [
    { data: services },
    { data: promos },
    { data: addons },
    { data: weekendSlots },
    { count: lockersCount },
    { count: roomsCount },
    { data: appSettings },
  ] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, price, points_earned")
      .eq("active", true)
      .order("name", { ascending: true }),
    supabase
      .from("promos")
      .select("id, label, discount")
      .eq("active", true)
      .order("label", { ascending: true }),
    supabase
      .from("addons")
      .select("id, name, price")
      .eq("active", true)
      .order("name", { ascending: true }),
    supabase.from("weekend_slots").select("id, slot_time"),
    supabase
      .from("lockers")
      .select("*", { count: "exact", head: true })
      .eq("active", true),
    supabase
      .from("rooms")
      .select("*", { count: "exact", head: true })
      .eq("active", true),
    supabase
      .from("app_settings")
      .select("loyalty_formula_mode, peso_per_point")
      .eq("id", true)
      .single(),
  ]);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gold animate-fade-in">
          Settings
        </h1>
        <a
          href="/settings/master-qr"
          className="text-sm rounded-md border border-border px-3 py-1.5 hover:bg-white/5"
        >
          Master QR
        </a>
      </div>

      <SettingsBrowser
        initialServices={services ?? []}
        initialPromos={promos ?? []}
        initialAddons={addons ?? []}
        initialWeekendSlots={(weekendSlots ?? [])
          .map((s) => ({
            id: s.id,
            slot_time: s.slot_time.slice(0, 5),
          }))
          .sort((a, b) => compareSlotTimes(a.slot_time, b.slot_time))}
        initialLockersCount={lockersCount ?? 100}
        initialRoomsCount={roomsCount ?? 18}
        initialLoyaltyFormulaMode={
          (appSettings?.loyalty_formula_mode as "uniform" | "proportional" | null) ?? null
        }
        initialPesoPerPoint={appSettings?.peso_per_point ?? null}
      />
    </div>
  );
}
