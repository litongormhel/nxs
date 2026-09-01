import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { getPortalAccountId } from "@/lib/portal/session";
import { createServiceClient } from "@/lib/portal/service-client";

export default async function PortalQrPage() {
  const portalAccountId = await getPortalAccountId();
  if (!portalAccountId) {
    redirect("/portal/login");
  }

  const supabase = createServiceClient();
  const { data: account } = await supabase
    .from("client_portal_accounts")
    .select("qr_token")
    .eq("id", portalAccountId)
    .maybeSingle();

  if (!account) {
    redirect("/portal/login");
  }

  const qrDataUrl = await QRCode.toDataURL(account.qr_token, {
    width: 320,
    margin: 2,
    color: { dark: "#0a0705", light: "#f2ece1" },
  });

  return (
    <div className="w-full max-w-sm border border-border bg-surface rounded-lg p-8 text-center">
      <h1 className="text-lg font-semibold text-gold mb-1">Your Member QR</h1>
      <p className="text-sm text-muted mb-6">Present this at reception.</p>
      <div className="rounded-md border border-border bg-background p-4 flex justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrDataUrl} alt="Member QR code" width={320} height={320} />
      </div>
    </div>
  );
}
