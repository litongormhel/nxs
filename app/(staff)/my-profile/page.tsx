import { createClient } from "@/lib/supabase/server";
import { MyProfileForm } from "@/components/my-profile-form";

export default async function MyProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let mustChangePassword = false;
  if (user) {
    const { data: staffRow } = await supabase
      .from("staff")
      .select("must_change_password")
      .eq("user_id", user.id)
      .maybeSingle();
    mustChangePassword = staffRow?.must_change_password ?? false;
  }

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gold animate-fade-in mb-6">
        My Profile
      </h1>
      <MyProfileForm forced={mustChangePassword} />
    </div>
  );
}
