import { Sidebar } from "@/components/sidebar";
import { StaffSimProvider } from "@/lib/staff-context";
import { createClient } from "@/lib/supabase/server";

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let sessionStaff = null;
  if (user) {
    const { data: staffRow } = await supabase
      .from("staff")
      .select("id, name, position")
      .eq("user_id", user.id)
      .eq("active", true)
      .maybeSingle();
    sessionStaff = staffRow ?? null;
  }

  return (
    <StaffSimProvider sessionStaff={sessionStaff}>
      <Sidebar />
      <main className="flex-1 min-h-full overflow-y-auto">{children}</main>
    </StaffSimProvider>
  );
}
