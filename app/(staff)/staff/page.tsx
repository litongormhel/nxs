import { createClient } from "@/lib/supabase/server";
import { StaffBrowser } from "@/components/staff-browser";

export default async function StaffPage() {
  const supabase = await createClient();

  const { data: staff } = await supabase
    .from("staff")
    .select("id, name, position, comment, active, username")
    .eq("active", true)
    .order("name", { ascending: true });

  const { data: archivedStaff } = await supabase
    .from("staff")
    .select("id, name, position, comment, active, username, archived_reason, archived_at, archived_by")
    .eq("active", false)
    .order("archived_at", { ascending: false });

  const archiverIds = [...new Set((archivedStaff ?? []).map((s) => s.archived_by).filter(Boolean))] as string[];
  const { data: archivers } = archiverIds.length
    ? await supabase.from("staff").select("id, name").in("id", archiverIds)
    : { data: [] };
  const archiverNames = new Map((archivers ?? []).map((a) => [a.id, a.name]));

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gold animate-fade-in mb-6">
        Staff
      </h1>
      <StaffBrowser
        initialStaff={staff ?? []}
        initialArchived={
          (archivedStaff ?? []).map((s) => ({
            ...s,
            archived_by_name: s.archived_by ? (archiverNames.get(s.archived_by) ?? null) : null,
          }))
        }
      />
    </div>
  );
}
