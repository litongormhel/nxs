"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toSpaDay } from "@/lib/analytics/spa-day";

type ActionResult = { ok: true } | { ok: false; error: string };

export type CommissionReportLine = {
  serviceId: string;
  serviceName: string;
  count: number;
  price: number;
  rateValue: number | null;
  rateType: "percent" | "flat";
  rateNotSet: boolean;
};

export type CommissionReportRow = {
  therapistId: string;
  therapistName: string;
  therapistArchived: boolean;
  bookingsCount: number;
  lines: CommissionReportLine[];
  total: number;
  commission: number;
};

export type CommissionReportResult =
  | { ok: true; rows: CommissionReportRow[]; grandTotal: number; grandCommission: number; grandBookings: number }
  | { ok: false; error: string };

type RateBucketEntry = {
  percent: number;
  rateType: "percent" | "flat";
  fromDay: string;
  toDay: string | null;
  isActive: boolean;
};

export async function getCommissionReport(
  startDate: string,
  endDate: string
): Promise<CommissionReportResult> {
  const supabase = await createClient();

  const { data: bookings, error: bookingsError } = await supabase
    .from("bookings")
    .select(
      "id, booking_date, service_id, therapist_id, status, services(id, name, price, requires_therapist), therapists(id, name, archived)"
    )
    .gte("booking_date", startDate)
    .lte("booking_date", endDate)
    .in("status", ["Booked", "Completed"])
    .not("therapist_id", "is", null);
  if (bookingsError) return { ok: false, error: bookingsError.message };

  const relevant = (bookings ?? []).filter(
    (b) => b.services?.requires_therapist === true && b.therapist_id && b.services
  );

  const serviceIds = Array.from(new Set(relevant.map((b) => b.service_id)));
  const { data: rates, error: ratesError } =
    serviceIds.length > 0
      ? await supabase
          .from("commission_rates")
          .select("service_id, percent, rate_type, effective_from, effective_to, is_active, services(id, name)")
          .in("service_id", serviceIds)
      : { data: [], error: null };
  if (ratesError) return { ok: false, error: ratesError.message };

  const ratesByServiceId = new Map<string, RateBucketEntry[]>();
  const ratesByServiceName = new Map<string, RateBucketEntry[]>();

  for (const r of rates ?? []) {
    const entry: RateBucketEntry = {
      percent: Number(r.percent),
      rateType: (r.rate_type === "flat" ? "flat" : "percent") as "percent" | "flat",
      fromDay: toSpaDay(r.effective_from),
      toDay: r.effective_to ? toSpaDay(r.effective_to) : null,
      isActive: Boolean(r.is_active),
    };

    const idBucket = ratesByServiceId.get(r.service_id) ?? [];
    idBucket.push(entry);
    ratesByServiceId.set(r.service_id, idBucket);

    const serviceName = r.services?.name?.toLowerCase().trim();
    if (serviceName) {
      const nameBucket = ratesByServiceName.get(serviceName) ?? [];
      nameBucket.push(entry);
      ratesByServiceName.set(serviceName, nameBucket);
    }
  }

  // Sort entries in each bucket by fromDay ascending
  const sortBucket = (bucket: RateBucketEntry[]) =>
    bucket.sort((a, b) => a.fromDay.localeCompare(b.fromDay));

  ratesByServiceId.forEach(sortBucket);
  ratesByServiceName.forEach(sortBucket);

  function rateFor(
    serviceId: string,
    serviceName: string,
    bookingDate: string
  ): { percent: number; rateType: "percent" | "flat" } | null {
    const bucket =
      ratesByServiceId.get(serviceId) ??
      ratesByServiceName.get(serviceName.toLowerCase().trim()) ??
      [];

    if (bucket.length === 0) return null;

    // 1. Exact historical effective-date window match
    const match = bucket.find(
      (r) => r.fromDay <= bookingDate && (r.toDay === null || bookingDate < r.toDay)
    );
    if (match) return { percent: match.percent, rateType: match.rateType };

    // 2. Fallback: if booking date is before earliest configured rate date or after latest closed rate date,
    // use the active rate or nearest rate so newly set rates resolve for current/historical reporting periods.
    const active = bucket.find((r) => r.isActive || r.toDay === null);
    if (active) return { percent: active.percent, rateType: active.rateType };

    const fallback = bucket[0];
    return fallback ? { percent: fallback.percent, rateType: fallback.rateType } : null;
  }

  const rowsByTherapist = new Map<string, CommissionReportRow>();
  for (const b of relevant) {
    const therapist = b.therapists ?? {
      id: b.therapist_id!,
      name: "Unknown Therapist",
      archived: false,
    };
    const service = b.services!;
    const row =
      rowsByTherapist.get(therapist.id) ??
      ({
        therapistId: therapist.id,
        therapistName: therapist.name,
        therapistArchived: therapist.archived,
        bookingsCount: 0,
        lines: [],
        total: 0,
        commission: 0,
      } as CommissionReportRow);

    const price = Number(service.price);
    const rateInfo = rateFor(service.id, service.name, b.booking_date);
    const rateNotSet = rateInfo === null;
    const rateValue = rateInfo ? rateInfo.percent : null;
    const rateType = rateInfo ? rateInfo.rateType : "percent";

    let lineCommission = 0;
    if (!rateNotSet && rateValue !== null) {
      if (rateType === "flat") {
        lineCommission = rateValue;
      } else {
        lineCommission = (price * rateValue) / 100;
      }
    }

    row.bookingsCount += 1;
    row.total += price;
    row.commission += lineCommission;

    const line = row.lines.find((l) => l.serviceId === service.id);
    if (line) {
      line.count += 1;
      line.price += price;
      line.rateNotSet = line.rateNotSet || rateNotSet;
    } else {
      row.lines.push({
        serviceId: service.id,
        serviceName: service.name,
        count: 1,
        price,
        rateValue,
        rateType,
        rateNotSet,
      });
    }

    rowsByTherapist.set(therapist.id, row);
  }

  const rows = Array.from(rowsByTherapist.values()).sort((a, b) =>
    a.therapistName.localeCompare(b.therapistName)
  );
  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);
  const grandCommission = rows.reduce((sum, r) => sum + r.commission, 0);
  const grandBookings = rows.reduce((sum, r) => sum + r.bookingsCount, 0);

  return { ok: true, rows, grandTotal, grandCommission, grandBookings };
}

function fail(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export async function setCommissionRate(
  serviceId: string,
  percent: number,
  staffId: string,
  rateType: "percent" | "flat" = "percent"
): Promise<ActionResult> {
  const supabase = await createClient();

  const { error: closeError } = await supabase
    .from("commission_rates")
    .update({ effective_to: new Date().toISOString(), is_active: false })
    .eq("service_id", serviceId)
    .eq("is_active", true);
  if (closeError) return fail(closeError);

  const { error: insertError } = await supabase.from("commission_rates").insert({
    service_id: serviceId,
    percent,
    rate_type: rateType,
    created_by: staffId,
  });
  if (insertError) return fail(insertError);

  revalidatePath("/analytics");
  return { ok: true };
}
