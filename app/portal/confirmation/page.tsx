import { redirect } from "next/navigation";
import { getPortalAccountId } from "@/lib/portal/session";
import { createServiceClient } from "@/lib/portal/service-client";

export default async function PortalConfirmationPage() {
  const portalAccountId = await getPortalAccountId();
  if (!portalAccountId) {
    redirect("/portal/login");
  }

  const supabase = createServiceClient();
  const { data: account } = await supabase
    .from("client_portal_accounts")
    .select("username, client_id")
    .eq("id", portalAccountId)
    .maybeSingle();

  if (!account) {
    redirect("/portal/login");
  }

  const { data: client } = await supabase
    .from("clients")
    .select("codename")
    .eq("id", account.client_id)
    .maybeSingle();

  return (
    <div className="w-full max-w-sm border border-border bg-surface rounded-lg p-8 text-center">
      <h1 className="text-lg font-semibold text-gold mb-1">You&apos;re all set</h1>
      <p className="text-sm text-muted mb-6">
        Welcome, {client?.codename ?? "member"}.
      </p>
      <div className="rounded-md border border-border bg-background px-4 py-3 text-sm">
        <p className="text-xs text-muted mb-1">Your member username</p>
        <p className="text-foreground font-medium">{account.username}</p>
      </div>
    </div>
  );
}
