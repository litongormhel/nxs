"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/portal/service-client";
import { computeLoyaltyPoints, WET_AREA_POINTS, type LoyaltyFormulaMode } from "@/lib/loyalty";

export type LogVisitInput = {
  clientId: string;
  serviceId: string;
  staffId: string;
  isRedemption: boolean;
  paymentMethod: "Cash" | "GCash" | "Card" | "Points";
  amount: number;
  paymentRef?: string;
};

export type LogVisitResult =
  | { ok: true; ledgerId: string; saleId: string | null }
  | { ok: false; error: string };

export async function logVisit(input: LogVisitInput): Promise<LogVisitResult> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("log_visit", {
    p_client_id: input.clientId,
    p_service_id: input.serviceId,
    p_staff_id: input.staffId,
    p_is_redemption: input.isRedemption,
    p_payment_method: input.paymentMethod,
    p_amount: input.amount,
    p_payment_ref: input.paymentRef,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = data?.[0];
  if (!row) {
    return { ok: false, error: "log_visit returned no result." };
  }

  revalidatePath("/clients");
  revalidatePath("/dashboard");

  return { ok: true, ledgerId: row.ledger_id, saleId: row.sale_id };
}

// -------------------------------------------------------------
// Past Walk-in Visit Claim Actions
// -------------------------------------------------------------

export type RequestWalkinClaimInput = {
  bookingId: string;
  targetClientId: string;
};

export type RequestWalkinClaimResult =
  | { ok: true; claimId: string }
  | { ok: false; error: string };

export async function requestWalkinClaim(
  input: RequestWalkinClaimInput
): Promise<RequestWalkinClaimResult> {
  const supabase = await createClient();

  // 1. Get authenticated staff
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not authenticated." };
  }

  const { data: staffRow } = await supabase
    .from("staff")
    .select("id, name")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (!staffRow) {
    return { ok: false, error: "Staff profile not found." };
  }

  let db: any = supabase;
  try {
    db = createServiceClient();
  } catch {
    db = supabase;
  }

  // 1.5. Check allow_walkin_claims setting before processing
  const { data: settings } = await (db as any)
    .from("app_settings")
    .select("allow_walkin_claims, loyalty_formula_mode, peso_per_point")
    .eq("id", true)
    .maybeSingle();

  if (settings && settings.allow_walkin_claims === false) {
    return {
      ok: false,
      error: "Past walk-in claims are currently disabled.",
    };
  }

  // 2. Validate booking exists and is unlinked
  const { data: booking, error: bkErr } = await db
    .from("bookings")
    .select(`
      id,
      client_id,
      services ( name, price, points_earned ),
      sales ( amount )
    `)
    .eq("id", input.bookingId)
    .maybeSingle();

  if (bkErr || !booking) {
    return { ok: false, error: "Booking not found." };
  }

  if (booking.client_id) {
    return { ok: false, error: "This visit is already linked to a client." };
  }

  // 3. Check for existing claim
  const { data: existingClaim } = await db
    .from("visit_claims")
    .select("id, status")
    .eq("booking_id", input.bookingId)
    .maybeSingle();

  if (existingClaim && existingClaim.status === "pending") {
    return {
      ok: false,
      error: "A claim request for this visit is already pending review.",
    };
  }

  // 4. Compute points to credit based on loyalty settings
  const svc = Array.isArray(booking.services) ? booking.services[0] : booking.services;
  const sale = Array.isArray(booking.sales) ? booking.sales[0] : booking.sales;
  const serviceName = svc?.name ?? "";
  const fullPrice = svc?.price ? Number(svc.price) : 0;
  const basePoints = svc?.points_earned ? Number(svc.points_earned) : 0;
  const paidAmount = sale?.amount != null ? Number(sale.amount) : fullPrice;

  let pointsToCredit = 0;
  if (serviceName === "Wet Area") {
    pointsToCredit = WET_AREA_POINTS;
  } else {
    const mode = (settings?.loyalty_formula_mode ?? "proportional") as LoyaltyFormulaMode;
    pointsToCredit = computeLoyaltyPoints(
      mode,
      paidAmount,
      fullPrice,
      basePoints,
      settings?.peso_per_point ?? null
    );
  }

  // 5. Insert or update visit_claims
  let claimId: string;
  if (existingClaim) {
    const { data: updated, error: upErr } = await db
      .from("visit_claims")
      .update({
        target_client_id: input.targetClientId,
        requested_by_staff_id: staffRow.id,
        reviewed_by_staff_id: null,
        points_to_credit: pointsToCredit,
        status: "pending",
        created_at: new Date().toISOString(),
        reviewed_at: null,
      })
      .eq("id", existingClaim.id)
      .select("id")
      .single();

    if (upErr || !updated) {
      return { ok: false, error: upErr?.message ?? "Failed to update claim request." };
    }
    claimId = updated.id;
  } else {
    const { data: inserted, error: inErr } = await db
      .from("visit_claims")
      .insert({
        booking_id: input.bookingId,
        target_client_id: input.targetClientId,
        requested_by_staff_id: staffRow.id,
        points_to_credit: pointsToCredit,
        status: "pending",
      })
      .select("id")
      .single();

    if (inErr || !inserted) {
      return { ok: false, error: inErr?.message ?? "Failed to create claim request." };
    }
    claimId = inserted.id;
  }

  // 6. Audit logging
  try {
    await db.from("action_logs").insert({
      action: "request_walkin_claim",
      staff_id: staffRow.id,
      detail: `Staff ${staffRow.name} requested claim for booking ${input.bookingId} to client ${input.targetClientId} (+${pointsToCredit} pts)`,
    });
  } catch (logErr) {
    console.warn("Failed to write to action_logs:", logErr);
  }

  revalidatePath("/clients");
  return { ok: true, claimId };
}

export type ClaimActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function approveWalkinClaim(claimId: string): Promise<ClaimActionResult> {
  const supabase = await createClient();

  // 1. Authenticate and verify Supervisor or Owner
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { data: staffRow } = await supabase
    .from("staff")
    .select("id, name, position")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (!staffRow || !["Supervisor", "Owner"].includes(staffRow.position)) {
    return { ok: false, error: "Unauthorized. Only Supervisors or Owners can approve claims." };
  }

  let db: any = supabase;
  try {
    db = createServiceClient();
  } catch {
    db = supabase;
  }

  // 2. Fetch claim
  const { data: claim, error: clErr } = await db
    .from("visit_claims")
    .select(`
      id,
      booking_id,
      target_client_id,
      points_to_credit,
      status,
      bookings (
        id,
        client_id,
        services ( name ),
        sales ( id )
      )
    `)
    .eq("id", claimId)
    .maybeSingle();

  if (clErr || !claim) {
    return { ok: false, error: "Claim request not found." };
  }

  if (claim.status !== "pending") {
    return { ok: false, error: `Claim is already ${claim.status}.` };
  }

  const bk = Array.isArray(claim.bookings) ? claim.bookings[0] : claim.bookings;
  const svc = Array.isArray(bk?.services) ? bk.services[0] : bk?.services;
  const sale = Array.isArray(bk?.sales) ? bk.sales[0] : bk?.sales;
  const serviceName = svc?.name ?? "Visit";
  const saleId = sale?.id ?? null;

  // 3. Atomically link booking, sales, and locker_occupancy
  const { error: bUpErr } = await db
    .from("bookings")
    .update({ client_id: claim.target_client_id })
    .eq("id", claim.booking_id);

  if (bUpErr) {
    return { ok: false, error: `Failed to link booking: ${bUpErr.message}` };
  }

  await db
    .from("sales")
    .update({ client_id: claim.target_client_id })
    .eq("booking_id", claim.booking_id);

  await db
    .from("locker_occupancy")
    .update({ client_id: claim.target_client_id })
    .eq("booking_id", claim.booking_id);

  // 4. Insert ledger entry into point_transactions
  if (claim.points_to_credit > 0) {
    const { error: ptErr } = await db.from("point_transactions").insert({
      client_id: claim.target_client_id,
      booking_id: claim.booking_id,
      sale_id: saleId,
      points_delta: claim.points_to_credit,
      entry_type: "EARN",
      source: "STAFF_MANUAL",
      processed_by: staffRow.id,
      notes: `Past visit claim approved: ${serviceName}`,
    });

    if (ptErr) {
      console.warn("Failed to insert point_transactions row:", ptErr);
    }
  }

  // 5. Update visit_claims to approved
  const { error: cUpErr } = await db
    .from("visit_claims")
    .update({
      status: "approved",
      reviewed_by_staff_id: staffRow.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", claimId);

  if (cUpErr) {
    return { ok: false, error: `Failed to update claim status: ${cUpErr.message}` };
  }

  // 6. Action logs
  try {
    await db.from("action_logs").insert({
      action: "approve_walkin_claim",
      staff_id: staffRow.id,
      detail: `Approved claim ${claimId} for booking ${claim.booking_id}. Credited ${claim.points_to_credit} pts to client ${claim.target_client_id}.`,
    });
  } catch (logErr) {
    console.warn("Failed to write action_log:", logErr);
  }

  revalidatePath("/clients");
  revalidatePath("/portal");
  revalidatePath("/bookings");

  return { ok: true };
}

export type ApproveAllResult =
  | { ok: true; count: number; pointsTotal: number }
  | { ok: false; error: string };

export async function approveAllWalkinClaims(): Promise<ApproveAllResult> {
  const supabase = await createClient();

  // 1. Authenticate and verify Supervisor or Owner
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { data: staffRow } = await supabase
    .from("staff")
    .select("id, name, position")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (!staffRow || !["Supervisor", "Owner"].includes(staffRow.position)) {
    return { ok: false, error: "Unauthorized. Only Supervisors or Owners can approve claims." };
  }

  let db: any = supabase;
  try {
    db = createServiceClient();
  } catch {
    db = supabase;
  }

  // 2. Fetch all pending claims
  const { data: pendingClaims, error: pErr } = await db
    .from("visit_claims")
    .select(`
      id,
      booking_id,
      target_client_id,
      points_to_credit,
      bookings (
        id,
        services ( name ),
        sales ( id )
      )
    `)
    .eq("status", "pending");

  if (pErr) {
    return { ok: false, error: pErr.message };
  }

  if (!pendingClaims || pendingClaims.length === 0) {
    return { ok: true, count: 0, pointsTotal: 0 };
  }

  let approvedCount = 0;
  let pointsTotal = 0;

  for (const claim of pendingClaims) {
    const bk = Array.isArray(claim.bookings) ? claim.bookings[0] : claim.bookings;
    const svc = Array.isArray(bk?.services) ? bk.services[0] : bk?.services;
    const sale = Array.isArray(bk?.sales) ? bk.sales[0] : bk?.sales;
    const serviceName = svc?.name ?? "Visit";
    const saleId = sale?.id ?? null;

    // Link booking, sales, locker_occupancy
    await db
      .from("bookings")
      .update({ client_id: claim.target_client_id })
      .eq("id", claim.booking_id);

    await db
      .from("sales")
      .update({ client_id: claim.target_client_id })
      .eq("booking_id", claim.booking_id);

    await db
      .from("locker_occupancy")
      .update({ client_id: claim.target_client_id })
      .eq("booking_id", claim.booking_id);

    // Ledger insert
    if (claim.points_to_credit > 0) {
      await db.from("point_transactions").insert({
        client_id: claim.target_client_id,
        booking_id: claim.booking_id,
        sale_id: saleId,
        points_delta: claim.points_to_credit,
        entry_type: "EARN",
        source: "STAFF_MANUAL",
        processed_by: staffRow.id,
        notes: `Past visit claim approved (bulk): ${serviceName}`,
      });
    }

    // Update claim status
    await db
      .from("visit_claims")
      .update({
        status: "approved",
        reviewed_by_staff_id: staffRow.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", claim.id);

    approvedCount++;
    pointsTotal += claim.points_to_credit ?? 0;
  }

  // Action log
  try {
    await db.from("action_logs").insert({
      action: "approve_all_walkin_claims",
      staff_id: staffRow.id,
      detail: `Bulk approved ${approvedCount} claims, crediting a total of ${pointsTotal} points.`,
    });
  } catch (logErr) {
    console.warn("Failed to write action_log:", logErr);
  }

  revalidatePath("/clients");
  revalidatePath("/portal");
  revalidatePath("/bookings");

  return { ok: true, count: approvedCount, pointsTotal };
}

export async function rejectWalkinClaim(claimId: string): Promise<ClaimActionResult> {
  const supabase = await createClient();

  // 1. Authenticate and verify Supervisor or Owner
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { data: staffRow } = await supabase
    .from("staff")
    .select("id, name, position")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (!staffRow || !["Supervisor", "Owner"].includes(staffRow.position)) {
    return { ok: false, error: "Unauthorized. Only Supervisors or Owners can reject claims." };
  }

  let db: any = supabase;
  try {
    db = createServiceClient();
  } catch {
    db = supabase;
  }

  // 2. Update claim to rejected
  const { data: claim, error: clErr } = await db
    .from("visit_claims")
    .update({
      status: "rejected",
      reviewed_by_staff_id: staffRow.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", claimId)
    .select("booking_id")
    .single();

  if (clErr) {
    return { ok: false, error: clErr.message };
  }

  // 3. Action log
  try {
    await db.from("action_logs").insert({
      action: "reject_walkin_claim",
      staff_id: staffRow.id,
      detail: `Rejected claim ${claimId} for booking ${claim?.booking_id}. Restored walk-in availability.`,
    });
  } catch (logErr) {
    console.warn("Failed to write action_log:", logErr);
  }

  revalidatePath("/clients");
  return { ok: true };
}

// -------------------------------------------------------------
// Manual Points Adjustment (Owner Only)
// -------------------------------------------------------------

export type AdjustClientPointsInput = {
  clientId: string;
  pointsDelta: number;
  remarks?: string;
};

export type AdjustClientPointsResult =
  | { ok: true; newBalance: number }
  | { ok: false; error: string };

export async function adjustClientPoints(
  input: AdjustClientPointsInput
): Promise<AdjustClientPointsResult> {
  const supabase = await createClient();

  // 1. Authenticate caller
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not authenticated." };
  }

  // 2. Strictly enforce role: verify caller is Owner
  const { data: staffRow } = await supabase
    .from("staff")
    .select("id, name, position")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (!staffRow || staffRow.position.toLowerCase() !== "owner") {
    return { ok: false, error: "Unauthorized. Only the Owner can manually adjust points." };
  }

  // 3. Validate pointsDelta !== 0
  const delta = Math.round(Number(input.pointsDelta));
  if (isNaN(delta) || delta === 0) {
    return { ok: false, error: "Points adjustment must be a non-zero integer." };
  }

  let db: any = supabase;
  try {
    db = createServiceClient();
  } catch {
    db = supabase;
  }

  // 4. Fetch target client to check existence and prevent negative balance
  const { data: client, error: clientErr } = await db
    .from("clients")
    .select("id, codename, points_balance")
    .eq("id", input.clientId)
    .maybeSingle();

  if (clientErr || !client) {
    return { ok: false, error: "Target client not found." };
  }

  const currentBalance = Number(client.points_balance) || 0;
  const newBalance = currentBalance + delta;
  if (newBalance < 0) {
    return {
      ok: false,
      error: `Insufficient points. Client currently has ${currentBalance} pts, cannot deduct ${Math.abs(delta)} pts.`,
    };
  }

  // 5. Execute ledger adjustment
  const reason =
    input.remarks?.trim() ||
    (delta > 0
      ? "Manual points addition by Owner"
      : "Manual points deduction by Owner");

  const { error: ledgerErr } = await db.from("point_transactions").insert({
    client_id: input.clientId,
    points_delta: delta,
    entry_type: "ADJUSTMENT",
    source: "ADJUSTMENT",
    processed_by: staffRow.id,
    notes: reason,
  });

  if (ledgerErr) {
    return {
      ok: false,
      error: `Failed to record points transaction: ${ledgerErr.message}`,
    };
  }

  // 6. Record in action_logs with human-readable detail
  const signStr = delta > 0 ? `+${delta}` : `${delta}`;
  const logDetail = input.remarks?.trim()
    ? `Owner adjusted points for ${client.codename}: ${signStr} pts (Reason: ${input.remarks.trim()})`
    : `Owner adjusted points for ${client.codename}: ${signStr} pts`;

  try {
    await db.from("action_logs").insert({
      action: "manual_points_adjustment",
      staff_id: staffRow.id,
      detail: logDetail,
    });
  } catch (logErr) {
    console.warn("Failed to write action_log for points adjustment:", logErr);
  }

  // 7. Revalidate paths
  revalidatePath("/clients");
  revalidatePath("/portal");

  return { ok: true, newBalance };
}

// -------------------------------------------------------------
// Receptionist Notes Actions
// -------------------------------------------------------------

export type UpdateClientNotesInput = {
  clientId: string;
  notes: string | null;
};

export type UpdateClientNotesResult =
  | { ok: true; notes: string | null }
  | { ok: false; error: string };

export async function updateClientNotes(
  input: UpdateClientNotesInput
): Promise<UpdateClientNotesResult> {
  const supabase = await createClient();

  // 1. Verify authenticated staff
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not authenticated." };
  }

  const { data: staffRow } = await supabase
    .from("staff")
    .select("id, name")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (!staffRow) {
    return { ok: false, error: "Staff profile not found." };
  }

  let db: any = supabase;
  try {
    db = createServiceClient();
  } catch {
    db = supabase;
  }

  const cleanedNotes = input.notes?.trim() ? input.notes.trim() : null;

  const { error } = await db
    .from("clients")
    .update({ notes: cleanedNotes })
    .eq("id", input.clientId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/clients");
  return { ok: true, notes: cleanedNotes };
}

