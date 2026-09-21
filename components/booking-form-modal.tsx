"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { createBooking } from "@/app/(staff)/bookings/actions";
import { useStaffSim } from "@/lib/staff-context";
import { slotsOverlap, isSlotPastGracePeriod } from "@/lib/bookings/slots";
import { spaDayNow } from "@/lib/analytics/spa-day";
import { SmsPreviewModal } from "@/components/sms-preview-modal";
import { ClientCombobox } from "@/components/client-combobox";
import { DEFAULT_SMS_TEMPLATE, interpolateSmsTemplate, formatSmsDate } from "@/lib/bookings/sms";
import type { Client, Promo, Service, Staff, Therapist } from "@/components/booking-browser";
import type { Database } from "@/lib/types/database";

type ConflictRow = {
  therapist_id: string | null;
  room_number: number | null;
  start_time: string;
  duration_minutes: number | null;
};

const ACTIVE_STATUSES: Database["public"]["Enums"]["booking_status"][] = [
  "Booked",
  "Completed",
  "Needs Reassignment",
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
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
    "fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-1 rounded-xl border border-gold bg-surface-2 px-5 py-3 shadow-2xl transition-all duration-300 pointer-events-auto max-w-lg text-center animate-fade-in cursor-pointer";

  const titleEl = document.createElement("div");
  titleEl.className = "text-xs font-semibold font-mono text-accent-gold uppercase tracking-wider";
  titleEl.textContent = title;

  const descEl = document.createElement("div");
  descEl.className = "text-xs font-sans text-foreground/90 font-medium";
  descEl.textContent = description;

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
  defaultDate: string;
  initialTherapistId?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
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
      .select("id, label, discount")
      .eq("active", true)
      .then(({ data }) => {
        if (data) setPromos(data);
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
  const [serviceTherapistMap, setServiceTherapistMap] = useState<Map<string, Set<string>>>(new Map());
  const [therapistServicesMap, setTherapistServicesMap] = useState<Map<string, Set<string>>>(new Map());
  const [servicesLoaded, setServicesLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSmsTemplate, setActiveSmsTemplate] = useState<string>(DEFAULT_SMS_TEMPLATE);
  const [showSmsPreview, setShowSmsPreview] = useState(false);
  const [smsBooking, setSmsBooking] = useState<{
    codename: string;
    price: number;
    serviceName: string;
    date: string;
    startTime: string;
    therapistName?: string | null;
    roomNumber?: number | string | null;
    message?: string;
  } | null>(null);
  const [pendingSuccessToast, setPendingSuccessToast] = useState<{
    title: string;
    description: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const errorRef = useRef<HTMLParagraphElement>(null);

  const [clientBookings, setClientBookings] = useState<
    Array<{ client_id: string | null; guest_label: string | null; start_time: string }>
  >([]);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("app_settings")
      .select("sms_confirmation_template")
      .eq("id", true)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (!err && data?.sms_confirmation_template) {
          setActiveSmsTemplate(data.sms_confirmation_template);
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
    ]).then(([dayOff, absence, leave, servicesOffered]) => {
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

      const stMap = new Map<string, Set<string>>();
      const tsMap = new Map<string, Set<string>>();
      for (const row of servicesOffered.data ?? []) {
        if (!stMap.has(row.service_id)) {
          stMap.set(row.service_id, new Set());
        }
        stMap.get(row.service_id)!.add(row.therapist_id);

        if (!tsMap.has(row.therapist_id)) {
          tsMap.set(row.therapist_id, new Set());
        }
        tsMap.get(row.therapist_id)!.add(row.service_id);
      }
      setServiceTherapistMap(stMap);
      setTherapistServicesMap(tsMap);
      setServicesLoaded(true);
    });
  }, [date]);

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

  // Taken slots in the slot grid (therapist busy or no rooms available)
  const takenSlots = useMemo(() => {
    const taken = new Set<string>();
    for (const slot of timeSlots) {
      const therapistBusy =
        !!therapistId &&
        conflicts.some(
          (c) =>
            c.therapist_id === therapistId &&
            slotsOverlap(slot, duration, c.start_time, c.duration_minutes ?? duration ?? 60)
        );

      const takenRooms = new Set<number>();
      for (const row of conflicts) {
        if (row.room_number == null) continue;
        if (slotsOverlap(slot, duration, row.start_time, row.duration_minutes ?? duration ?? 60)) {
          takenRooms.add(row.room_number);
        }
      }
      const freeRoomCount = effectiveRooms.filter((r) => !takenRooms.has(r)).length;

      if (therapistBusy || freeRoomCount === 0) {
        taken.add(slot);
      }
    }
    return taken;
  }, [conflicts, therapistId, duration, effectiveRooms, timeSlots]);

  // Conflicting therapists at current time
  const conflictingTherapists = useMemo(() => {
    const taken = new Set<string>();
    if (!time) return taken;
    for (const row of conflicts) {
      if (!row.therapist_id) continue;
      if (slotsOverlap(time, duration, row.start_time, row.duration_minutes ?? duration ?? 60)) {
        taken.add(row.therapist_id);
      }
    }
    return taken;
  }, [conflicts, time, duration]);

  // Free rooms at current time
  const freeRooms = useMemo(() => {
    if (!time) return [];
    const taken = new Set<number>();
    for (const row of conflicts) {
      if (row.room_number == null) continue;
      if (slotsOverlap(time, duration, row.start_time, row.duration_minutes ?? duration ?? 60)) {
        taken.add(row.room_number);
      }
    }
    return effectiveRooms.filter((r) => !taken.has(r));
  }, [conflicts, time, duration, effectiveRooms]);

  // Filter therapists by qualification for the currently selected service
  const qualifiedTherapists = useMemo(() => {
    if (!serviceId) return [];
    if (!servicesLoaded) return therapists;
    const offeringSet = serviceTherapistMap.get(serviceId);
    if (!offeringSet) return [];
    return therapists.filter((t) => offeringSet.has(t.id));
  }, [serviceId, therapists, serviceTherapistMap, servicesLoaded]);

  // Filter services strictly by therapist qualification if a therapist is selected
  const availableServices = useMemo(() => {
    if (!therapistId) return services;
    if (!servicesLoaded) return services;
    const offered = therapistServicesMap.get(therapistId);
    if (!offered) return [];
    return services.filter((s) => offered.has(s.id));
  }, [therapistId, services, servicesLoaded, therapistServicesMap]);

  // Therapists with zero free slots anywhere in the day's slot grid
  const fullyBookedTherapists = useMemo(() => {
    const fullyBooked = new Set<string>();
    if (timeSlots.length === 0) return fullyBooked;
    for (const t of qualifiedTherapists) {
      const hasFreeSlot = timeSlots.some(
        (slot) =>
          !pastSlots.has(slot) &&
          !conflicts.some(
            (c) =>
              c.therapist_id === t.id &&
              slotsOverlap(slot, duration, c.start_time, c.duration_minutes ?? duration ?? 60)
          )
      );
      if (!hasFreeSlot) fullyBooked.add(t.id);
    }
    return fullyBooked;
  }, [qualifiedTherapists, timeSlots, pastSlots, conflicts, duration]);

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
    const isStillQualified = !!therapistId && !!offeringSet?.has(therapistId);
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
    if (!serviceId || !offered.has(serviceId)) {
      const qualifiedService = services.find((s) => offered.has(s.id));
      if (qualifiedService) {
        setServiceId(qualifiedService.id);
      }
    }
  }, [servicesLoaded, therapistId, serviceId, therapistServicesMap, services]);

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

  const therapistOk =
    !!therapistId &&
    !conflictingTherapists.has(therapistId) &&
    !unavailableTherapists.has(therapistId) &&
    (!servicesLoaded || !!serviceTherapistMap.get(serviceId)?.has(therapistId));
  const selectedTherapist = therapists.find((t) => t.id === therapistId);

  const isPastSlot = isMassageService && !useCustomTime && !!slotTime && pastSlots.has(slotTime);
  const isBookedSlot = isMassageService && !useCustomTime && !!slotTime && takenSlots.has(slotTime);
  const isPastCustomTime =
    isMassageService && useCustomTime && !!customTime && isSlotPastGracePeriod(customTime, date, currentTime, 20);

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

  function handleSubmit() {
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
      const isRedeeming = promoId === "redeem_100_pts";
      const selectedPromo = promos.find((p) => p.id === promoId);
      const effectivePromoId = isRedeeming || promoId === "none" ? null : promoId;
      const derivedPax = selectedPromo?.label.includes("3") ? 3 : selectedPromo?.label.includes("4") ? 4 : null;

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

      setPendingSuccessToast(successToastData);
      const interpolated = interpolateSmsTemplate(activeSmsTemplate, {
        booking_date: formattedBookingDate,
        client_name: resolvedClientName,
        slot_time: formattedSlot || time,
        therapist_name: resolvedTherapistName ?? "—",
        service_name: serviceName,
        amount: servicePrice,
        room_number: resolvedRoomNumber,
      });

      setSmsBooking({
        codename: resolvedClientName,
        price: servicePrice,
        serviceName: serviceName,
        date: formattedBookingDate,
        startTime: formattedSlot || time,
        therapistName: resolvedTherapistName,
        roomNumber: resolvedRoomNumber,
        message: interpolated,
      });
      setShowSmsPreview(true);
    });
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
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
                      {s.name} · {s.duration_minutes}min
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
                  const isBooked = isTherapistSelected && takenSlots.has(s);
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
                          : isBooked
                          ? "border-dashed border-red-500/30 bg-red-950/10 text-red-400/60 line-through opacity-60 cursor-not-allowed"
                          : selected
                          ? "border-gold bg-gradient-to-br from-[#c89b3c] to-[#a97e2e] text-black font-bold shadow-sm"
                          : "border-border bg-background text-foreground hover:border-gold/50 cursor-pointer"
                      }`}
                    >
                      <span className={isBooked ? "line-through" : undefined}>{fmtTime(s)}</span>
                      {isBooked && (
                        <span className="text-[9px] no-underline font-sans text-red-400/80 leading-none mt-0.5">
                          Booked
                        </span>
                      )}
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
                  Struck-through slots are already booked. Past slots are disabled.
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
                          Room {r}{!isFree ? " — Occupied" : ""}
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
                onChange={(e) => setPromoId(e.target.value)}
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
                {promos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} (−₱{p.discount})
                  </option>
                ))}
              </select>
              {promoId === "redeem_100_pts" && (
                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-gold font-medium">
                  <span>🏅</span>
                  <span>
                    100 pts applied (-₱{combiCredit} credit). Upgrade fee: ₱{Math.max(0, (selectedService?.price ?? 0) - combiCredit)}
                  </span>
                </div>
              )}
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
            onClick={onClose}
            disabled={isPending}
            className="flex-1 rounded-md border border-border px-4 py-2.5 text-sm text-foreground hover:border-gold/30 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-[1.4] rounded-md border border-gold bg-gold px-4 py-2.5 text-sm font-semibold text-black hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save Booking"}
          </button>
        </div>
      </div>
    </div>

    {showSmsPreview && smsBooking && (
      <SmsPreviewModal
        booking={smsBooking}
        initialMessage={smsBooking.message}
        onClose={() => {
          setShowSmsPreview(false);
          setSmsBooking(null);
          if (pendingSuccessToast) {
            showBookingToast(pendingSuccessToast);
            setPendingSuccessToast(null);
          }
          onCreated();
        }}
      />
    )}
  </>
  );
}
