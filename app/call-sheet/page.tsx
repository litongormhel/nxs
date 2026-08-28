import { createClient } from "@/lib/supabase/server";
import { CallSheetBrowser } from "@/components/call-sheet-browser";

export default async function CallSheetPage() {
  const supabase = await createClient();

  const { data: occupancy } = await supabase
    .from("locker_occupancy")
    .select("id, locker_number, room_number, checked_in_at, services(name)")
    .is("checked_out_at", null);

  const entries = (occupancy ?? [])
    .filter((o) => o.services?.name && o.services.name !== "Wet Area")
    .map((o) => ({
      id: o.id,
      locker_number: o.locker_number,
      room_number: o.room_number,
      service_name: o.services!.name,
      checked_in_at: o.checked_in_at,
    }));

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gold animate-fade-in mb-6">
        Call Sheet
      </h1>
      <CallSheetBrowser entries={entries} />
    </div>
  );
}
