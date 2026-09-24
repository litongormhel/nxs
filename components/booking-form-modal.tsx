"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { createBooking } from "@/app/(staff)/bookings/actions";
import { useStaffSim } from "@/lib/staff-context";
import { slotsOverlap, isSlotPastGracePeriod } from "@/lib/bookings/slots";
import { spaDayNow } from "@/lib/analytics/spa-day";
import { ClientCombobox } from "@/components/client-combobox";
import { DEFAULT_SMS_TEMPLATE, interpolateSmsTemplate, formatSmsDate } from "@/lib/bookings/sms";
import { validatePromoEligibility } from "@/lib/promos/validation";
import { computeLoyaltyPoints, WET_AREA_POINTS, type LoyaltyFormulaMode } from "@/lib/loyalty";
import type { Client, Promo, Service, Staff, Therapist, SmsConfirmationTarget } from "@/components/booking-browser";
import type { Database } from "@/lib/types/database";

type ConflictRow = {
  therapist_id: string | null;
  room_number: number | null;
  start_time: string;
  duration_minutes: number | null;
  status?: string | null;
};

const ACTIVE_STATUSES: Database["public"]["Enums"]["booking_status"][] = [
  "Booked",
  "Completed",
  "Needs Reassignment",
];

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function roundedNowTime(): string {
  const d = new Date();
  let h = d.getHours();
  let m = Math.round(d.getMinutes() / 30) * 30;
  if (m === 60) {
    m = 0;
    h += 1;
  }
  return `${String(h % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function fmtTime(t: string): string {
  if (!t || !t.includes(":")) return t;
  const [h, m] = t.split(":");
  const hr = ((+h + 11) % 12) + 1;
  return `${hr}:${m} ${+h < 12 ? "AM" : "PM"}`;
}

export function showBookingToast({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  if (typeof document === "undefined") return;

  const existing = document.getElementById("nxs-booking-toast");
  if (existing) {
    existing.remove();
  }

  const container = document.createElement("div");
  container.id = "nxs-booking-toast";
  container.className =
    "fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] rounded-xl border border-gold bg-surface-2 px-5 py-3 shadow-2xl animate-fade-in text-center max-w-sm w-full transition-all duration-300 pointer-events-auto cursor-pointer";

  const titleEl = document.createElement("div");
  titleEl.className = "text-xs font-bold text-accent-gold tracking-wide";
  titleEl.innerText = title;

  const descEl = document.createElement("div");
  descEl.className = "text-[11px] text-foreground font-medium mt-0.5 truncate";
  descEl.innerText = description;

  container.appendChild(titleEl);
  container.appendChild(descEl);

  document.body.appendChild(container);

  const timeoutId = setTimeout(() => {
    container.style.opacity = "0";
    container.style.transform = "translate(-50%, 10px)";
    setTimeout(() => {
      container.remove();
    }, 300);
  }, 4000);

  container.onclick = () => {
    clearTimeout(timeoutId);
    container.remove();
  };
}

export function BookingFormModal({
  clients,
  services,
  therapists,
  rooms,
  staff,
  timeSlots,
  defaultDate,
  initialTherapistId,
  onClose,
  onCreated,
}: {
  clients: Client[];
  services: Service[];
  therapists: Therapist[];
  rooms: number[];
  staff: Staff[];
  timeSlots: string[];
  defaultDate?: string;
  initialTherapistId?: string;
  onClose: () => void;
  onCreated: (target?: SmsConfirmationTarget) => void;
}) {
  const [step, setStep] = useState<"form" | "review">("form");
  const [clientSelectValue, setClientSelectValue] = useState<string>("__walkin__");
  const [walkinName, setWalkinName] = useState("");
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [therapistId, setTherapistId] = useState(initialTherapistId ?? "");

  // Resolve therapist id if name was passed or therapists loaded after initial mount
  useEffect(() => {
    if (!initialTherapistId) return;
    if (therapists.length > 0) {
      const match = therapists.find(
        (t) => t.id === initialTherapistId || t.name.toLowerCase() === initialTherapistId.toLowerCase()
      );
      if (match && therapistId !== match.id) {
        setTherapistId(match.id);
      }
    }
  }, [initialTherapistId, therapists, therapistId]);

  const [promos, setPromos] = useState<Promo[]>([]);
  const [promoId, setPromoId] = useState<string>("none");
  const [notes, setNotes] = useState("");
  const [clientPointsBalance, setClientPointsBalance] = useState<number | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("promos")
      .select("id, label, discount, applicable_days, applicable_slots, min_pax")
      .eq("active", true)
      .then(({ data, error }) => {
        if (error && (error.code === "42703" || error.code === "PGRST204" || error.message?.includes("applicable_days") || error.message?.includes("schema cache"))) {
          supabase
            .from("promos")
            .select("id, label, discount")
            .eq("active", true)
            .then(({ data: fallbackData }) => {
              if (fallbackData) {
                setPromos(
                  fallbackData.map((p) => ({
                    ...p,
                    applicable_days: null,
                    applicable_slots: null,
                    min_pax: 1,
                  }))
                );
              }
            });
        } else if (data) {
          setPromos(data);
        }
      });
  }, []);

  useEffect(() => {
    if (clientSelectValue === "__walkin__" || !clientSelectValue) {
      setClientPointsBalance(null);
      return;
    }
    const supabase = createClient();
    supabase
      .from("clients")
      .select("points_balance")
      .eq("id", clientSelectValue)
      .maybeSingle()
      .then(({ data }) => {
        setClientPointsBalance(data?.points_balance ?? 0);
      });
  }, [clientSelectValue]);

  const [date, setDate] = useState(defaultDate || spaDayNow());
  const [slotTime, setSlotTime] = useState<string>("");
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 30_000);
    return () => clearInterval(timer);
  }, []);
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [customTime, setCustomTime] = useState(roundedNowTime());
  const [manualRoomNumber, setManualRoomNumber] = useState<number | null>(null);
  const { sessionStaff } = useStaffSim();
  const actor = sessionStaff;
  const staffId = actor?.id ?? "";
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
  const [unavailableTherapists, setUnavailableTherapists] = useState<Map<string, string>>(new Map());
  const [therapistBreaksMap, setTherapistBreaksMap] = useState<Map<string, Set<string>>>(new Map());
  const [serviceTherapistMap, setServiceTherapistMap] = useState<Map<string, Set<string>>>(new Map());
  const [therapistServicesMap, setTherapistServicesMap] = useState<Map<string, Set<string>>>(new Map());
  const [servicesLoaded, setServicesLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSmsTemplate, setActiveSmsTemplate] = useState<string>(DEFAULT_SMS_TEMPLATE);
  const [loyaltySettings, setLoyaltySettings] = useState<{
    mode: LoyaltyFormulaMode;
    pesoPerPoint: number | null;
  }>({ mode: "proportional", pesoPerPoint: null });
  const [isPending, startTransition] = useTransition();
  const errorRef = useRef<HTMLParagraphElement>(null);

  const [clientBookings, setClientBookings] = useState<
    Array<{ client_id: string | null; guest_label: string | null; start_time: string }>
  >([]);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("app_settings")
      .select("sms_confirmation_template, loyalty_formula_mode, peso_per_point")
      .eq("id", true)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (!err && data) {
          if (data.sms_confirmation_template) {
            setActiveSmsTemplate(data.sms_confirmation_template);
          }
          setLoyaltySettings({
            mode: (data.loyalty_formula_mode as LoyaltyFormulaMode) || "proportional",
            pesoPerPoint: data.peso_per_point ?? null,
          });
        }
      });
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("bookings")
      .select("client_id, guest_label, therapist_id, room_number, start_time, duration_minutes, status")
      .eq("booking_date", date)
      .in("status", ACTIVE_STATUSES)
      .then(({ data }) => {
        setConflicts(data ?? []);
        setClientBookings(
          (data ?? []).map((b) => ({
            client_id: b.client_id,
            guest_label: b.guest_label,
            start_time: b.start_time,
          }))
        );
      });
  }, [date]);

  // Therapist status (Day Off / Absent / On Leave) for the selected date —
  // same per-date client-side query pattern as `conflicts` above, kept
  // independent by design (see bookings_state.md "Known simplifications").
  useEffect(() => {
    const supabase = createClient();
    const weekday = new Date(`${date}T00:00:00`).getDay();
    Promise.all([
      supabase.from("therapist_day_off").select("therapist_id, weekday"),
      supabase.from("therapist_absence").select("therapist_id, absent_date").eq("absent_date", date),
      supabase
        .from("therapist_leave")
        .select("therapist_id, start_date, end_date")
        .lte("start_date", date)
        .gte("end_date", date),
      supabase.from("therapist_services").select("therapist_id, service_id"),
      (supabase
        .from("therapist_breaks" as any) as any)
        .select("therapist_id, slot_time")
        .eq("break_date", date),
    ]).then(([dayOff, absence, leave, servicesOffered, breaks]) => {
      const map = new Map<string, string>();
      for (const row of dayOff.data ?? []) {
        if (row.weekday === weekday) map.set(row.therapist_id, "Day Off");
      }
      for (const row of absence.data ?? []) {
        map.set(row.therapist_id, "Absent");
      }
      for (const row of leave.data ?? []) {
        map.set(row.therapist_id, "On Leave");
      }
      setUnavailableTherapists(map);

      const brMap = new Map<string, Set<string>>();
      for (const row of breaks.data ?? []) {
        if (!row.therapist_id || !row.slot_time) continue;
        if (!brMap.has(row.therapist_id)) {
          brMap.set(row.therapist_id, new Set());
        }
        brMap.get(row.therapist_id)!.add(row.slot_time.slice(0, 5));
      }
      setTherapistBreaksMap(brMap);

      const scrubService = services.find(
        (s) => s.name === "Prime Scrub Massage" || s.name.toLowerCase().includes("scrub")
      );
      const activeScrubId = scrubService?.id ?? "d5f6ee31-309f-4933-85c5-f2f98f95afba";
      const legacyScrubIds = new Set([
        "326e0b78-49cb-441c-aa03-e54453f2f67f",
        "8c97c5db-eaa9-47b9-89c0-9db114000483",
      ]);

      const stMap = new Map<string, Set<string>>();
      const tsMap = new Map<string, Set<string>>();
      for (const row of servicesOffered.data ?? []) {
        const serviceIdsToMap = [row.service_id];
        if (legacyScrubIds.has(row.service_id) && activeScrubId) {
          serviceIdsToMap.push(activeScrubId);
        } else if (row.service_id === activeScrubId) {
          legacyScrubIds.forEach((id) => serviceIdsToMap.push(id));
        }

        for (const sId of serviceIdsToMap) {
          if (!stMap.has(sId)) {
            stMap.set(sId, new Set());
          }
          stMap.get(sId)!.add(row.therapist_id);

          if (!tsMap.has(row.therapist_id)) {
            tsMap.set(row.therapist_id, new Set());
          }
          tsMap.get(row.therapist_id)!.add(sId);
        }
      }
      setServiceTherapistMap(stMap);
      setTherapistServicesMap(tsMap);
      setServicesLoaded(true);
    });
  }, [date, services]);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [error]);

  const isWalkIn = clientSelectValue === "__walkin__";
  const canRedeemLoyalty = !isWalkIn && !!clientSelectValue && (clientPointsBalance ?? 0) >= 100;

  useEffect(() => {
    if (promoId === "redeem_100_pts" && !canRedeemLoyalty) {
      setPromoId("none");
    }
  }, [canRedeemLoyalty, promoId]);

  const selectedClient = isWalkIn ? null : clients.find((c) => c.id === clientSelectValue);
  const selectedService = services.find((s) => s.id === serviceId);
  const combiService = services.find((s) => s.name.toLowerCase().includes("combi"));
  const combiCredit = combiService?.price ?? 1100;
  const duration = selectedService?.duration_minutes ?? 0;
  const isMassageService = selectedService?.name !== "Wet Area";
  const isTherapistSelected = !!therapistId;
  const isPastDate = date < spaDayNow();
  const time = useCustomTime ? customTime : slotTime;

  const effectiveRooms = useMemo(
    () => (rooms && rooms.length > 0 ? rooms : Array.from({ length: 18 }, (_, i) => i + 1)),
    [rooms]
  );

  // Past slots (with 20-minute grace period on today's operational window)
  const pastSlots = useMemo(() => {
    const set = new Set<string>();
    for (const slot of timeSlots) {
      if (isSlotPastGracePeriod(slot, date, currentTime, 20)) {
        set.add(slot);
      }
    }
    return set;
  }, [timeSlots, date, currentTime]);

  // Taken slots in the slot grid (therapist busy, on break, or no rooms available)
  const takenSlots = useMemo(() => {
    const taken = new Set<string>();
    const therapistBreaks = therapistId ? therapistBreaksMap.get(therapistId) : undefined;
    for (const slot of timeSlots) {
      const isBreak = therapistBreaks?.has(slot.slice(0, 5));
      const therapistBusy =
        !!therapistId &&
        (isBreak ||
          conflicts.some(
            (c) =>
              c.therapist_id === therapistId &&
              slotsOverlap(slot, duration, c.start_time, c.duration_minutes ?? duration ?? 80)
          ));

      const takenRooms = new Set<number>();
      for (const row of conflicts) {
        if (row.room_number == null) continue;
        const st = (row.status || "").toLowerCase();
        if (st === "cancelled" || st === "no-show") continue;
        if (slotsOverlap(slot, duration, row.start_time, row.duration_minutes ?? duration ?? 80)) {
          takenRooms.add(row.room_number);
        }
      }
      const freeRoomCount = effectiveRooms.filter((r) => !takenRooms.has(r)).length;

      if (therapistBusy || freeRoomCount === 0) {
        taken.add(slot);
      }
    }
    return taken;
  }, [conflicts, therapistId, duration, effectiveRooms, timeSlots, therapistBreaksMap]);

  // Conflicting therapists at current time
  const conflictingTherapists = useMemo(() => {
    const taken = new Set<string>();
    if (!time) return taken;
    const normTime = time.slice(0, 5);
    for (const row of conflicts) {
      if (!row.therapist_id) continue;
      if (slotsOverlap(time, duration, row.start_time, row.duration_minutes ?? duration ?? 80)) {
        taken.add(row.therapist_id);
      }
    }
    therapistBreaksMap.forEach((breakSet, tId) => {
      if (breakSet.has(normTime)) {
        taken.add(tId);
      }
    });
    return taken;
  }, [conflicts, time, duration, therapistBreaksMap]);

  // Free rooms at current time
  const freeRooms = useMemo(() => {
    if (!time) return [];
    const taken = new Set<number>();
    for (const row of conflicts) {
      if (row.room_number == null) continue;
      const st = (row.status || "").toLowerCase();
      if (st === "cancelled" || st === "no-show") continue;
      if (slotsOverlap(time, duration, row.start_time, row.duration_minutes ?? duration ?? 80)) {
        taken.add(row.room_number);
      }
    }
    return effectiveRooms.filter((r) => !taken.has(r));
  }, [conflicts, time, duration, effectiveRooms]);

  // Filter therapists by qualification for the currently selected service
  const qualifiedTherapists = useMemo(() => {
    if (!serviceId) return [];
    if (!servicesLoaded) return therapists;
    let offeringSet = serviceTherapistMap.get(serviceId);
    if ((!offeringSet || offeringSet.size === 0) && selectedService?.name.toLowerCase().includes("scrub")) {
      const scrubOffering = new Set<string>();
      for (const [sId, set] of serviceTherapistMap.entries()) {
        const s = services.find((srv) => srv.id === sId);
        if (
          s?.name.toLowerCase().includes("scrub") ||
          sId === "d5f6ee31-309f-4933-85c5-f2f98f95afba" ||
          sId === "8c97c5db-eaa9-47b9-89c0-9db114000483" ||
          sId === "326e0b78-49cb-441c-aa03-e54453f2f67f"
        ) {
          set.forEach((tId) => scrubOffering.add(tId));
        }
      }
      if (scrubOffering.size > 0) offeringSet = scrubOffering;
    }
    if (!offeringSet) return [];
    return therapists.filter((t) => offeringSet!.has(t.id));
  }, [serviceId, therapists, serviceTherapistMap, servicesLoaded, selectedService, services]);

  // Filter services strictly by therapist qualification if a therapist is selected
  const availableServices = useMemo(() => {
    if (!therapistId) return services;
    if (!servicesLoaded) return services;
    const offered = therapistServicesMap.get(therapistId);
    if (!offered) return [];
    return services.filter((s) => {
      if (offered.has(s.id)) return true;
      if (s.name.toLowerCase().includes("scrub")) {
        return (
          offered.has("d5f6ee31-309f-4933-85c5-f2f98f95afba") ||
          offered.has("8c97c5db-eaa9-47b9-89c0-9db114000483") ||
          offered.has("326e0b78-49cb-441c-aa03-e54453f2f67f")
        );
      }
      return false;
    });
  }, [therapistId, services, servicesLoaded, therapistServicesMap]);

  // Therapists with zero free slots anywhere in the day's slot grid
  const fullyBookedTherapists = useMemo(() => {
    const fullyBooked = new Set<string>();
    if (timeSlots.length === 0) return fullyBooked;
    for (const t of qualifiedTherapists) {
      const tBreaks = therapistBreaksMap.get(t.id);
      const hasFreeSlot = timeSlots.some(
        (slot) =>
          !pastSlots.has(slot) &&
          !tBreaks?.has(slot.slice(0, 5)) &&
          !conflicts.some(
            (c) =>
              c.therapist_id === t.id &&
              slotsOverlap(slot, duration, c.start_time, c.duration_minutes ?? duration ?? 80)
          )
      );
      if (!hasFreeSlot) fullyBooked.add(t.id);
    }
    return fullyBooked;
  }, [qualifiedTherapists, timeSlots, pastSlots, conflicts, duration, therapistBreaksMap]);

  // Effective room number: manual override if still free, otherwise first free room
  const roomNumber = useMemo(() => {
    if (!isMassageService) return null;
    if (manualRoomNumber != null && freeRooms.includes(manualRoomNumber)) {
      return manualRoomNumber;
    }
    return freeRooms[0] ?? null;
  }, [isMassageService, freeRooms, manualRoomNumber]);

  function onServiceChange(nextServiceId: string) {
    setServiceId(nextServiceId);
    const nextService = services.find((s) => s.id === nextServiceId);
    if (nextService?.name === "Wet Area") {
      setPromoId("none");
    }
    const offeringSet = serviceTherapistMap.get(nextServiceId);
    let isStillQualified = !!therapistId && !!offeringSet?.has(therapistId);
    if (!isStillQualified && nextService?.name.toLowerCase().includes("scrub") && therapistId) {
      const offered = therapistServicesMap.get(therapistId);
      if (offered) {
        isStillQualified =
          offered.has("d5f6ee31-309f-4933-85c5-f2f98f95afba") ||
          offered.has("8c97c5db-eaa9-47b9-89c0-9db114000483") ||
          offered.has("326e0b78-49cb-441c-aa03-e54453f2f67f");
      }
    }
    if (!isStillQualified) {
      setTherapistId("");
      setSlotTime("");
      setUseCustomTime(false);
    }
  }

  // Ensure service selection matches therapist qualification; if not, switch service to therapist's first qualified service
  useEffect(() => {
    if (!servicesLoaded || !therapistId) return;
    const offered = therapistServicesMap.get(therapistId);
    if (!offered || offered.size === 0) return;
    const isCurrentServiceQualified =
      offered.has(serviceId) ||
      (selectedService?.name.toLowerCase().includes("scrub") &&
        (offered.has("d5f6ee31-309f-4933-85c5-f2f98f95afba") ||
          offered.has("8c97c5db-eaa9-47b9-89c0-9db114000483") ||
          offered.has("326e0b78-49cb-441c-aa03-e54453f2f67f")));
    if (!serviceId || !isCurrentServiceQualified) {
      const qualifiedService = services.find((s) => offered.has(s.id));
      if (qualifiedService) {
        setServiceId(qualifiedService.id);
      }
    }
  }, [servicesLoaded, therapistId, serviceId, therapistServicesMap, services, selectedService]);

  function onCustomTimeToggle(checked: boolean) {
    setUseCustomTime(checked);
    if (checked) {
      setSlotTime("");
    }
    setError(null);
  }

  const hasClientSlotConflict = useMemo(() => {
    if (!time) return false;
    if (!isWalkIn && clientSelectValue) {
      return clientBookings.some(
        (b) => b.client_id === clientSelectValue && b.start_time === time
      );
    }
    if (isWalkIn && walkinName.trim()) {
      const q = walkinName.trim().toLowerCase();
      return clientBookings.some(
        (b) =>
          !b.client_id &&
          b.guest_label &&
          b.guest_label.trim().toLowerCase() === q &&
          b.start_time === time
      );
    }
    return false;
  }, [time, isWalkIn, clientSelectValue, walkinName, clientBookings]);

  const isTherapistQualified = useMemo(() => {
    if (!serviceId || !therapistId) return false;
    if (!servicesLoaded) return true;
    return qualifiedTherapists.some((t) => t.id === therapistId);
  }, [serviceId, therapistId, servicesLoaded, qualifiedTherapists]);

  const therapistOk =
    !!therapistId &&
    !conflictingTherapists.has(therapistId) &&
    !unavailableTherapists.has(therapistId) &&
    isTherapistQualified;
  const selectedTherapist = therapists.find((t) => t.id === therapistId);

  const isPastSlot = isMassageService && !useCustomTime && !!slotTime && pastSlots.has(slotTime);
  const isBookedSlot = isMassageService && !useCustomTime && !!slotTime && takenSlots.has(slotTime);
  const isPastCustomTime =
    isMassageService && useCustomTime && !!customTime && isSlotPastGracePeriod(customTime, date, currentTime, 20);

  const isRedeeming = promoId === "redeem_100_pts";
  const selectedPromo = promos.find((p) => p.id === promoId);
  const basePrice = selectedService?.price ?? 0;
  const estimatedTotalPrice = isRedeeming
    ? Math.max(0, basePrice - combiCredit)
    : selectedPromo
    ? Math.max(basePrice - selectedPromo.discount, 0)
    : basePrice;

  const estPointsDelta = useMemo(() => {
    if (isWalkIn) return null;
    if (selectedClient && !selectedClient.has_portal_account) return 0;
    if (isRedeeming) return -100;
    if (!isMassageService) return WET_AREA_POINTS;
    if (!selectedService) return 0;
    return computeLoyaltyPoints(
      loyaltySettings.mode,
      estimatedTotalPrice,
      selectedService.price,
      selectedService.points_earned,
      loyaltySettings.pesoPerPoint
    );
  }, [
    isWalkIn,
    selectedClient,
    isRedeeming,
    isMassageService,
    selectedService,
    loyaltySettings,
    estimatedTotalPrice,
  ]);

  const canSubmit =
    !isPending &&
    !isPastDate &&
    !hasClientSlotConflict &&
    !isPastSlot &&
    !isBookedSlot &&
    !isPastCustomTime &&
    (isWalkIn ? walkinName.trim().length > 0 : !!clientSelectValue) &&
    !!serviceId &&
    !!staffId &&
    (!isMassageService ||
      (!!therapistId &&
        therapistOk &&
        !!time &&
        roomNumber != null &&
        freeRooms.includes(roomNumber)));

  function handleClose() {
    if (isPending) return;
    setStep("form");
    setError(null);
    onClose();
  }

  function handleProceedToReview() {
    if (isPending) return;
    setError(null);
    if (isPastDate) {
      setError("Cannot book a date in the past.");
      return;
    }
    if (isWalkIn && !walkinName.trim()) {
      setError("Please enter client name for walk-in.");
      return;
    }
    if (!isWalkIn && !clientSelectValue) {
      setError("Please select a client.");
      return;
    }
    if (!serviceId) {
      setError("Please select a service.");
      return;
    }
    if (isMassageService && !useCustomTime && slotTime && pastSlots.has(slotTime)) {
      setError("The selected time slot has already passed. Please select an available slot.");
      return;
    }
    if (isMassageService && !useCustomTime && slotTime && takenSlots.has(slotTime)) {
      setError("The selected time slot is already booked for this therapist.");
      return;
    }
    if (isMassageService && useCustomTime && customTime && isPastCustomTime) {
      setError("The selected custom time has already passed.");
      return;
    }
    if (hasClientSlotConflict) {
      setError(`This client already has a booking at ${fmtTime(time)}. Please select a different time.`);
      return;
    }
    if (isMassageService && !time) {
      setError("Please select an available time slot, or use a custom time.");
      return;
    }
    if (isMassageService && therapistId && unavailableTherapists.has(therapistId)) {
      setError(`That therapist is ${unavailableTherapists.get(therapistId)} on the selected date.`);
      return;
    }
    if (isMassageService && (!therapistId || !therapistOk)) {
      setError("Please select a therapist who is available at this time.");
      return;
    }
    if (isMassageService && (roomNumber == null || !freeRooms.includes(roomNumber))) {
      setError("Please select an available room.");
      return;
    }
    if (!staffId) {
      setError("Staff session is required to create a booking.");
      return;
    }

    const isRedeeming = promoId === "redeem_100_pts";
    const selectedPromo = promos.find((p) => p.id === promoId);
    if (selectedPromo && !isRedeeming && promoId !== "none") {
      const derivedPax =
        selectedPromo?.min_pax && selectedPromo.min_pax > 1
          ? selectedPromo.min_pax
          : selectedPromo?.label.includes("3")
          ? 3
          : selectedPromo?.label.includes("4")
          ? 4
          : 1;
      const eligibility = validatePromoEligibility(selectedPromo, {
        bookingDate: date,
        slotTime: isMassageService ? time : roundedNowTime(),
        paxCount: derivedPax,
      });
      if (!eligibility.eligible) {
        setError(eligibility.reason);
        return;
      }
    }

    setStep("review");
  }

  function handleSubmit() {
    if (isPending) return;
    setError(null);
    if (isPastDate) {
      setError("Cannot book a date in the past.");
      return;
    }
    if (isMassageService && !useCustomTime && slotTime && pastSlots.has(slotTime)) {
      setError("The selected time slot has already passed. Please select an available slot.");
      return;
    }
    if (isMassageService && !useCustomTime && slotTime && takenSlots.has(slotTime)) {
      setError("The selected time slot is already booked for this therapist.");
      return;
    }
    if (isMassageService && useCustomTime && customTime && isPastCustomTime) {
      setError("The selected custom time has already passed.");
      return;
    }
    if (hasClientSlotConflict) {
      setError(`This client already has a booking at ${fmtTime(time)}. Please select a different time.`);
      return;
    }
    if (isMassageService && !time) {
      setError("Please select an available time slot, or use a custom time.");
      return;
    }
    if (isMassageService && therapistId && unavailableTherapists.has(therapistId)) {
      setError(`That therapist is ${unavailableTherapists.get(therapistId)} on the selected date.`);
      return;
    }
    if (isMassageService && (!therapistId || !therapistOk)) {
      setError("Please select a therapist who is available at this time.");
      return;
    }
    if (isMassageService && (roomNumber == null || !freeRooms.includes(roomNumber))) {
      setError("Please select an available room.");
      return;
    }

    startTransition(async () => {
      try {
        const isRedeeming = promoId === "redeem_100_pts";
        const selectedPromo = promos.find((p) => p.id === promoId);
        const effectivePromoId = isRedeeming || promoId === "none" ? null : promoId;
        const derivedPax =
          selectedPromo?.min_pax && selectedPromo.min_pax > 1
            ? selectedPromo.min_pax
            : selectedPromo?.label.includes("3")
            ? 3
            : selectedPromo?.label.includes("4")
            ? 4
            : null;

        if (selectedPromo && !isRedeeming && promoId !== "none") {
          const eligibility = validatePromoEligibility(selectedPromo, {
            bookingDate: date,
            slotTime: isMassageService ? time : roundedNowTime(),
            paxCount: derivedPax ?? 1,
          });
          if (!eligibility.eligible) {
            setError(eligibility.reason);
            return;
          }
        }

        const result = await createBooking({
          clientId: isWalkIn ? null : clientSelectValue,
          guestLabel: isWalkIn ? walkinName.trim() : null,
          serviceId,
          therapistId: isMassageService ? therapistId : null,
          roomNumber: isMassageService ? roomNumber : null,
          bookingDate: date,
          startTime: isMassageService ? time : roundedNowTime(),
          status: "Booked",
          paxCount: derivedPax,
          promoId: effectivePromoId,
          createdBy: staffId,
          notes: notes.trim() || undefined,
        });

        if (!result.ok) {
          setError(result.error);
          showBookingToast({
            title: "Booking Failed",
            description: result.error,
          });
          return;
        }

        const resolvedClientName = isWalkIn
          ? walkinName.trim() || "Guest"
          : selectedClient?.codename ?? "Client";
        const formattedSlot = time ? fmtTime(time) : "";
        const dateSlotText = [date, formattedSlot].filter(Boolean).join(", ");
        const resolvedServiceName = selectedService?.name ?? "Service";
        const resolvedTherapistName =
          isMassageService && therapistId
            ? therapists.find((t) => t.id === therapistId)?.name ?? null
            : null;
        const serviceTherapistText = `${resolvedServiceName}${resolvedTherapistName ? ` (${resolvedTherapistName})` : ""}`;

        const toastSubtitle = [resolvedClientName, dateSlotText, serviceTherapistText]
          .filter(Boolean)
          .join(" • ");

        const successToastData = {
          title: "Booking created successfully!",
          description: toastSubtitle,
        };

        const basePrice = selectedService?.price ?? 0;
        const servicePrice = isRedeeming
          ? Math.max(0, basePrice - combiCredit)
          : selectedPromo
          ? Math.max(basePrice - selectedPromo.discount, 0)
          : basePrice;
        const serviceName = selectedService?.name ?? "Service";
        const formattedBookingDate = formatSmsDate(date);
        const resolvedRoomNumber = isMassageService && roomNumber ? roomNumber : null;

        showBookingToast(successToastData);
        const interpolated = interpolateSmsTemplate(activeSmsTemplate, {
          booking_date: formattedBookingDate,
          client_name: resolvedClientName,
          slot_time: formattedSlot || time,
          therapist_name: resolvedTherapistName ?? "—",
          service_name: serviceName,
          amount: servicePrice,
          room_number: resolvedRoomNumber,
        });

        setStep("form");
        onCreated({
          clientName: resolvedClientName,
          phone: selectedClient?.phone ?? null,
          timeSlot: formattedSlot || time,
          date: formattedBookingDate,
          service: serviceName,
          price: servicePrice,
          therapistName: resolvedTherapistName,
          roomNumber: resolvedRoomNumber,
          message: interpolated,
        });
      } catch (err: any) {
        const errorMsg = err?.message || "An unexpected error occurred while creating booking.";
        setError(errorMsg);
        showBookingToast({
          title: "Booking Failed",
          description: errorMsg,
        });
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
        {step === "form" ? (
          <>
            <h2 className="text-base font-semibold text-foreground">New Booking</h2>
            <p className="mt-0.5 text-xs text-muted">
              Room assigns automatically — override manually if needed.
            </p>

        <div className="mt-5 space-y-4">
          {/* Client Select (Searchable Combobox) */}
          <div>
            <label className="text-xs text-muted" htmlFor="bClient">
              Client
            </label>
            <ClientCombobox
              id="bClient"
              clients={clients}
              value={clientSelectValue}
              onChange={(val) => {
                setClientSelectValue(val);
                setError(null);
              }}
            />
          </div>

          {/* Walk-in Name field */}
          {isWalkIn && (
            <div id="bWalkinNameField">
              <label className="text-xs text-muted" htmlFor="bWalkinName">
                Client Name <span className="opacity-70">(walk-in / no account)</span>
              </label>
              <input
                id="bWalkinName"
                type="text"
                placeholder="e.g. Guest of Ohm"
                value={walkinName}
                onChange={(e) => setWalkinName(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
              />
            </div>
          )}

          {/* Service & Therapist */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted" htmlFor="bService">
                Service
              </label>
              <select
                id="bService"
                value={serviceId}
                onChange={(e) => onServiceChange(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
              >
                {availableServices.length === 0 ? (
                  <option value="">— no services available —</option>
                ) : (
                  availableServices.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))
                )}
              </select>
            </div>
            {isMassageService && (
              <div id="bTherapistField">
                <label className="text-xs text-muted" htmlFor="bTherapist">
                  Therapist
                </label>
                <select
                  id="bTherapist"
                  value={therapistId}
                  disabled={!serviceId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setTherapistId(nextId);
                    if (!nextId) {
                      setSlotTime("");
                      setUseCustomTime(false);
                    } else {
                      const offered = therapistServicesMap.get(nextId);
                      if (offered && !offered.has(serviceId)) {
                        const firstQualified = services.find((s) => offered.has(s.id));
                        if (firstQualified) {
                          setServiceId(firstQualified.id);
                        }
                      }
                    }
                  }}
                  className={`mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none ${
                    !serviceId ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                >
                  <option value="">
                    {!serviceId ? "— select service first —" : "— select —"}
                  </option>
                  {qualifiedTherapists.map((t) => {
                    const unavailableReason = unavailableTherapists.get(t.id);
                    const fullyBooked = fullyBookedTherapists.has(t.id);
                    const conflictNow = conflictingTherapists.has(t.id);
                    const isOnBreakNow = !!time && !!therapistBreaksMap.get(t.id)?.has(time.slice(0, 5));
                    const disabled = !!unavailableReason || fullyBooked || conflictNow;
                    return (
                      <option
                        key={t.id}
                        value={t.id}
                        disabled={disabled}
                        className={disabled ? "text-muted" : undefined}
                      >
                        {t.name}
                        {unavailableReason
                          ? ` — ${unavailableReason}`
                          : isOnBreakNow
                          ? " (on break)"
                          : fullyBooked
                          ? " — Fully Booked"
                          : conflictNow
                          ? " (booked)"
                          : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="text-xs text-muted" htmlFor="bDate">
              Date
            </label>
            <input
              id="bDate"
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setError(null);
              }}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
            />
            {isPastDate && (
              <p className="mt-1 text-xs text-red-400" id="pastDateError">
                Cannot book a date in the past.
              </p>
            )}
          </div>

          {/* Time Slot Grid */}
          {isMassageService && (
            <div id="bSlotField">
              <label className="text-xs text-muted">Time Slot</label>
              {timeSlots.length === 0 && (
                <p className="mt-1.5 text-xs text-muted">
                  No time slots configured yet. Add some in Settings.
                </p>
              )}
              <div className="mt-1.5 grid grid-cols-3 sm:grid-cols-4 gap-2" id="slotGrid">
                {timeSlots.map((s) => {
                  const isBreak = isTherapistSelected && !!therapistBreaksMap.get(therapistId)?.has(s.slice(0, 5));
                  const isBooked = isTherapistSelected && (takenSlots.has(s) || isBreak);
                  const isPast = pastSlots.has(s);
                  const selected = slotTime === s && !useCustomTime;
                  const disabled = !isTherapistSelected || isPast || isBooked || useCustomTime;
                  return (
                    <button
                      key={s}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setSlotTime(s);
                        setManualRoomNumber(null);
                        setError(null);
                      }}
                      className={`min-h-[44px] sm:min-h-[38px] rounded-md border px-2 py-1 font-mono text-xs transition-all flex flex-col items-center justify-center ${
                        !isTherapistSelected
                          ? isPast
                            ? "border-border/40 bg-background/50 text-foreground/30 opacity-25 cursor-not-allowed"
                            : "border-border bg-background text-foreground/40 opacity-40 cursor-not-allowed"
                          : isPast
                          ? "border-border/40 bg-background/50 text-foreground/30 opacity-25 cursor-not-allowed"
                          : isBreak
                          ? "border-amber-500/30 bg-amber-500/10 text-amber-400 line-through opacity-70 cursor-not-allowed"
                          : isBooked
                          ? "border-dashed border-red-500/30 bg-red-950/10 text-red-400/60 line-through opacity-60 cursor-not-allowed"
                          : selected
                          ? "border-gold bg-gradient-to-br from-[#c89b3c] to-[#a97e2e] text-black font-bold shadow-sm"
                          : "border-border bg-background text-foreground hover:border-gold/50 cursor-pointer"
                      }`}
                    >
                      <span className={isBooked ? "line-through" : undefined}>{fmtTime(s)}</span>
                      {isBreak ? (
                        <span className="text-[9px] no-underline font-sans text-amber-400 leading-none mt-0.5">
                          Break
                        </span>
                      ) : isBooked ? (
                        <span className="text-[9px] no-underline font-sans text-red-400/80 leading-none mt-0.5">
                          Booked
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {!isTherapistSelected ? (
                <p className="mt-1.5 text-xs text-muted">
                  Select a therapist first to see available slots
                </p>
              ) : (
                <p className="mt-1.5 text-[11px] text-muted">
                  Struck-through slots are already booked or on break. Past slots are disabled.
                </p>
              )}
            </div>
          )}

          {/* Custom Time Toggle */}
          {isMassageService && (
            <div id="bCustomTimeField">
              <label
                className={`flex items-center gap-2 text-sm text-foreground ${
                  !isTherapistSelected ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
                }`}
              >
                <input
                  type="checkbox"
                  id="bCustomTimeToggle"
                  checked={useCustomTime}
                  disabled={!isTherapistSelected}
                  onChange={(e) => onCustomTimeToggle(e.target.checked)}
                  className={`accent-gold ${!isTherapistSelected ? "cursor-not-allowed" : ""}`}
                />
                Use a custom time instead
              </label>
              {useCustomTime && isTherapistSelected && (
                <div id="customTimeSub" className="mt-2 space-y-1.5">
                  <input
                    type="time"
                    id="bTimeFlex"
                    step={1800}
                    value={customTime}
                    onChange={(e) => {
                      setCustomTime(e.target.value);
                      setError(null);
                    }}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
                  />
                  <p className="text-xs text-muted" id="weekdayAvailText">
                    {selectedTherapist?.name ?? "(select a therapist)"}:{" "}
                    <span className={therapistOk ? "text-emerald-400 font-semibold" : "text-red-400 font-semibold"}>
                      {therapistId ? (therapistOk ? "available" : "not available") : "—"}
                    </span>
                    {" · "}Rooms free:{" "}
                    <span className={freeRooms.length > 0 ? "text-emerald-400 font-semibold" : "text-red-400 font-semibold"}>
                      {freeRooms.length} of {effectiveRooms.length}
                    </span>
                  </p>
                </div>
              )}
            </div>
          )}

          {hasClientSlotConflict && time && (
            <p className="rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300 font-medium">
              ⚠ This client already has a booking at {fmtTime(time)}. Please select a different time.
            </p>
          )}

          {/* Room */}
          {isMassageService && (
            <div id="roomField">
              <label className="text-xs text-muted" htmlFor="bRoom">
                Room
              </label>
              <select
                id="bRoom"
                value={roomNumber ?? ""}
                onChange={(e) => {
                  setManualRoomNumber(e.target.value ? Number(e.target.value) : null);
                  setError(null);
                }}
                disabled={!time}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none disabled:opacity-50"
              >
                {!time ? (
                  <option value="">— pick a time first —</option>
                ) : (
                  <>
                    <option value="">— select room —</option>
                    {effectiveRooms.map((r) => {
                      const isFree = freeRooms.includes(r);
                      return (
                        <option
                          key={r}
                          value={r}
                          disabled={!isFree}
                          className={!isFree ? "text-muted" : undefined}
                        >
                          Room {r}{!isFree ? " - Occupied" : ""}
                        </option>
                      );
                    })}
                  </>
                )}
              </select>
            </div>
          )}

          {/* Promo */}
          {isMassageService && (
            <div id="bPromoField">
              <label className="text-xs text-muted" htmlFor="bPromo">
                Promo
              </label>
              <select
                id="bPromo"
                value={promoId}
                onChange={(e) => {
                  setPromoId(e.target.value);
                  setError(null);
                }}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
              >
                <option value="none">No Promo</option>
                {canRedeemLoyalty && (
                  <option value="redeem_100_pts" className="text-gold font-medium">
                    {(selectedService?.price ?? 0) <= combiCredit
                      ? "Loyalty Reward: Redeem 100 pts (Free Service / Fully Covered)"
                      : `Loyalty Reward: Redeem 100 pts (+₱${(selectedService?.price ?? 0) - combiCredit} Upgrade Fee)`}
                  </option>
                )}
                {!canRedeemLoyalty && !isWalkIn && !!clientSelectValue && (
                  <option value="redeem_disabled" disabled className="text-muted">
                    Loyalty Reward: Redeem 100 pts (Requires 100 pts • Current: {clientPointsBalance ?? 0} pts)
                  </option>
                )}
                {promos.map((p) => {
                  const check = validatePromoEligibility(p, {
                    bookingDate: date,
                    slotTime: time,
                    paxCount: p.min_pax ?? 1,
                  });
                  return (
                    <option
                      key={p.id}
                      value={p.id}
                      disabled={!check.eligible}
                      className={!check.eligible ? "text-muted" : undefined}
                    >
                      {p.label} (−₱{p.discount}){!check.eligible ? ` — (${check.reason})` : ""}
                    </option>
                  );
                })}
              </select>
              {promoId === "redeem_100_pts" && (
                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-gold font-medium">
                  <span>🏅</span>
                  <span>
                    100 pts applied (-₱{combiCredit} credit). Upgrade fee: ₱{Math.max(0, (selectedService?.price ?? 0) - combiCredit)}
                  </span>
                </div>
              )}
              {promoId !== "none" && promoId !== "redeem_100_pts" && (() => {
                const currentPromo = promos.find((p) => p.id === promoId);
                if (!currentPromo) return null;
                const check = validatePromoEligibility(currentPromo, {
                  bookingDate: date,
                  slotTime: time,
                  paxCount: currentPromo.min_pax ?? 1,
                });
                if (!check.eligible) {
                  return (
                    <div className="mt-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-300 font-medium">
                      ⚠ {check.reason}
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}

          {/* Notes / Vehicle Info */}
          <div>
            <label className="text-xs text-muted" htmlFor="bNotes">
              Notes / Vehicle Info <span className="opacity-70">(optional)</span>
            </label>
            <input
              id="bNotes"
              type="text"
              placeholder="e.g. Vios ABC-123 blocking slot 2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-stone-500 focus:border-gold outline-none"
            />
          </div>

          {/* Error Message */}
          {error && (
            <p
              id="bookingError"
              ref={errorRef}
              className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm sm:text-xs text-red-300"
            >
              {error}
            </p>
          )}
        </div>

        {/* Modal Actions */}
        <div className="sticky bottom-0 sm:static mt-6 -mx-4 sm:mx-0 -mb-4 sm:mb-0 flex gap-3 bg-surface px-4 sm:px-0 py-4 sm:py-0">
          <button
            type="button"
            onClick={handleClose}
            disabled={isPending}
            className="flex-1 rounded-md border border-border px-4 py-2.5 text-sm text-foreground hover:border-gold/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleProceedToReview}
            disabled={!canSubmit || isPending}
            className="flex-[1.4] rounded-md border border-gold bg-gold px-4 py-2.5 text-sm font-semibold text-black hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Review Booking →
          </button>
        </div>
      </>
    ) : (
      <>
        <h2 className="text-base font-semibold text-foreground">Confirm Booking Details</h2>
        <p className="mt-0.5 text-xs text-muted">
          Review the booking receipt before saving.
        </p>

        <div className="mt-5 space-y-4">
          {/* Dedicated Receipt Preview Card */}
          <div className="rounded-lg border border-[#292524] bg-[#0c0a09] p-4 sm:p-5 space-y-3.5 font-sans text-xs">
            <div className="flex items-center justify-end border-b border-[#292524] pb-3">
              <span className="rounded-md bg-gold/10 px-2.5 py-0.5 text-[10px] font-medium text-accent-gold ring-1 ring-inset ring-gold/20">
                Receipt Preview
              </span>
            </div>

            {/* Client Name */}
            <div className="flex items-start justify-between border-b border-[#292524] pb-3">
              <span className="text-muted text-[11px]">Client Name</span>
              <div className="text-right">
                <div className="font-bold text-accent-gold text-sm">
                  {!isWalkIn && selectedClient
                    ? selectedClient.codename
                    : walkinName.trim() || "Walk-in Guest"}
                </div>
                {!isWalkIn && selectedClient?.username && (
                  <div className="text-[11px] text-muted font-normal">
                    @{selectedClient.username}
                  </div>
                )}
                {!isWalkIn && selectedClient?.phone && (
                  <div className="text-[11px] text-muted/80 font-mono">
                    {selectedClient.phone}
                  </div>
                )}
              </div>
            </div>

            {/* Schedule */}
            <div className="flex items-center justify-between border-b border-[#292524] pb-3">
              <span className="text-muted text-[11px]">Schedule</span>
              <span className="font-medium text-foreground text-xs sm:text-sm">
                {fmtDate(date)} · {time ? fmtTime(time) : "—"}
              </span>
            </div>

            {/* Therapist */}
            <div className="flex items-center justify-between border-b border-[#292524] pb-3">
              <span className="text-muted text-[11px]">Therapist</span>
              <span className="font-medium text-gold text-xs sm:text-sm">
                {isMassageService ? (selectedTherapist?.name ?? "—") : "None / Wet Area"}
              </span>
            </div>

            {/* Assignment */}
            <div className="flex items-center justify-between border-b border-[#292524] pb-3">
              <span className="text-muted text-[11px]">Assignment</span>
              <div className="text-right">
                <div className="font-semibold text-accent-gold text-xs sm:text-sm">
                  {isMassageService ? (roomNumber != null ? `Room ${roomNumber}` : "—") : "None / Wet Area"}
                </div>
                <div className="text-[11px] text-muted">
                  {selectedService ? selectedService.name : "—"}
                </div>
              </div>
            </div>

            {/* Financial Breakdown */}
            <div className="space-y-2 border-b border-[#292524] pb-3">
              <span className="text-muted block text-[11px] mb-1">Pricing Breakdown</span>
              <div className="flex items-center justify-between text-muted text-xs">
                <span>Base Service Price</span>
                <span className="font-mono text-foreground">
                  ₱{basePrice.toLocaleString()}
                </span>
              </div>

              {isRedeeming && (
                <div className="flex items-center justify-between text-amber-400 text-xs">
                  <span>Loyalty Credit (100 pts)</span>
                  <span className="font-mono">
                    -₱{Math.min(basePrice, combiCredit).toLocaleString()}
                  </span>
                </div>
              )}

              {selectedPromo && !isRedeeming && (
                <div className="flex items-center justify-between text-emerald-400 text-xs">
                  <span>Promo Discount ({selectedPromo.label})</span>
                  <span className="font-mono">
                    -₱{Math.min(basePrice, selectedPromo.discount).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {/* Total Amount Due & Reward Points Presentation */}
            <div className="rounded-lg bg-background/60 border border-[#292524] p-3.5 space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted">
                  TOTAL AMOUNT DUE
                </span>
                <span className="font-mono text-2xl sm:text-3xl font-bold text-amber-400">
                  ₱{estimatedTotalPrice.toLocaleString()}
                </span>
              </div>

              <div className="flex items-center justify-end pt-1">
                {isWalkIn ? (
                  <span className="text-[11px] text-muted italic">Walk-in (no points earned)</span>
                ) : selectedClient && !selectedClient.has_portal_account ? (
                  <span className="text-[11px] text-amber-400/80">0 pts (No portal account)</span>
                ) : isRedeeming ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300">
                    <span>⭐</span> -100 pts redeemed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300">
                    <span>⭐</span> +{estPointsDelta ?? 0} pts to earn
                  </span>
                )}
              </div>
            </div>

            {/* Notes / Vehicle Info */}
            {notes.trim() && (
              <div className="border-b border-[#292524] pb-3">
                <span className="text-muted block text-[11px] mb-1">Notes / Vehicle Info</span>
                <p className="text-foreground text-xs italic bg-background/50 rounded p-2.5 border border-border/50">
                  {notes.trim()}
                </p>
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <p
              id="bookingError"
              ref={errorRef}
              className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm sm:text-xs text-red-300"
            >
              {error}
            </p>
          )}
        </div>

        {/* Modal Actions */}
        <div className="sticky bottom-0 sm:static mt-6 -mx-4 sm:mx-0 -mb-4 sm:mb-0 flex gap-3 bg-surface px-4 sm:px-0 py-4 sm:py-0">
          <button
            type="button"
            onClick={() => {
              if (isPending) return;
              setError(null);
              setStep("form");
            }}
            disabled={isPending}
            className="flex-1 rounded-md border border-border px-4 py-2.5 text-sm text-foreground hover:border-gold/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ← Back / Edit
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="flex-[1.4] flex items-center justify-center gap-2 rounded-md border border-gold bg-gold px-4 py-2.5 text-sm font-semibold text-black hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-black"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Saving…
              </>
            ) : (
              "Confirm & Save Booking"
            )}
          </button>
        </div>
      </>
    )}
      </div>
    </div>
  );
}
