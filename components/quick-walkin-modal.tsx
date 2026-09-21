"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { quickWalkin } from "@/app/(staff)/bookings/actions";
import { useStaffSim } from "@/lib/staff-context";
import { slotsOverlap, isSlotPastGracePeriod } from "@/lib/bookings/slots";
import { spaDayNow } from "@/lib/analytics/spa-day";
import { WEEKEND_SLOTS } from "@/components/therapist-card";
import type {
  Addon,
  Client,
  Promo,
  Service,
  Staff,
  Therapist,
} from "@/components/booking-browser";
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

export interface QuickWalkinModalProps {
  clients?: Client[];
  services?: Service[];
  therapists?: Therapist[];
  rooms?: number[];
  staff?: Staff[];
  promos?: Promo[];
  addons?: Addon[];
  lockers?: number[];
  timeSlots?: string[];
  initialClientId?: string | null;
  initialTherapistId?: string;
  initialSlotTime?: string;
  initialDate?: string;
  onClose: () => void;
  onCreated: () => void;
}

export function QuickWalkinModal({
  clients: propClients,
  services: propServices,
  therapists: propTherapists,
  rooms: propRooms,
  staff: propStaff,
  promos: propPromos,
  addons: propAddons,
  lockers: propLockers,
  timeSlots: propTimeSlots,
  initialClientId = null,
  initialTherapistId,
  initialSlotTime,
  initialDate,
  onClose,
  onCreated,
}: QuickWalkinModalProps) {
  const date = initialDate || spaDayNow();

  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 30_000);
    return () => clearInterval(timer);
  }, []);

  const [clients, setClients] = useState<Client[]>(() => propClients ?? []);
  const [services, setServices] = useState<Service[]>(() => propServices ?? []);
  const [therapists, setTherapists] = useState<Therapist[]>(() => propTherapists ?? []);
  const [rooms, setRooms] = useState<number[]>(() => propRooms ?? []);
  const [staff, setStaff] = useState<Staff[]>(() => propStaff ?? []);
  const [promos, setPromos] = useState<Promo[]>(() => propPromos ?? []);
  const [addons, setAddons] = useState<Addon[]>(() => propAddons ?? []);
  const [lockers, setLockers] = useState<number[]>(() => propLockers ?? []);
  const [timeSlots, setTimeSlots] = useState<string[]>(() => propTimeSlots ?? WEEKEND_SLOTS);

  useEffect(() => { if (propClients) setClients(propClients); }, [propClients]);
  useEffect(() => { if (propServices) setServices(propServices); }, [propServices]);
  useEffect(() => { if (propTherapists) setTherapists(propTherapists); }, [propTherapists]);
  useEffect(() => { if (propRooms) setRooms(propRooms); }, [propRooms]);
  useEffect(() => { if (propStaff) setStaff(propStaff); }, [propStaff]);
  useEffect(() => { if (propPromos) setPromos(propPromos); }, [propPromos]);
  useEffect(() => { if (propAddons) setAddons(propAddons); }, [propAddons]);
  useEffect(() => { if (propLockers) setLockers(propLockers); }, [propLockers]);
  useEffect(() => { if (propTimeSlots) setTimeSlots(propTimeSlots); }, [propTimeSlots]);

  useEffect(() => {
    const supabase = createClient();
    if (!propClients) {
      supabase
        .from("clients")
        .select("id, codename, username, member_code")
        .order("codename")
        .then(({ data }) => {
          if (data) {
            setClients(
              data.map((c) => ({
                id: c.id,
                codename: c.codename,
                username: c.username,
                member_code: c.member_code ?? undefined,
                has_portal_account: false,
              }))
            );
          }
        });
    }
    if (!propServices) {
      supabase
        .from("services")
        .select("id, name, duration_minutes, price, points_earned")
        .eq("active", true)
        .then(({ data }) => {
          if (data) {
            setServices(
              data.map((s) => ({
                id: s.id,
                name: s.name,
                duration_minutes: s.duration_minutes,
                price: s.price,
                points_earned: s.points_earned ?? 0,
              }))
            );
          }
        });
    }
    if (!propTherapists) {
      supabase
        .from("therapists")
        .select("id, name")
        .eq("archived", false)
        .order("name")
        .then(({ data }) => {
          if (data) setTherapists(data);
        });
    }
    if (!propRooms) {
      supabase
        .from("rooms")
        .select("number")
        .eq("active", true)
        .order("number")
        .then(({ data }) => {
          if (data && data.length > 0) {
            setRooms(data.map((r) => r.number));
          } else {
            setRooms(Array.from({ length: 18 }, (_, i) => i + 1));
          }
        });
    }
    if (!propStaff) {
      supabase
        .from("staff")
        .select("id, name, position")
        .eq("active", true)
        .order("name")
        .then(({ data }) => {
          if (data) {
            setStaff(
              data.map((st) => ({
                id: st.id,
                name: st.name,
                position: st.position ?? "",
              }))
            );
          }
        });
    }
    if (!propPromos) {
      supabase
        .from("promos")
        .select("id, label, discount")
        .eq("active", true)
        .then(({ data }) => {
          if (data) setPromos(data);
        });
    }
    if (!propAddons) {
      supabase
        .from("addons")
        .select("id, name, price")
        .eq("active", true)
        .then(({ data }) => {
          if (data) setAddons(data);
        });
    }
    if (!propLockers) {
      supabase
        .from("lockers")
        .select("number")
        .eq("active", true)
        .order("number")
        .then(({ data }) => {
          if (data && data.length > 0) {
            setLockers(data.map((l) => l.number));
          } else {
            setLockers(Array.from({ length: 18 }, (_, i) => i + 1));
          }
        });
    }
    if (!propTimeSlots) {
      supabase
        .from("weekend_slots")
        .select("slot_time")
        .then(({ data }) => {
          if (data && data.length > 0) {
            setTimeSlots(data.map((s: any) => s.slot_time.slice(0, 5)));
          }
        });
    }
  }, [
    propClients,
    propServices,
    propTherapists,
    propRooms,
    propStaff,
    propPromos,
    propAddons,
    propLockers,
    propTimeSlots,
  ]);

  const [clientQuery, setClientQuery] = useState("");
  const [clientId, setClientId] = useState<string | null>(initialClientId);
  // Set when opened via a Member QR scan — the client field is locked to a
  // read-only display until the user explicitly clicks "Change client", so a
  // scan can't be silently overridden by an accidental keystroke.
  const [clientLocked, setClientLocked] = useState(!!initialClientId);
  const [guestName, setGuestName] = useState("");
  const [serviceId, setServiceId] = useState(propServices?.[0]?.id ?? "");
  const [therapistId, setTherapistId] = useState<string>(initialTherapistId ?? "");
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [slotTime, setSlotTime] = useState<string>(initialSlotTime ?? "");
  const [customTime, setCustomTime] = useState(roundedNowTime());
  const [roomNumber, setRoomNumber] = useState<number | "">("");

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

  const [lockerNumber, setLockerNumber] = useState<number | "">("");
  const [promoId, setPromoId] = useState<string>("none");
  const [manualDiscountOn, setManualDiscountOn] = useState(false);
  const [discountType, setDiscountType] = useState<"pct" | "fixed">("pct");
  const [discountValue, setDiscountValue] = useState(20);
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [splitCashAmount, setSplitCashAmount] = useState<number | "">(0);
  const [splitGcashAmount, setSplitGcashAmount] = useState<number | "">(0);
  const [lastEditedSplitField, setLastEditedSplitField] = useState<"cash" | "gcash">("cash");
  const [paymentMethod, setPaymentMethod] = useState<string>("Cash");
  const isSplitPayment = paymentMethod === "Split (Cash + GCash)";
  const [gcashRef, setGcashRef] = useState("");
  const { sessionStaff } = useStaffSim();
  const actor = sessionStaff;
  const staffId = actor?.id ?? "";
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
  const [unavailableTherapists, setUnavailableTherapists] = useState<Map<string, string>>(new Map());
  const [serviceTherapistMap, setServiceTherapistMap] = useState<Map<string, Set<string>>>(new Map());
  const [therapistServicesMap, setTherapistServicesMap] = useState<Map<string, Set<string>>>(new Map());
  const [servicesLoaded, setServicesLoaded] = useState(false);

  // Set default service once services load if none selected
  useEffect(() => {
    if (!serviceId && services.length > 0) {
      if (therapistId && servicesLoaded) {
        const offered = therapistServicesMap.get(therapistId);
        const qualified = services.find((s) => offered?.has(s.id));
        if (qualified) {
          setServiceId(qualified.id);
          return;
        }
      }
      setServiceId(services[0].id);
    }
  }, [services, serviceId, therapistId, servicesLoaded, therapistServicesMap]);
  const [occupiedLockers, setOccupiedLockers] = useState<Set<number>>(new Set());
  const [maintenanceLockers, setMaintenanceLockers] = useState<Map<number, string | null>>(new Map());
  const [clientBookings, setClientBookings] = useState<
    Array<{ client_id: string | null; guest_label: string | null; start_time: string }>
  >([]);
  const [activeLockerMap, setActiveLockerMap] = useState<Map<string, number>>(new Map());
  const [activeWalkinCheckins, setActiveWalkinCheckins] = useState<
    Array<{ guestLabel: string; lockerNumber: number }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pointsWarning, setPointsWarning] = useState<string | null>(null);
  const [pendingSuccessToast, setPendingSuccessToast] = useState<{
    title: string;
    description: string;
  } | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

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

    supabase
      .from("lockers")
      .select("number, status, is_maintenance, maintenance_note")
      .eq("active", true)
      .then(({ data }) => {
        const map = new Map<number, string | null>();
        for (const l of data ?? []) {
          if (l.is_maintenance || l.status === "out_of_order" || l.status === "maintenance") {
            map.set(l.number, l.maintenance_note ?? null);
          }
        }
        setMaintenanceLockers(map);
      });

    supabase
      .from("locker_occupancy")
      .select("locker_number, client_id, guest_label")
      .is("checked_out_at", null)
      .then(({ data }) => {
        const occupied = new Set<number>();
        const lockerMap = new Map<string, number>();
        const walkinsList: Array<{ guestLabel: string; lockerNumber: number }> = [];

        for (const row of data ?? []) {
          occupied.add(row.locker_number);
          if (row.client_id) {
            lockerMap.set(row.client_id, row.locker_number);
          }
          if (row.guest_label) {
            const key = row.guest_label.trim().toLowerCase();
            lockerMap.set(key, row.locker_number);
            if (!row.client_id) {
              walkinsList.push({
                guestLabel: row.guest_label,
                lockerNumber: row.locker_number,
              });
            }
          }
        }
        setOccupiedLockers(occupied);
        setActiveLockerMap(lockerMap);
        setActiveWalkinCheckins(walkinsList);
      });
  }, [date]);

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
      const scrubAndMassage = services.find((s) => s.name === "Scrub + Massage");
      const activeScrubId = scrubAndMassage?.id ?? "8c97c5db-eaa9-47b9-89c0-9db114000483";
      const legacyScrubId = "326e0b78-49cb-441c-aa03-e54453f2f67f";

      for (const row of servicesOffered.data ?? []) {
        const effectiveServiceId =
          row.service_id === legacyScrubId ? activeScrubId : row.service_id;

        if (!stMap.has(effectiveServiceId)) {
          stMap.set(effectiveServiceId, new Set());
        }
        stMap.get(effectiveServiceId)!.add(row.therapist_id);

        if (!tsMap.has(row.therapist_id)) {
          tsMap.set(row.therapist_id, new Set());
        }
        tsMap.get(row.therapist_id)!.add(effectiveServiceId);
      }
      setServiceTherapistMap(stMap);
      setTherapistServicesMap(tsMap);
      setServicesLoaded(true);
    });
  }, [date, services]);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [error]);

  const selectedService = services.find((s) => s.id === serviceId);
  const duration = selectedService?.duration_minutes ?? 0;
  const isMassageService = selectedService?.name !== "Wet Area";
  const isTherapistSelected = !!therapistId;
  const time = useCustomTime ? customTime : slotTime;

  const takenTherapists = useMemo(() => {
    const taken = new Set<string>();
    if (!time) return taken;
    for (const row of conflicts) {
      if (!row.therapist_id) continue;
      if (slotsOverlap(time, duration, row.start_time, row.duration_minutes ?? 0)) {
        taken.add(row.therapist_id);
      }
    }
    return taken;
  }, [conflicts, time, duration]);

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

  const freeRooms = useMemo(() => {
    if (!time) return [];
    const taken = new Set<number>();
    for (const row of conflicts) {
      if (row.room_number == null) continue;
      if (slotsOverlap(time, duration, row.start_time, row.duration_minutes ?? 0)) {
        taken.add(row.room_number);
      }
    }
    return effectiveRooms.filter((r) => !taken.has(r));
  }, [conflicts, time, duration, effectiveRooms]);

  // Auto-select the first available room when time slot is set and room is unselected or no longer available
  useEffect(() => {
    if (!isMassageService || !time) return;
    if (freeRooms.length > 0) {
      if (roomNumber === "" || !freeRooms.includes(Number(roomNumber))) {
        setRoomNumber(freeRooms[0]);
      }
    } else if (roomNumber !== "") {
      setRoomNumber("");
    }
  }, [isMassageService, time, freeRooms, roomNumber]);


  const filteredClients = useMemo(() => {
    if (!clientQuery.trim()) return [];
    const q = clientQuery.toLowerCase();
    return clients
      .filter(
        (c) => c.codename.toLowerCase().includes(q) || c.username.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [clients, clientQuery]);

  const filteredActiveWalkins = useMemo(() => {
    if (!clientQuery.trim()) return [];
    const q = clientQuery.toLowerCase();
    return activeWalkinCheckins.filter((w) =>
      w.guestLabel.toLowerCase().includes(q)
    );
  }, [activeWalkinCheckins, clientQuery]);

  const activeLockerForClient = useMemo(() => {
    if (clientId) {
      return activeLockerMap.get(clientId) ?? null;
    }
    if (guestName.trim()) {
      return activeLockerMap.get(guestName.trim().toLowerCase()) ?? null;
    }
    return null;
  }, [clientId, guestName, activeLockerMap]);

  useEffect(() => {
    if (activeLockerForClient != null) {
      setLockerNumber(activeLockerForClient);
    }
  }, [activeLockerForClient]);

  const hasClientSlotConflict = useMemo(() => {
    if (!time) return false;
    if (clientId) {
      return clientBookings.some(
        (b) => b.client_id === clientId && b.start_time === time
      );
    }
    if (guestName.trim()) {
      const q = guestName.trim().toLowerCase();
      return clientBookings.some(
        (b) =>
          !b.client_id &&
          b.guest_label &&
          b.guest_label.trim().toLowerCase() === q &&
          b.start_time === time
      );
    }
    return false;
  }, [time, clientId, guestName, clientBookings]);

  const selectedClient = clients.find((c) => c.id === clientId);
  const selectedPromo = promos.find((p) => p.id === promoId);

  // Reset dependent selections when service changes (mirrors mockup's onWalkinServiceChange)
  function onServiceChange(nextServiceId: string) {
    setServiceId(nextServiceId);
    const offeringSet = serviceTherapistMap.get(nextServiceId);
    const isStillQualified = !!therapistId && !!offeringSet?.has(therapistId);
    if (!isStillQualified) {
      setTherapistId("");
      setSlotTime("");
      setUseCustomTime(false);
      setRoomNumber("");
    }
    setPromoId("none");
    setManualDiscountOn(false);
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

  const amount = useMemo(() => {
    const base = selectedService?.price ?? 0;
    let value = base;
    if (selectedPromo) {
      value = Math.max(base - selectedPromo.discount, 0);
    } else if (manualDiscountOn) {
      value =
        discountType === "pct"
          ? Math.max(Math.round(base * (1 - discountValue / 100)), 0)
          : Math.max(base - discountValue, 0);
    }
    const addonsTotal = addons
      .filter((a) => addonIds.includes(a.id))
      .reduce((sum, a) => sum + a.price, 0);
    return value + addonsTotal;
  }, [selectedService, selectedPromo, manualDiscountOn, discountType, discountValue, addonIds, addons]);

  // Service-only paid amount (post-promo/discount, excluding add-ons) — the
  // input to the loyalty formula. Distinct from `amount`, which is what's
  // recorded on the sale and includes add-ons.
  const servicePaidAmount = useMemo(() => {
    const base = selectedService?.price ?? 0;
    if (selectedPromo) return Math.max(base - selectedPromo.discount, 0);
    if (manualDiscountOn) {
      return discountType === "pct"
        ? Math.max(Math.round(base * (1 - discountValue / 100)), 0)
        : Math.max(base - discountValue, 0);
    }
    return base;
  }, [selectedService, selectedPromo, manualDiscountOn, discountType, discountValue]);

  useEffect(() => {
    if (isSplitPayment) {
      if (lastEditedSplitField === "gcash") {
        const g = typeof splitGcashAmount === "number" ? splitGcashAmount : 0;
        setSplitCashAmount(Math.max(0, amount - g));
      } else {
        const c = typeof splitCashAmount === "number" ? splitCashAmount : 0;
        setSplitGcashAmount(Math.max(0, amount - c));
      }
    }
  }, [amount, isSplitPayment, lastEditedSplitField]);

  const numCash = typeof splitCashAmount === "number" ? splitCashAmount : (parseFloat(String(splitCashAmount)) || 0);
  const numGcash = typeof splitGcashAmount === "number" ? splitGcashAmount : (parseFloat(String(splitGcashAmount)) || 0);
  const isSplitValid = !isSplitPayment || (numCash >= 0 && numGcash >= 0 && Math.abs((numCash + numGcash) - amount) < 0.01);

  function toggleAddon(id: string) {
    setAddonIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function onPromoChange(value: string) {
    setPromoId(value);
    if (value !== "none") setManualDiscountOn(false);
  }

  function onManualDiscountToggle(checked: boolean) {
    setManualDiscountOn(checked);
    if (checked) {
      setPromoId("none");
      if (discountType === "pct") {
        setDiscountValue(20);
      }
    }
  }

  const isLockerValid =
    typeof lockerNumber === "number" &&
    (!occupiedLockers.has(lockerNumber) || lockerNumber === activeLockerForClient);

  const isPastSlot = isMassageService && !useCustomTime && !!slotTime && pastSlots.has(slotTime);
  const isBookedSlot = isMassageService && !useCustomTime && !!slotTime && takenSlots.has(slotTime);

  const canSubmit =
    !isPending &&
    !hasClientSlotConflict &&
    !isPastSlot &&
    !isBookedSlot &&
    !!serviceId &&
    !!staffId &&
    isLockerValid &&
    isSplitValid &&
    (clientId ? true : guestName.trim().length > 0) &&
    (!isMassageService ||
      (!!therapistId &&
        !!time &&
        !!roomNumber &&
        freeRooms.includes(Number(roomNumber)) &&
        !takenTherapists.has(therapistId) &&
        !unavailableTherapists.has(therapistId) &&
        (!servicesLoaded || !!serviceTherapistMap.get(serviceId)?.has(therapistId))));

  function handleSubmit() {
    setError(null);
    if (isMassageService && !useCustomTime && slotTime && pastSlots.has(slotTime)) {
      setError("The selected time slot has already passed. Please select an available slot.");
      return;
    }
    if (isMassageService && !useCustomTime && slotTime && takenSlots.has(slotTime)) {
      setError("The selected time slot is already booked for this therapist.");
      return;
    }
    if (hasClientSlotConflict) {
      setError(`This client already has a booking at ${fmtTime(time)}. Please select a different time.`);
      return;
    }
    if (isMassageService && (roomNumber === "" || !freeRooms.includes(Number(roomNumber)))) {
      setError("Please select an available room.");
      return;
    }
    if (typeof lockerNumber === "number" && occupiedLockers.has(lockerNumber) && lockerNumber !== activeLockerForClient) {
      setError("That locker is currently occupied. Please select an unoccupied locker.");
      return;
    }
    if (typeof lockerNumber === "number" && maintenanceLockers.has(lockerNumber)) {
      const note = maintenanceLockers.get(lockerNumber);
      setError(`Locker #${lockerNumber} is out of order${note ? ` (${note})` : ""} and cannot be assigned.`);
      return;
    }
    if (isSplitPayment && !isSplitValid) {
      setError(`Sum of Cash Amount (₱${numCash.toLocaleString()}) and GCash Amount (₱${numGcash.toLocaleString()}) must equal required total (₱${amount.toLocaleString()}).`);
      return;
    }

    startTransition(async () => {
      const showRefField = paymentMethod !== "Cash" && (paymentMethod !== "Split (Cash + GCash)" || numGcash > 0);
      const result = await quickWalkin({
        clientId,
        guestLabel: clientId ? null : guestName.trim(),
        serviceId,
        therapistId: isMassageService ? therapistId : null,
        roomNumber: isMassageService ? (roomNumber as number) : null,
        bookingDate: date,
        startTime: isMassageService ? time : roundedNowTime(),
        lockerNumber: lockerNumber as number,
        promoId: promoId === "none" ? null : promoId,
        manualDiscountType: manualDiscountOn ? discountType : null,
        manualDiscountValue: manualDiscountOn ? discountValue : null,
        addonIds,
        amount,
        servicePaidAmount,
        paymentMethod,
        isSplitPayment,
        splitMethod1: "Cash",
        splitAmount1: numCash,
        splitMethod2: "GCash",
        splitAmount2: numGcash,
        splitCashAmount: isSplitPayment ? numCash : null,
        splitGcashAmount: isSplitPayment ? numGcash : null,
        paymentRef: showRefField ? gcashRef.trim() || null : null,
        staffId,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      const resolvedClientName = clientId
        ? clients.find((c) => c.id === clientId)?.codename ?? "Client"
        : guestName.trim() || "Guest";
      const resolvedServiceName = services.find((s) => s.id === serviceId)?.name ?? "Service";
      const resolvedTherapistName =
        isMassageService && therapistId
          ? therapists.find((t) => t.id === therapistId)?.name ?? null
          : null;
      const lockerText = typeof lockerNumber === "number" ? `Locker #${lockerNumber}` : null;
      const roomText = isMassageService && roomNumber ? `Room ${roomNumber}` : null;

      const toastSubtitle = [
        resolvedClientName,
        `${resolvedServiceName}${resolvedTherapistName ? ` (${resolvedTherapistName})` : ""}`,
        lockerText,
        roomText,
      ]
        .filter(Boolean)
        .join(" • ");

      const successToastData = {
        title: "Walk-in logged successfully!",
        description: toastSubtitle,
      };

      if (clientId && result.pointsAwarded === null) {
        setPendingSuccessToast(successToastData);
        setPointsWarning(
          "Walk-in logged, pero WALANG POINTS na-award — hindi pa naka-configure ang loyalty formula sa Settings."
        );
        return;
      }

      showBookingToast(successToastData);
      onCreated();
    });
  }

  if (pointsWarning) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="w-full max-w-sm rounded-xl border border-[#a97e2e] bg-surface p-6 shadow-2xl space-y-4">
          <h2 className="text-base font-semibold text-accent-gold">⚠ Points Not Awarded</h2>
          <p className="text-sm text-foreground">{pointsWarning}</p>
          <button
            type="button"
            onClick={() => {
              setPointsWarning(null);
              if (pendingSuccessToast) {
                showBookingToast(pendingSuccessToast);
                setPendingSuccessToast(null);
              }
              onCreated();
            }}
            className="w-full rounded-md border border-gold bg-gold px-4 py-2.5 text-sm font-semibold text-black hover:brightness-105"
          >
            OK
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Quick Walk-in</h2>
        <p className="mt-1 text-xs text-muted">
          Service, therapist/room (if massage), locker, and payment — all in one step.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label className="text-xs text-muted" htmlFor="wk-client-search">
              Client <span className="opacity-70">(search if they already have an account)</span>
            </label>
            {clientLocked ? (
              <div className="mt-1 flex items-center justify-between gap-2 rounded-md border border-gold/50 bg-gold/5 px-3 py-2">
                <span className="text-sm font-medium text-foreground">
                  {selectedClient?.codename} <span className="text-muted">@{selectedClient?.username}</span>
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-gold">Scanned</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setClientLocked(false);
                    setClientId(null);
                  }}
                  className="shrink-0 text-xs text-muted underline hover:text-foreground"
                >
                  Change client
                </button>
              </div>
            ) : (
              <>
                <input
                  id="wk-client-search"
                  type="text"
                  placeholder="Search by name or username…"
                  value={clientId ? `${selectedClient?.codename}` : clientQuery}
                  onChange={(e) => {
                    setClientId(null);
                    setClientQuery(e.target.value);
                  }}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
                {!clientId && clientQuery && (
                  <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-background">
                    {filteredClients.length === 0 && filteredActiveWalkins.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted">No matching clients or active walk-ins.</p>
                    ) : (
                      <>
                        {filteredClients.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setClientId(c.id);
                              setGuestName("");
                              setClientQuery("");
                            }}
                            className="block min-h-[44px] sm:min-h-0 w-full px-3 py-2 text-left text-sm text-foreground hover:bg-gold/10"
                          >
                            {c.codename} <span className="text-muted">@{c.username}</span>
                          </button>
                        ))}
                        {filteredActiveWalkins.map((w) => (
                          <button
                            key={`walkin-${w.guestLabel}`}
                            type="button"
                            onClick={() => {
                              setClientId(null);
                              setGuestName(w.guestLabel);
                              setClientQuery("");
                            }}
                            className="flex items-center justify-between min-h-[44px] sm:min-h-0 w-full px-3 py-2 text-left text-sm text-foreground hover:bg-gold/10 border-t border-border/40"
                          >
                            <span>{w.guestLabel}</span>
                            <span className="shrink-0 rounded bg-gold/15 px-2 py-0.5 text-[10px] font-semibold text-gold border border-gold/30">
                              {w.guestLabel} • Checked in: Locker {w.lockerNumber}
                            </span>
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
                {clientId && (
                  <button
                    type="button"
                    onClick={() => setClientId(null)}
                    className="mt-1 text-xs text-muted underline hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </>
            )}
          </div>

          {!clientId && (
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted" htmlFor="wk-guest-name">
                  Name <span className="opacity-70">(if not found above — walk-in, no account)</span>
                </label>
                {activeLockerForClient != null && (
                  <span className="text-[10px] font-medium text-gold bg-gold/10 px-2 py-0.5 rounded border border-gold/30">
                    Active Today: Locker {activeLockerForClient}
                  </span>
                )}
              </div>
              <input
                id="wk-guest-name"
                type="text"
                placeholder="e.g. Guest at door"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted" htmlFor="wk-service">
                Service
              </label>
              <select
                id="wk-service"
                value={serviceId}
                onChange={(e) => onServiceChange(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
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
              <div>
                <label className="text-xs text-muted" htmlFor="wk-therapist">
                  Therapist
                </label>
                <select
                  id="wk-therapist"
                  value={therapistId}
                  disabled={!serviceId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setTherapistId(nextId);
                    setRoomNumber("");
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
                  className={`mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground ${
                    !serviceId ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                >
                  <option value="">
                    {!serviceId ? "— select service first —" : "— select —"}
                  </option>
                  {qualifiedTherapists.map((t) => {
                    const unavailableReason = unavailableTherapists.get(t.id);
                    const fullyBooked = fullyBookedTherapists.has(t.id);
                    const conflictNow = takenTherapists.has(t.id);
                    const disabled = !!unavailableReason || fullyBooked || conflictNow;
                    return (
                      <option
                        key={t.id}
                        value={t.id}
                        disabled={disabled}
                        className={disabled ? "text-stone-500" : undefined}
                      >
                        {t.name}
                        {unavailableReason
                          ? ` - ${unavailableReason}`
                          : fullyBooked
                          ? " - Fully Booked"
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

          {isMassageService && (
            <>
              <div>
                <label className="text-xs text-muted">Time Slot</label>
                {timeSlots.length === 0 && (
                  <p className="mt-1 text-xs text-muted">
                    No time slots configured yet. Add some in Settings.
                  </p>
                )}
                <div className="mt-1 grid grid-cols-3 sm:grid-cols-4 gap-2">
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
                          setRoomNumber("");
                        }}
                        className={`min-h-[44px] sm:min-h-[38px] rounded-md border px-2 py-1 text-xs transition-all flex flex-col items-center justify-center ${
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

              <div>
                <label
                  className={`flex items-center gap-2 text-sm text-foreground ${
                    !isTherapistSelected ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={useCustomTime}
                    disabled={!isTherapistSelected}
                    onChange={(e) => {
                      setUseCustomTime(e.target.checked);
                      if (e.target.checked) setSlotTime("");
                      setRoomNumber("");
                    }}
                    className={!isTherapistSelected ? "cursor-not-allowed" : ""}
                  />
                  Use a custom time instead
                </label>
                {useCustomTime && isTherapistSelected && (
                  <input
                    type="time"
                    step={1800}
                    value={customTime}
                    onChange={(e) => {
                      setCustomTime(e.target.value);
                      setRoomNumber("");
                    }}
                    className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                  />
                )}
              </div>

              {hasClientSlotConflict && time && (
                <p className="rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300 font-medium">
                  ⚠ This client already has a booking at {fmtTime(time)}. Please select a different time.
                </p>
              )}

              {time && (
                <div>
                  <label className="text-xs text-muted" htmlFor="wk-room">
                    Room
                  </label>
                  <select
                    id="wk-room"
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(e.target.value === "" ? "" : Number(e.target.value))}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50"
                  >
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
                  </select>
                  <p className="mt-1 text-xs text-muted">
                    {freeRooms.length} room{freeRooms.length === 1 ? "" : "s"} free at this time.
                  </p>
                </div>
              )}
            </>
          )}

          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted" htmlFor="wk-locker">
                Assign Locker
              </label>
              {activeLockerForClient != null && (
                <span className="inline-flex items-center rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-semibold text-gold border border-gold/30">
                  Locker {activeLockerForClient} (Reusing Active Locker)
                </span>
              )}
            </div>
            <select
              id="wk-locker"
              value={lockerNumber}
              onChange={(e) => setLockerNumber(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="">— select locker —</option>
              {lockers.map((n) => {
                const isOccupied = occupiedLockers.has(n);
                const isReusing = activeLockerForClient === n;
                const isMaintenance = maintenanceLockers.has(n);
                const maintenanceNote = maintenanceLockers.get(n);
                const disabled = (isOccupied && !isReusing) || isMaintenance;
                return (
                  <option
                    key={n}
                    value={n}
                    disabled={disabled}
                    className={disabled ? "text-muted" : undefined}
                  >
                    Locker {n}{
                      isMaintenance
                        ? ` — Out of Order${maintenanceNote ? ` (${maintenanceNote})` : ""}`
                        : isReusing
                        ? " — Active Locker (Reusing)"
                        : isOccupied
                        ? " — Occupied"
                        : ""
                    }
                  </option>
                );
              })}
            </select>
          </div>

          {isMassageService && (
            <div>
              <label className="text-xs text-muted" htmlFor="wk-promo">
                Promo <span className="opacity-70">(optional — one discount at a time)</span>
              </label>
              <select
                id="wk-promo"
                value={promoId}
                onChange={(e) => onPromoChange(e.target.value)}
                disabled={manualDiscountOn}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50"
              >
                <option value="none">No Promo</option>
                {promos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} (−₱{p.discount})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={manualDiscountOn}
                onChange={(e) => onManualDiscountToggle(e.target.checked)}
                disabled={promoId !== "none"}
              />
              Manual discount (e.g. Senior or PWD)
            </label>
            {manualDiscountOn && (
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted" htmlFor="wk-discount-type">
                    Type
                  </label>
                  <select
                    id="wk-discount-type"
                    value={discountType}
                    onChange={(e) => {
                      const nextType = e.target.value as "pct" | "fixed";
                      setDiscountType(nextType);
                      if (nextType === "pct") {
                        setDiscountValue(20);
                      }
                    }}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                  >
                    <option value="pct">Percentage</option>
                    <option value="fixed">Fixed ₱</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted" htmlFor="wk-discount-value">
                    Value
                  </label>
                  <input
                    id="wk-discount-value"
                    type="number"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(Number(e.target.value))}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                  />
                </div>
              </div>
            )}
          </div>

          {addons.length > 0 && (
            <div>
              <label className="text-xs text-muted">Add-ons <span className="opacity-70">(optional)</span></label>
              <div className="mt-1 space-y-1">
                {addons.map((a) => (
                  <label key={a.id} className="flex min-h-[44px] sm:min-h-0 items-center justify-between text-sm text-foreground">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={addonIds.includes(a.id)}
                        onChange={() => toggleAddon(a.id)}
                      />
                      {a.name}
                    </span>
                    <span className="text-muted">+₱{a.price}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted" htmlFor="wk-payment">
                  Payment Method
                </label>
                <select
                  id="wk-payment"
                  value={paymentMethod}
                  onChange={(e) => {
                    const method = e.target.value;
                    setPaymentMethod(method);
                    if (method === "Split (Cash + GCash)") {
                      setSplitCashAmount(amount);
                      setSplitGcashAmount(0);
                      setLastEditedSplitField("cash");
                    }
                  }}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none"
                >
                  <option value="Cash">Cash</option>
                  <option value="GCash">GCash</option>
                  <option value="Split (Cash + GCash)">Split (Cash + GCash)</option>
                </select>
              </div>

              {!isSplitPayment && (
                <div>
                  <label className="text-xs text-muted" htmlFor="wk-amount">
                    Amount Paid (₱) <span className="opacity-70">(auto)</span>
                  </label>
                  <input
                    id="wk-amount"
                    type="number"
                    value={amount}
                    disabled
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground opacity-70"
                  />
                </div>
              )}
            </div>

            {isSplitPayment && (
              <div className="mt-3 space-y-3 rounded-md border border-border/80 bg-background/50 p-3">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>Total Required: <strong className="text-gold">₱{amount.toLocaleString()}</strong></span>
                  <span className="text-[10px] uppercase tracking-wide text-gold">Split Active</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted" htmlFor="wk-split-cash-amount">
                      Cash Amount (₱)
                    </label>
                    <input
                      id="wk-split-cash-amount"
                      type="number"
                      min="0"
                      step="any"
                      value={splitCashAmount}
                      onChange={(e) => {
                        const valStr = e.target.value;
                        if (valStr === "") {
                          setSplitCashAmount("");
                          setLastEditedSplitField("cash");
                        } else {
                          const val = parseFloat(valStr);
                          const num = isNaN(val) ? 0 : val;
                          setSplitCashAmount(num);
                          setSplitGcashAmount(Math.max(0, amount - num));
                          setLastEditedSplitField("cash");
                        }
                      }}
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted" htmlFor="wk-split-gcash-amount">
                      GCash Amount (₱)
                    </label>
                    <input
                      id="wk-split-gcash-amount"
                      type="number"
                      min="0"
                      step="any"
                      value={splitGcashAmount}
                      onChange={(e) => {
                        const valStr = e.target.value;
                        if (valStr === "") {
                          setSplitGcashAmount("");
                          setLastEditedSplitField("gcash");
                        } else {
                          const val = parseFloat(valStr);
                          const num = isNaN(val) ? 0 : val;
                          setSplitGcashAmount(num);
                          setSplitCashAmount(Math.max(0, amount - num));
                          setLastEditedSplitField("gcash");
                        }
                      }}
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-gold outline-none font-mono"
                    />
                  </div>
                </div>

                {!isSplitValid && (
                  <p className="rounded-md border border-red-900/50 bg-red-950/30 px-2.5 py-1.5 text-xs text-red-300 font-medium">
                    ⚠ Sum of Cash Amount (₱{numCash.toLocaleString()}) and GCash Amount (₱{numGcash.toLocaleString()}) must equal required total (₱{amount.toLocaleString()}).
                  </p>
                )}
              </div>
            )}
          </div>

          {(paymentMethod !== "Cash" && (paymentMethod !== "Split (Cash + GCash)" || numGcash > 0)) && (
            <div>
              <label className="text-xs text-muted" htmlFor="wk-gcash-ref">
                Reference Number <span className="opacity-70">(optional — GCash)</span>
              </label>
              <input
                id="wk-gcash-ref"
                type="text"
                placeholder="e.g. 1234567890"
                value={gcashRef}
                onChange={(e) => setGcashRef(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </div>
          )}


          {error && (
            <p
              ref={errorRef}
              className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm sm:text-xs text-red-300"
            >
              {error}
            </p>
          )}
        </div>

        <div className="sticky bottom-0 sm:static mt-6 -mx-4 sm:mx-0 -mb-4 sm:mb-0 flex justify-end gap-3 bg-surface px-4 sm:px-0 py-4 sm:py-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-md border border-border px-4 py-2.5 sm:py-2 text-sm text-foreground hover:border-gold/30"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-md border border-gold bg-gold/10 px-4 py-2.5 sm:py-2 text-sm font-medium text-gold hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
