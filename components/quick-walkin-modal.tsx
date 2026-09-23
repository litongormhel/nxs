"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { quickWalkin } from "@/app/(staff)/bookings/actions";
import { useStaffSim } from "@/lib/staff-context";
import { slotsOverlap, isSlotPastGracePeriod } from "@/lib/bookings/slots";
import { spaDayNow } from "@/lib/analytics/spa-day";
import { WEEKEND_SLOTS } from "@/components/therapist-card";
import { computeLoyaltyPoints, WET_AREA_POINTS, type LoyaltyFormulaMode } from "@/lib/loyalty";
import type {
  Addon,
  Client,
  Promo,
  Service,
  Staff,
  Therapist,
} from "@/components/booking-browser";
import { validatePromoEligibility, type PromoValidationResult } from "@/lib/promos/validation";
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

export type QuickWalkinClient = Client & {
  points_balance?: number | null;
  name?: string | null;
};

export interface QuickWalkinModalProps {
  clients?: QuickWalkinClient[];
  services?: Service[];
  therapists?: Therapist[];
  rooms?: number[];
  staff?: Staff[];
  promos?: Promo[];
  addons?: Addon[];
  lockers?: number[];
  timeSlots?: string[];
  initialClient?: QuickWalkinClient | null;
  initialClientId?: string | null;
  initialService?: string | null;
  initialPromo?: string | null;
  initialIsRedemption?: boolean;
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
  initialClient = null,
  initialClientId = null,
  initialService = null,
  initialPromo = null,
  initialIsRedemption = false,
  initialTherapistId,
  initialSlotTime,
  initialDate,
  onClose,
  onCreated,
}: QuickWalkinModalProps) {
  const date = initialDate || spaDayNow();
  const [step, setStep] = useState<"form" | "review">("form");

  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 30_000);
    return () => clearInterval(timer);
  }, []);

  const [clients, setClients] = useState<QuickWalkinClient[]>(() => {
    const list = propClients ? [...propClients] : [];
    if (initialClient && !list.some((c) => c.id === initialClient.id)) {
      list.unshift(initialClient);
    }
    return list;
  });
  const [services, setServices] = useState<Service[]>(() => propServices ?? []);
  const [therapists, setTherapists] = useState<Therapist[]>(() => propTherapists ?? []);
  const [rooms, setRooms] = useState<number[]>(() => propRooms ?? []);
  const [staff, setStaff] = useState<Staff[]>(() => propStaff ?? []);
  const [promos, setPromos] = useState<Promo[]>(() => propPromos ?? []);
  const [addons, setAddons] = useState<Addon[]>(() => propAddons ?? []);
  const [lockers, setLockers] = useState<number[]>(() => propLockers ?? []);
  const [timeSlots, setTimeSlots] = useState<string[]>(() => propTimeSlots ?? WEEKEND_SLOTS);

  useEffect(() => {
    if (propClients) {
      const list = [...propClients];
      if (initialClient && !list.some((c) => c.id === initialClient.id)) {
        list.unshift(initialClient);
      }
      setClients(list);
    }
  }, [propClients, initialClient]);
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
      Promise.all([
        supabase
          .from("clients")
          .select("id, codename, username, member_code, phone, points_balance")
          .order("codename"),
        supabase.from("client_portal_accounts").select("client_id"),
      ]).then(([{ data: clientsData }, { data: portalData }]) => {
        if (clientsData) {
          const portalSet = new Set((portalData ?? []).map((p) => p.client_id));
          setClients(
            clientsData.map((c) => ({
              id: c.id,
              codename: c.codename,
              username: c.username,
              member_code: c.member_code ?? undefined,
              phone: c.phone,
              points_balance: c.points_balance,
              has_portal_account: portalSet.has(c.id),
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

  const effectiveInitialClientId = initialClientId ?? initialClient?.id ?? null;
  const [clientQuery, setClientQuery] = useState("");
  const [clientId, setClientId] = useState<string | null>(effectiveInitialClientId);
  // Set when opened via a Member QR scan or member prefill — the client field is locked to a
  // read-only display until the user explicitly clicks "Change client", so a
  // scan/prefilled member can't be silently overridden by an accidental keystroke.
  const [clientLocked, setClientLocked] = useState(!!(effectiveInitialClientId || initialClient));
  const [guestName, setGuestName] = useState("");
  const [serviceId, setServiceId] = useState(() => {
    if (propServices && propServices.length > 0) {
      if (initialService) {
        const match = propServices.find(
          (s) =>
            s.id === initialService ||
            s.name.toLowerCase() === initialService.toLowerCase() ||
            s.name.toLowerCase().includes(initialService.toLowerCase())
        );
        if (match) return match.id;
      }
      if (initialIsRedemption) {
        const combi = propServices.find(
          (s) => s.name === "Combi Massage" || s.name.toLowerCase().includes("combi")
        );
        if (combi) return combi.id;
      }
      return propServices[0].id;
    }
    return "";
  });
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
  const [promoId, setPromoId] = useState<string>(() => {
    if (initialIsRedemption) return "redeem_100_pts";
    if (initialPromo) {
      if (initialPromo === "redeem_100_pts" || initialPromo === "loyalty_100") {
        return "redeem_100_pts";
      }
      return initialPromo;
    }
    return "none";
  });
  const [clientPointsBalance, setClientPointsBalance] = useState<number | null>(
    initialClient?.points_balance ?? null
  );
  const [clientPhone, setClientPhone] = useState<string | null>(
    initialClient?.phone ?? null
  );

  useEffect(() => {
    if (!clientId) {
      setClientPointsBalance(null);
      setClientPhone(null);
      return;
    }
    if (initialClient && initialClient.id === clientId) {
      if (initialClient.points_balance != null) {
        setClientPointsBalance(initialClient.points_balance);
      }
      if (initialClient.phone != null) {
        setClientPhone(initialClient.phone);
      }
    }
    const supabase = createClient();
    supabase
      .from("clients")
      .select("id, codename, username, phone, points_balance, member_code")
      .eq("id", clientId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          if (data.points_balance != null) {
            setClientPointsBalance(data.points_balance);
          }
          if (data.phone != null) {
            setClientPhone(data.phone);
          }
          setClients((prev) => {
            const existing = prev.find((c) => c.id === data.id);
            if (existing) {
              return prev.map((c) =>
                c.id === data.id
                  ? {
                      ...c,
                      phone: data.phone ?? c.phone,
                      points_balance: data.points_balance ?? c.points_balance,
                    }
                  : c
              );
            }
            return [
              ...prev,
              {
                id: data.id,
                codename: data.codename,
                username: data.username,
                phone: data.phone,
                points_balance: data.points_balance,
                member_code: data.member_code ?? undefined,
                has_portal_account: true,
              },
            ];
          });
        }
      });
  }, [clientId, initialClient]);
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
  const [notes, setNotes] = useState("");
  const { sessionStaff } = useStaffSim();
  const actor = sessionStaff;
  const staffId = actor?.id ?? "";

  const [loyaltySettings, setLoyaltySettings] = useState<{
    mode: LoyaltyFormulaMode;
    pesoPerPoint: number | null;
  }>({ mode: "proportional", pesoPerPoint: null });

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("app_settings")
      .select("loyalty_formula_mode, peso_per_point")
      .eq("id", true)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setLoyaltySettings({
            mode: (data.loyalty_formula_mode as LoyaltyFormulaMode) || "proportional",
            pesoPerPoint: data.peso_per_point ?? null,
          });
        }
      });
  }, []);

  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
  const [unavailableTherapists, setUnavailableTherapists] = useState<Map<string, string>>(new Map());
  const [therapistBreaksMap, setTherapistBreaksMap] = useState<Map<string, Set<string>>>(new Map());
  const [serviceTherapistMap, setServiceTherapistMap] = useState<Map<string, Set<string>>>(new Map());
  const [therapistServicesMap, setTherapistServicesMap] = useState<Map<string, Set<string>>>(new Map());
  const [servicesLoaded, setServicesLoaded] = useState(false);

  // Set default service once services load if none selected
  useEffect(() => {
    if (!serviceId && services.length > 0) {
      if (initialService) {
        const match = services.find(
          (s) =>
            s.id === initialService ||
            s.name.toLowerCase() === initialService.toLowerCase() ||
            s.name.toLowerCase().includes(initialService.toLowerCase())
        );
        if (match) {
          setServiceId(match.id);
          return;
        }
      }
      if (initialIsRedemption) {
        const combi = services.find(
          (s) => s.name === "Combi Massage" || s.name.toLowerCase().includes("combi")
        );
        if (combi) {
          setServiceId(combi.id);
          return;
        }
      }
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
  }, [services, serviceId, therapistId, servicesLoaded, therapistServicesMap, initialService, initialIsRedemption]);
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

      const stMap = new Map<string, Set<string>>();
      const tsMap = new Map<string, Set<string>>();
      const primeScrub = services.find(
        (s) => s.name === "Prime Scrub Massage" || s.name.toLowerCase().includes("scrub")
      );
      const activeScrubId = primeScrub?.id ?? "d5f6ee31-309f-4933-85c5-f2f98f95afba";
      const legacyScrubIds = new Set([
        "326e0b78-49cb-441c-aa03-e54453f2f67f",
        "8c97c5db-eaa9-47b9-89c0-9db114000483",
      ]);

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

  const selectedService = services.find((s) => s.id === serviceId);
  const duration = selectedService?.duration_minutes ?? 0;
  const isMassageService = selectedService?.name !== "Wet Area";
  const isTherapistSelected = !!therapistId;
  const time = useCustomTime ? customTime : slotTime;

  const takenTherapists = useMemo(() => {
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

  const isScrubSelected = selectedService?.name.toLowerCase().includes("scrub");

  // Filter therapists by qualification for the currently selected service
  const qualifiedTherapists = useMemo(() => {
    if (!serviceId) return [];
    if (!servicesLoaded) return therapists;
    let offeringSet = serviceTherapistMap.get(serviceId);
    if ((!offeringSet || offeringSet.size === 0) && isScrubSelected) {
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
  }, [serviceId, therapists, serviceTherapistMap, servicesLoaded, isScrubSelected, services]);

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
    const q = clientQuery.trim().toLowerCase();
    const cleanQ = q.startsWith("@") ? q.slice(1) : q;
    const digitsOnly = q.replace(/\D/g, "");
    return clients
      .filter((c) => {
        const codename = c.codename?.toLowerCase() ?? "";
        const username = c.username?.toLowerCase() ?? "";
        const name = (c as any).name?.toLowerCase() ?? "";
        const phone = c.phone ?? "";
        const phoneDigits = phone.replace(/\D/g, "");

        const nameMatch = codename.includes(q) || codename.includes(cleanQ) || name.includes(q) || name.includes(cleanQ);
        const usernameMatch = username.includes(cleanQ);
        const phoneMatch = (digitsOnly.length >= 3 && phoneDigits.includes(digitsOnly)) || phone.includes(q);

        return nameMatch || usernameMatch || phoneMatch;
      })
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
    if (!isLoyaltyRedemption) {
      setPromoId("none");
    }
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

  const canRedeemLoyalty = !!clientId && (clientPointsBalance ?? 0) >= 100;

  useEffect(() => {
    if (promoId === "redeem_100_pts" && !canRedeemLoyalty && clientPointsBalance !== null) {
      setPromoId("none");
    }
  }, [canRedeemLoyalty, promoId, clientPointsBalance]);

  const isLoyaltyRedemption = promoId === "redeem_100_pts";

  const combiService = services.find((s) => s.name.toLowerCase().includes("combi"));
  const combiCredit = combiService?.price ?? 1100;

  const amount = useMemo(() => {
    const base = selectedService?.price ?? 0;
    let value = base;
    if (isLoyaltyRedemption) {
      value = Math.max(0, base - combiCredit);
    } else if (selectedPromo) {
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
  }, [selectedService, isLoyaltyRedemption, combiCredit, selectedPromo, manualDiscountOn, discountType, discountValue, addonIds, addons]);

  // Service-only paid amount (post-promo/discount, excluding add-ons) — the
  // input to the loyalty formula. Distinct from `amount`, which is what's
  // recorded on the sale and includes add-ons.
  const servicePaidAmount = useMemo(() => {
    const base = selectedService?.price ?? 0;
    if (isLoyaltyRedemption) {
      return Math.max(0, base - combiCredit);
    }
    if (selectedPromo) return Math.max(base - selectedPromo.discount, 0);
    if (manualDiscountOn) {
      return discountType === "pct"
        ? Math.max(Math.round(base * (1 - discountValue / 100)), 0)
        : Math.max(base - discountValue, 0);
    }
    return base;
  }, [selectedService, isLoyaltyRedemption, combiCredit, selectedPromo, manualDiscountOn, discountType, discountValue]);

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

  const pointsDelta = useMemo(() => {
    if (isLoyaltyRedemption) return -100;
    if (!isMassageService) return WET_AREA_POINTS;
    if (!selectedService) return 0;
    return computeLoyaltyPoints(
      loyaltySettings.mode,
      servicePaidAmount,
      selectedService.price,
      selectedService.points_earned,
      loyaltySettings.pesoPerPoint
    );
  }, [
    isLoyaltyRedemption,
    isMassageService,
    selectedService,
    loyaltySettings,
    servicePaidAmount,
  ]);

  const manualDiscountAmount = useMemo(() => {
    if (!manualDiscountOn) return 0;
    const base = selectedService?.price ?? 0;
    return discountType === "pct"
      ? Math.round(base * (discountValue / 100))
      : Math.min(base, discountValue);
  }, [manualDiscountOn, selectedService, discountType, discountValue]);

  const selectedAddons = useMemo(
    () => addons.filter((a) => addonIds.includes(a.id)),
    [addons, addonIds]
  );

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
    (!occupiedLockers.has(lockerNumber) || lockerNumber === activeLockerForClient) &&
    !maintenanceLockers.has(lockerNumber);

  const isPastSlot = isMassageService && !useCustomTime && !!slotTime && pastSlots.has(slotTime);
  const isBookedSlot = isMassageService && !useCustomTime && !!slotTime && takenSlots.has(slotTime);

  const effectiveWalkinTime = isMassageService ? time : roundedNowTime();

  const promoCheck = useMemo((): PromoValidationResult => {
    if (promoId === "none" || isLoyaltyRedemption || !selectedPromo) return { eligible: true };
    return validatePromoEligibility(selectedPromo, {
      bookingDate: date,
      slotTime: effectiveWalkinTime,
      paxCount: 1,
    });
  }, [promoId, isLoyaltyRedemption, selectedPromo, date, effectiveWalkinTime]);

  const isCurrentTherapistQualified = useMemo(() => {
    if (!serviceId || !therapistId) return false;
    if (!servicesLoaded) return true;
    return qualifiedTherapists.some((t) => t.id === therapistId);
  }, [serviceId, therapistId, servicesLoaded, qualifiedTherapists]);

  const canSubmit =
    !isPending &&
    promoCheck.eligible &&
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
        isCurrentTherapistQualified));

  function handleClose() {
    setStep("form");
    setError(null);
    onClose();
  }

  function handleProceedToReview() {
    setError(null);
    if (!clientId && !guestName.trim()) {
      setError("Please select a client or enter a guest name.");
      return;
    }
    if (!serviceId) {
      setError("Please select a service.");
      return;
    }
    if (isMassageService && !therapistId) {
      setError("Please select a therapist.");
      return;
    }
    if (isMassageService && unavailableTherapists.has(therapistId)) {
      setError(`That therapist is ${unavailableTherapists.get(therapistId)} on the selected date.`);
      return;
    }
    if (isMassageService && servicesLoaded && !isCurrentTherapistQualified) {
      setError("The selected therapist does not offer this service.");
      return;
    }
    if (isMassageService && !time) {
      setError("Please select an available time slot, or use a custom time.");
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
    if (hasClientSlotConflict) {
      setError(`This client already has a booking at ${fmtTime(time)}. Please select a different time.`);
      return;
    }
    if (isMassageService && (roomNumber === "" || !freeRooms.includes(Number(roomNumber)))) {
      setError("Please select an available room.");
      return;
    }
    if (lockerNumber === "") {
      setError("Please assign a locker.");
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
    if (!promoCheck.eligible) {
      setError(promoCheck.reason || "The selected promo cannot be applied to this booking.");
      return;
    }
    if (isSplitPayment && !isSplitValid) {
      setError(`Sum of Cash Amount (₱${numCash.toLocaleString()}) and GCash Amount (₱${numGcash.toLocaleString()}) must equal required total (₱${amount.toLocaleString()}).`);
      return;
    }
    if (!staffId) {
      setError("Staff session is required to log a walk-in.");
      return;
    }

    setStep("review");
  }

  function handleSubmit() {
    setError(null);
    if (!promoCheck.eligible) {
      setError(promoCheck.reason || "The selected promo cannot be applied to this booking.");
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
      try {
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
          promoId: promoId === "none" || isLoyaltyRedemption ? null : promoId,
          manualDiscountType: manualDiscountOn ? discountType : null,
          manualDiscountValue: manualDiscountOn ? discountValue : null,
          addonIds,
          amount,
          servicePaidAmount,
          paymentMethod,
          isRedemption: isLoyaltyRedemption,
          isSplitPayment,
          splitMethod1: "Cash",
          splitAmount1: numCash,
          splitMethod2: "GCash",
          splitAmount2: numGcash,
          splitCashAmount: isSplitPayment ? numCash : null,
          splitGcashAmount: isSplitPayment ? numGcash : null,
          paymentRef: showRefField ? gcashRef.trim() || null : null,
          staffId,
          notes: notes.trim() || undefined,
        });

        if (!result.ok) {
          setError(result.error);
          showBookingToast({
            title: "Walk-in Failed",
            description: result.error,
          });
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

        if (clientId && result.pointsReason === "unconfigured_formula") {
          setPendingSuccessToast(successToastData);
          setPointsWarning(
            "Walk-in logged, pero WALANG POINTS na-award — hindi pa naka-configure ang loyalty formula sa Settings."
          );
          return;
        }

        setStep("form");
        showBookingToast(successToastData);
        onCreated();
      } catch (err: any) {
        const errorMsg = err?.message || "An unexpected error occurred during quick walk-in.";
        setError(errorMsg);
        showBookingToast({
          title: "Walk-in Failed",
          description: errorMsg,
        });
      }
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
              setStep("form");
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
      <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-4 sm:p-5 max-h-[90vh] overflow-y-auto">
        {step === "form" ? (
          <>
            <h2 className="text-base font-semibold text-foreground">Quick Walk-in</h2>
            <p className="mt-0.5 text-xs text-muted">
              Service, therapist/room (if massage), locker, and payment.
            </p>

        <div className="mt-3 sm:mt-4 space-y-2.5 sm:space-y-3">
          <div>
            <label className="text-xs text-muted" htmlFor="wk-client-search">
              Client <span className="opacity-70">(search if they already have an account)</span>
            </label>
            {clientId ? (
              <div className="space-y-2 mt-1">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 py-2 px-3">
                  <div className="flex flex-col gap-0.5 min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/30">
                        🟢 Linked Member
                      </span>
                    </div>
                    <div className="text-sm font-bold text-foreground truncate">
                      {(selectedClient as any)?.name || selectedClient?.codename || "Member"}{" "}
                      {selectedClient?.username && (
                        <span className="text-muted font-normal">· @{selectedClient.username}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted truncate">
                      {clientPhone || selectedClient?.phone || "No phone"} · ⭐ {clientPointsBalance ?? (selectedClient as any)?.points_balance ?? 0} pts available
                    </div>
                  </div>
                  <div className="shrink-0">
                    {clientLocked ? (
                      initialIsRedemption ? (
                        <span className="rounded bg-amber-500/20 px-2.5 py-1 text-xs font-medium text-amber-300/80 border border-amber-500/20">
                          Locked
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setClientLocked(false);
                            setClientId(null);
                            setClientQuery("");
                          }}
                          className="rounded-md border border-amber-500/30 bg-amber-500/20 px-2.5 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/30 transition-colors"
                        >
                          Change
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setClientId(null);
                          setClientQuery("");
                        }}
                        className="rounded-md border border-amber-500/30 bg-amber-500/20 px-2.5 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/30 transition-colors"
                      >
                        ✕ Clear
                      </button>
                    )}
                  </div>
                </div>

                {selectedClient && !selectedClient.has_portal_account && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 py-1.5 px-2.5 text-xs text-amber-200">
                    <span className="shrink-0 text-sm leading-none text-amber-400">ℹ</span>
                    <div className="space-y-0.5">
                      <p className="font-medium text-amber-300">No Portal Account</p>
                      <p className="text-amber-200/90 leading-relaxed text-[11px]">
                        Client has no online portal account — walk-in booking can be confirmed normally, but loyalty points cannot be earned or redeemed for this visit.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <input
                  id="wk-client-search"
                  type="text"
                  placeholder="Search by name, @username, or phone…"
                  value={clientQuery}
                  onChange={(e) => {
                    setClientQuery(e.target.value);
                  }}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-gold outline-none"
                />
                {clientQuery && (
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
                            className="flex items-center justify-between min-h-[44px] sm:min-h-0 w-full px-3 py-2 text-left text-sm text-foreground hover:bg-gold/10"
                          >
                            <div className="flex flex-col">
                              <span>
                                <span className="font-semibold text-foreground">
                                  {(c as any).name || c.codename}
                                </span>{" "}
                                <span className="text-muted font-normal">@{c.username}</span>
                              </span>
                              {c.phone && (
                                <span className="text-xs text-muted">{c.phone}</span>
                              )}
                            </div>
                            {!c.has_portal_account && (
                              <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300 border border-amber-500/30">
                                No Portal Account
                              </span>
                            )}
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
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
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
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
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
                  className={`mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground ${
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
                    const isOnBreakNow = !!time && !!therapistBreaksMap.get(t.id)?.has(time.slice(0, 5));
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
                          : isOnBreakNow
                          ? " (on break)"
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
                          setRoomNumber("");
                        }}
                        className={`min-h-[40px] sm:min-h-[32px] rounded-md border px-2 py-0.5 sm:py-1 text-xs transition-all flex flex-col items-center justify-center ${
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
                  <p className="mt-1 text-[11px] text-muted">
                    Select a therapist first to see available slots
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-muted">
                    Struck-through slots are already booked or on break. Past slots are disabled.
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
                    className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
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
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground disabled:opacity-50"
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
                          Room {r}{!isFree ? " - Occupied" : ""}
                        </option>
                      );
                    })}
                  </select>
                  <p className="mt-0.5 text-[11px] text-muted">
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
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
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
                onChange={(e) => {
                  onPromoChange(e.target.value);
                  setError(null);
                }}
                disabled={manualDiscountOn}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground disabled:opacity-50"
              >
                <option value="none">No Promo</option>
                {canRedeemLoyalty && (
                  <option value="redeem_100_pts" className="text-gold font-medium">
                    {(selectedService?.price ?? 0) <= combiCredit
                      ? "Loyalty Reward: Redeem 100 pts (Free Service / Fully Covered)"
                      : `Loyalty Reward: Redeem 100 pts (+₱${(selectedService?.price ?? 0) - combiCredit} Upgrade Fee)`}
                  </option>
                )}
                {!canRedeemLoyalty && !!clientId && (
                  <option value="redeem_disabled" disabled className="text-muted">
                    Loyalty Reward: Redeem 100 pts (Requires 100 pts • Current: {clientPointsBalance ?? 0} pts)
                  </option>
                )}
                {promos.map((p) => {
                  const check = validatePromoEligibility(p, {
                    bookingDate: date,
                    slotTime: effectiveWalkinTime,
                    paxCount: 1,
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
              {isLoyaltyRedemption && (
                <div className="mt-1 flex items-center gap-1.5 text-xs text-gold font-medium">
                  <span>🏅</span>
                  <span>
                    100 pts applied (-₱{combiCredit} credit). Upgrade fee: ₱{Math.max(0, (selectedService?.price ?? 0) - combiCredit)}
                  </span>
                </div>
              )}
              {promoId !== "none" && !isLoyaltyRedemption && !promoCheck.eligible && (
                <div className="mt-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300 font-medium">
                  ⚠ {promoCheck.reason}
                </div>
              )}
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
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
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
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
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
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-gold outline-none"
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
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground opacity-70"
                  />
                </div>
              )}
            </div>

            {isSplitPayment && (
              <div className="mt-2.5 space-y-2 rounded-md border border-border/80 bg-background/50 p-2.5">
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
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-gold outline-none font-mono"
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
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-gold outline-none font-mono"
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
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
              />
            </div>
          )}


          <div>
            <label className="text-xs text-muted" htmlFor="wk-notes">
              Notes / Vehicle Info <span className="opacity-70">(optional)</span>
            </label>
            <input
              id="wk-notes"
              type="text"
              placeholder="e.g. Vios ABC-123 blocking slot 2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-stone-500 focus:border-gold outline-none"
            />
          </div>

          {error && (
            <p
              ref={errorRef}
              className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm sm:text-xs text-red-300"
            >
              {error}
            </p>
          )}
        </div>

        {/* Modal Actions */}
        <div className="sticky bottom-0 sm:static mt-4 sm:mt-5 -mx-4 sm:mx-0 -mb-4 sm:mb-0 flex gap-3 bg-surface px-4 sm:px-0 py-3 sm:py-0">
          <button
            type="button"
            onClick={handleClose}
            disabled={isPending}
            className="flex-1 rounded-md border border-border px-4 py-2 text-sm text-foreground hover:border-gold/30 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleProceedToReview}
            disabled={!canSubmit || isPending}
            className="flex-[1.4] rounded-md border border-gold bg-gold px-4 py-2 text-sm font-semibold text-black hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Review Booking →
          </button>
        </div>
      </>
    ) : (
      <>
        <h2 className="text-base font-semibold text-foreground">Confirm Walk-in Details</h2>
        <p className="mt-0.5 text-xs text-muted">
          Review the walk-in receipt before saving.
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
                  {selectedClient
                    ? selectedClient.codename
                    : guestName.trim() || "Walk-in Guest"}
                </div>
                {selectedClient?.username && (
                  <div className="text-[11px] text-muted font-normal">
                    @{selectedClient.username}
                  </div>
                )}
                {selectedClient?.phone && (
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
                {fmtDate(date)} · {time ? fmtTime(time) : (isMassageService ? "—" : fmtTime(roundedNowTime()))}
              </span>
            </div>

            {/* Therapist */}
            <div className="flex items-center justify-between border-b border-[#292524] pb-3">
              <span className="text-muted text-[11px]">Therapist</span>
              <span className="font-medium text-gold text-xs sm:text-sm">
                {isMassageService
                  ? (therapists.find((t) => t.id === therapistId)?.name ?? "—")
                  : "None / Wet Area"}
              </span>
            </div>

            {/* Assignment */}
            <div className="flex items-center justify-between border-b border-[#292524] pb-3">
              <span className="text-muted text-[11px]">Assignment</span>
              <div className="text-right">
                <div className="font-semibold text-accent-gold text-xs sm:text-sm">
                  {isMassageService ? (roomNumber !== "" ? `Room ${roomNumber}` : "—") : "None / Wet Area"}
                  {" · "}
                  {typeof lockerNumber === "number" ? `Locker ${lockerNumber}` : "—"}
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
                  ₱{(selectedService?.price ?? 0).toLocaleString()}
                </span>
              </div>

              {isLoyaltyRedemption && (
                <div className="flex items-center justify-between text-amber-400 text-xs">
                  <span>Loyalty Credit (100 pts)</span>
                  <span className="font-mono">
                    -₱{Math.min(selectedService?.price ?? 0, combiCredit).toLocaleString()}
                  </span>
                </div>
              )}

              {selectedPromo && !isLoyaltyRedemption && (
                <div className="flex items-center justify-between text-emerald-400 text-xs">
                  <span>Promo Discount ({selectedPromo.label})</span>
                  <span className="font-mono">
                    -₱{Math.min(selectedService?.price ?? 0, selectedPromo.discount).toLocaleString()}
                  </span>
                </div>
              )}

              {manualDiscountOn && (
                <div className="flex items-center justify-between text-emerald-400 text-xs">
                  <span>
                    Manual Discount ({discountType === "pct" ? `${discountValue}%` : "Fixed"})
                  </span>
                  <span className="font-mono">
                    -₱{manualDiscountAmount.toLocaleString()}
                  </span>
                </div>
              )}

              {selectedAddons.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-muted text-xs">
                  <span>Add-on: {a.name}</span>
                  <span className="font-mono text-foreground">
                    +₱{a.price.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>

            {/* Total Amount Due & Reward Points Presentation */}
            <div className="rounded-lg bg-background/60 border border-[#292524] p-3.5 space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted">
                  TOTAL AMOUNT DUE
                </span>
                <span className="font-mono text-2xl sm:text-3xl font-bold text-amber-400">
                  ₱{amount.toLocaleString()}
                </span>
              </div>

              <div className="flex items-center justify-end pt-1">
                {!clientId ? (
                  <span className="text-[11px] text-muted italic">— (Walk-in / no points earned)</span>
                ) : selectedClient && !selectedClient.has_portal_account ? (
                  <span className="text-[11px] text-amber-400/80">0 pts (No portal account)</span>
                ) : isLoyaltyRedemption ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300">
                    <span>⭐</span> -100 pts redeemed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300">
                    <span>⭐</span> +{pointsDelta ?? 0} pts to earn
                  </span>
                )}
              </div>
            </div>

            {/* Payment Mode */}
            <div className="flex items-center justify-between border-b border-[#292524] pb-3 text-xs">
              <span className="text-muted text-[11px]">Payment Mode</span>
              <span className="font-mono text-foreground font-medium text-right">
                {paymentMethod === "Cash"
                  ? "Cash"
                  : paymentMethod === "GCash"
                  ? `GCash${gcashRef.trim() ? ` (Ref: ${gcashRef.trim()})` : ""}`
                  : `Split (Cash: ₱${numCash.toLocaleString()} | GCash: ₱${numGcash.toLocaleString()}${gcashRef.trim() ? ` · Ref: ${gcashRef.trim()}` : ""})`}
              </span>
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
              setError(null);
              setStep("form");
            }}
            disabled={isPending}
            className="flex-1 rounded-md border border-border px-4 py-2.5 text-sm text-foreground hover:border-gold/30 disabled:opacity-50"
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
              "Confirm & Check In"
            )}
          </button>
        </div>
      </>
    )}
      </div>
    </div>
  );
}
