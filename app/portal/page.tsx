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

type PointTransactionRelation = {
  id: string;
  entry_type: string;
} | null;

type SaleRelation = {
  id: string;
  voided: boolean;
} | null;

type RawBookingRow = {
  id: string;
  booking_date: string;
  start_time: string;
  duration_minutes: number | null;
  status: string;
  created_at: string;
  services: ServiceRelation | ServiceRelation[];
  therapists: TherapistRelation | TherapistRelation[];
  point_transactions: PointTransactionRelation | PointTransactionRelation[];
  sales: SaleRelation | SaleRelation[];
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
        created_at,
        services ( name, duration_minutes ),
        therapists ( name ),
        point_transactions ( id, entry_type ),
        sales ( id, voided )
      `)
      .eq("client_id", account.client_id)
      .order("booking_date", { ascending: false })
      .order("start_time", { ascending: false }),
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

  // Filter for verified completed/availed visits while strictly excluding genuinely cancelled or no-show bookings
  const verifiedBookings = rawBookings.filter((b) => {
    const normStatus = (b.status ?? "").trim().toLowerCase();

    // Check for associated EARN point transactions
    const txList = Array.isArray(b.point_transactions)
      ? b.point_transactions
      : b.point_transactions
        ? [b.point_transactions]
        : [];
    const hasEarnPoints = txList.some((tx) => tx?.entry_type === "EARN");

    // Check for associated active sales
    const salesList = Array.isArray(b.sales)
      ? b.sales
      : b.sales
        ? [b.sales]
        : [];
    const hasActiveSale = salesList.some((s) => s && !s.voided);

    // If status is completed
    if (normStatus === "completed") {
      return true;
    }

    // If booking earned points or has a valid sale, it's a verified completed/availed visit
    if (hasEarnPoints || hasActiveSale) {
      return true;
    }

    // Exclude genuinely cancelled, no-show, or uncompleted bookings
    return false;
  });

  const pastVisits: PastVisit[] = verifiedBookings
    .sort((a, b) => {
      const dateDiff = b.booking_date.localeCompare(a.booking_date);
      if (dateDiff !== 0) return dateDiff;
      const timeDiff = b.start_time.localeCompare(a.start_time);
      if (timeDiff !== 0) return timeDiff;
      return (b.created_at || "").localeCompare(a.created_at || "");
    })
    .slice(0, 10)
    .map((b) => {
      const serviceObj = Array.isArray(b.services) ? b.services[0] : b.services;
      const therapistObj = Array.isArray(b.therapists) ? b.therapists[0] : b.therapists;

      return {
        id: b.id,
        bookingDate: b.booking_date,
        startTime: b.start_time,
        durationMinutes: b.duration_minutes ?? serviceObj?.duration_minutes ?? null,
        serviceName: serviceObj?.name ?? "Spa Service",
        therapistName: therapistObj?.name ?? null,
        status: "Completed",
      };
    });

  return (
    <div className="w-full max-w-2xl my-8">
      <MemberDashboard member={member} pastVisits={pastVisits} />
    </div>
  );
}
