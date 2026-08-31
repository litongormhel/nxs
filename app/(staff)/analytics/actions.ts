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
          .select("service_id, percent, effective_from, effective_to")
          .in("service_id", serviceIds)
      : { data: [], error: null };
  if (ratesError) return { ok: false, error: ratesError.message };

  const ratesByService = new Map<
    string,
    { percent: number; fromDay: string; toDay: string | null }[]
  >();
  for (const r of rates ?? []) {
    const bucket = ratesByService.get(r.service_id) ?? [];
    bucket.push({
      percent: Number(r.percent),
      fromDay: toSpaDay(r.effective_from),
      toDay: r.effective_to ? toSpaDay(r.effective_to) : null,
    });
    ratesByService.set(r.service_id, bucket);
  }

  function rateFor(serviceId: string, bookingDate: string): number | null {
    const bucket = ratesByService.get(serviceId) ?? [];
    const match = bucket.find(
      (r) => r.fromDay <= bookingDate && (r.toDay === null || bookingDate < r.toDay)
    );
    return match ? match.percent : null;
  }

  const rowsByTherapist = new Map<string, CommissionReportRow>();
  for (const b of relevant) {
    const therapist = b.therapists!;
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
    const percent = rateFor(service.id, b.booking_date);
    const rateNotSet = percent === null;

    row.bookingsCount += 1;
    row.total += price;
    row.commission += rateNotSet ? 0 : (price * percent) / 100;

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
  staffId: string
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
    created_by: staffId,
  });
  if (insertError) return fail(insertError);

  revalidatePath("/analytics");
  return { ok: true };
}
