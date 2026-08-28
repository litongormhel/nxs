import { createClient } from "@/lib/supabase/server";
import { StaffBrowser } from "@/components/staff-browser";

export default async function StaffPage() {
  const supabase = await createClient();

  const { data: staff } = await supabase
    .from("staff")
    .select("id, name, position, comment, active")
    .eq("active", true)
    .order("name", { ascending: true });

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gold animate-fade-in mb-6">
        Staff
      </h1>
      <StaffBrowser initialStaff={staff ?? []} />
    </div>
  );
}
