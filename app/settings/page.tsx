import { createClient } from "@/lib/supabase/server";
import { SettingsBrowser } from "@/components/settings-browser";

export default async function SettingsPage() {
  const supabase = await createClient();

  const [
    { data: services },
    { data: promos },
    { data: addons },
    { data: weekendSlots },
    { count: lockersCount },
    { count: roomsCount },
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
    supabase
      .from("weekend_slots")
      .select("id, slot_time")
      .order("slot_time", { ascending: true }),
    supabase
      .from("lockers")
      .select("*", { count: "exact", head: true })
      .eq("active", true),
    supabase
      .from("rooms")
      .select("*", { count: "exact", head: true })
      .eq("active", true),
  ]);

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gold animate-fade-in mb-6">
        Settings
      </h1>

      <SettingsBrowser
        initialServices={services ?? []}
        initialPromos={promos ?? []}
        initialAddons={addons ?? []}
        initialWeekendSlots={(weekendSlots ?? []).map((s) => ({
          id: s.id,
          slot_time: s.slot_time.slice(0, 5),
        }))}
        initialLockersCount={lockersCount ?? 100}
        initialRoomsCount={roomsCount ?? 18}
      />
    </div>
  );
}
