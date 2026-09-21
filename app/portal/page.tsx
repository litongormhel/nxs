import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { getPortalAccountId } from "@/lib/portal/session";
import { createServiceClient } from "@/lib/portal/service-client";
import { MemberDashboard, MemberProfile, PastVisit } from "@/components/client-portal/member-dashboard";

export const dynamic = "force-dynamic";

type ServiceRelation = {
  name: string;
  duration_minutes: number;
} | null;

type TherapistRelation = {
  name: string;
} | null;

type RawBookingRow = {
  id: string;
  booking_date: string;
  start_time: string;
  duration_minutes: number | null;
  status: string;
  services: ServiceRelation | ServiceRelation[];
  therapists: TherapistRelation | TherapistRelation[];
};

export default async function MemberPortalPage() {
  const portalAccountId = await getPortalAccountId();
  if (!portalAccountId) {
    redirect("/portal/login");
  }

  const supabase = createServiceClient();

  const { data: account } = await supabase
    .from("client_portal_accounts")
    .select("id, client_id, username, qr_token")
    .eq("id", portalAccountId)
    .maybeSingle();

  if (!account || !account.client_id) {
    redirect("/portal/login");
  }

  const [clientRes, bookingsRes, qrDataUrl] = await Promise.all([
    supabase
      .from("clients")
      .select("id, codename, member_code, points_balance")
      .eq("id", account.client_id)
      .maybeSingle(),
    supabase
      .from("bookings")
      .select(`
        id,
        booking_date,
        start_time,
        duration_minutes,
        status,
        services ( name, duration_minutes ),
        therapists ( name )
      `)
      .eq("client_id", account.client_id)
      .eq("status", "Completed")
      .order("booking_date", { ascending: false })
      .order("start_time", { ascending: false })
      .limit(10),
    QRCode.toDataURL(account.qr_token, {
      width: 320,
      margin: 2,
      color: { dark: "#0a0705", light: "#f2ece1" },
    }).catch(() => ""),
  ]);

  if (!clientRes.data) {
    redirect("/portal/login");
  }

  const client = clientRes.data;

  const member: MemberProfile = {
    id: client.id,
    codename: client.codename,
    username: account.username,
    memberCode: client.member_code,
    pointsBalance: client.points_balance,
    qrToken: account.qr_token,
    qrDataUrl,
  };

  const rawBookings = (bookingsRes.data ?? []) as unknown as RawBookingRow[];

  const pastVisits: PastVisit[] = rawBookings.map((b) => {
    const serviceObj = Array.isArray(b.services) ? b.services[0] : b.services;
    const therapistObj = Array.isArray(b.therapists) ? b.therapists[0] : b.therapists;

    return {
      id: b.id,
      bookingDate: b.booking_date,
      startTime: b.start_time,
      durationMinutes: b.duration_minutes ?? serviceObj?.duration_minutes ?? null,
      serviceName: serviceObj?.name ?? "Spa Service",
      therapistName: therapistObj?.name ?? null,
      status: b.status,
    };
  });

  return (
    <div className="w-full max-w-2xl my-8">
      <MemberDashboard member={member} pastVisits={pastVisits} />
    </div>
  );
}
