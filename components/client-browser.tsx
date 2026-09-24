"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogVisitModal } from "@/components/log-visit-modal";
import { QuickWalkinModal } from "@/components/quick-walkin-modal";
import { useStaffSim } from "@/lib/staff-context";
import { computeLoyaltyPoints, WET_AREA_POINTS, type LoyaltyFormulaMode } from "@/lib/loyalty";
import { showBookingToast } from "@/components/booking-form-modal";
import { OfflineCsvImportModal } from "@/components/offline-csv-import-modal";
import {
  requestWalkinClaim,
  approveWalkinClaim,
  approveAllWalkinClaims,
  rejectWalkinClaim,
  adjustClientPoints,
  updateClientNotes,
} from "@/app/(staff)/clients/actions";

export type PendingClaim = {
  id: string;
  booking_id: string;
  target_client_id: string;
  target_client_codename: string;
  target_client_username: string;
  target_client_member_code: string;
  walkin_codename: string | null;
  guest_label?: string | null;
  points_to_credit: number;
  status: string;
  created_at: string;
  requested_by_staff_name: string;
  booking_date: string;
  start_time: string | null;
  service_name: string | null;
  therapist_name: string | null;
  locker_number: number | null;
  amount: number | null;
  payment_method: string | null;
};

export type PendingClaimRow = PendingClaim;

export type Client = {
  id: string;
  codename: string;
  username: string;
  member_code: string;
  points_balance: number;
  since_date: string;
  phone?: string | null;
  qr_token?: string | null;
  has_portal_account: boolean;
  notes?: string | null;
};

export type WalkInVisit = {
  id: string;
  guest_label: string;
  booking_date: string;
  start_time: string;
  room_number?: number | null;
  status: string;
  created_at: string;
  service_name: string | null;
  therapist_name: string | null;
  locker_number: number | null;
  amount: number | null;
  payment_method: string | null;
};

export type MemberVisit = {
  id: string;
  client_id: string;
  date: string;
  time: string | null;
  service_name: string | null;
  therapist_name: string | null;
  locker_number: number | null;
  amount: number | null;
  payment_method: string | null;
  points_delta: number;
  entry_type: string;
  created_at: string;
};

type Service = {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
  points_earned: number;
};
type Staff = { id: string; name: string; position: string };

type Therapist = { id: string; name: string };
type Promo = {
  id: string;
  label: string;
  discount: number;
  applicable_days?: string[] | null;
  applicable_slots?: string[] | null;
  min_pax?: number | null;
};
type Addon = { id: string; name: string; price: number };

type GroupedWalkIn = {
  codename: string;
  visitCount: number;
  lastVisitDate: string;
  latestVisit: WalkInVisit;
  visits: WalkInVisit[];
};

function formatSinceDate(iso: string) {
  if (!iso) return "N/A";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatDisplayDate(dateStr: string) {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr + (dateStr.includes("T") ? "" : "T00:00:00"));
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(timeStr: string | null | undefined) {
  if (!timeStr) return "";
  const parts = timeStr.split(":");
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return timeStr;

  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// QR-code renderer using a free API
function QRImage({ value, size = 160 }: { value: string; size?: number }) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(value)}&size=${size}x${size}&margin=8&bgcolor=1a1a1a&color=c89b3c`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="QR Code" width={size} height={size} className="rounded-lg" />
  );
}

export function ClientBrowser({
  clients = [],
  walkInVisits = [],
  pendingClaims = [],
  loyaltySettings = { mode: "proportional", pesoPerPoint: null },
  allowWalkinClaims = false,
  memberTransactions = [],
  memberBookings = [],
  services = [],
  staff = [],
  therapists = [],
  promos = [],
  addons = [],
  lockers = [],
  clientLockerMap: initialLockerMap = {},
}: {
  clients?: Client[];
  walkInVisits?: WalkInVisit[];
  pendingClaims?: PendingClaim[];
  loyaltySettings?: { mode: string; pesoPerPoint: number | null };
  allowWalkinClaims?: boolean;
  memberTransactions?: any[];
  memberBookings?: any[];
  services?: Service[];
  staff?: Staff[];
  therapists?: Therapist[];
  promos?: Promo[];
  addons?: Addon[];
  lockers?: number[];
  clientLockerMap?: Record<string, number>;
}) {
  const router = useRouter();
  const { currentRole, sessionStaff } = useStaffSim();
  const canReviewClaims = currentRole === "Supervisor" || currentRole === "Owner";
  const isOwner = currentRole === "Owner" || currentRole?.toLowerCase() === "owner" || sessionStaff?.position?.toLowerCase() === "owner";
  const canImportOffline =
    canReviewClaims ||
    isOwner ||
    sessionStaff?.position === "Supervisor" ||
    sessionStaff?.position === "Owner";

  const [activeTab, setActiveTab] = useState<"members" | "walkins" | "claims">("members");
  const [search, setSearch] = useState("");
  const [showOfflineCsvModal, setShowOfflineCsvModal] = useState(false);

  // Pagination states
  const [membersPageSize, setMembersPageSize] = useState<number>(10);
  const [membersCurrentPage, setMembersCurrentPage] = useState<number>(1);

  const [walkInsPageSize, setWalkInsPageSize] = useState<number>(10);
  const [walkInsCurrentPage, setWalkInsCurrentPage] = useState<number>(1);

  const [claimsPageSize, setClaimsPageSize] = useState<number>(10);
  const [claimsCurrentPage, setClaimsCurrentPage] = useState<number>(1);

  // Modal states for Members
  const [selectedMemberForProfile, setSelectedMemberForProfile] = useState<Client | null>(null);
  const [showClientQr, setShowClientQr] = useState(false);
  const [selectedMemberForHistory, setSelectedMemberForHistory] = useState<{
    client: Client;
    visits: MemberVisit[];
  } | null>(null);

  // Receptionist notes state
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [clientNotesMap, setClientNotesMap] = useState<Record<string, string | null>>({});

  const currentMemberNotes = selectedMemberForProfile
    ? clientNotesMap[selectedMemberForProfile.id] !== undefined
      ? clientNotesMap[selectedMemberForProfile.id]
      : selectedMemberForProfile.notes ?? null
    : null;

  const handleOpenMemberProfile = (client: Client) => {
    setSelectedMemberForProfile(client);
    setIsOpeningAction(null);
    setShowClientQr(false);
    setIsEditingNotes(false);
    setNotesError(null);
    setNoteDraft(clientNotesMap[client.id] !== undefined ? clientNotesMap[client.id] ?? "" : client.notes ?? "");
  };

  const handleSaveNotes = async () => {
    if (!selectedMemberForProfile) return;
    setIsSavingNotes(true);
    setNotesError(null);
    try {
      const res = await updateClientNotes({
        clientId: selectedMemberForProfile.id,
        notes: noteDraft,
      });
      if (!res.ok) {
        setNotesError(res.error);
      } else {
        const updatedNotes = res.notes;
        setClientNotesMap((prev) => ({
          ...prev,
          [selectedMemberForProfile.id]: updatedNotes,
        }));
        setSelectedMemberForProfile((prev) =>
          prev ? { ...prev, notes: updatedNotes } : null
        );
        setIsEditingNotes(false);
      }
    } catch (err: any) {
      setNotesError(err?.message || "Failed to save receptionist notes.");
    } finally {
      setIsSavingNotes(false);
    }
  };

  // Manual points adjustment modal states (Owner only)
  const [showAdjustPointsModal, setShowAdjustPointsModal] = useState(false);
  const [adjustTargetClient, setAdjustTargetClient] = useState<Client | null>(null);
  const [adjustMode, setAdjustMode] = useState<"add" | "deduct">("add");
  const [adjustPointsInput, setAdjustPointsInput] = useState<string>("");
  const [adjustRemarks, setAdjustRemarks] = useState<string>("");
  const [adjustStep, setAdjustStep] = useState<"input" | "confirm">("input");
  const [isSubmittingAdjust, setIsSubmittingAdjust] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // Modal state for Walk-In history drawer
  const [selectedWalkInCodename, setSelectedWalkInCodename] = useState<string | null>(null);

  // Log visit modal state
  const [showLogVisit, setShowLogVisit] = useState(false);
  const [logVisitClient, setLogVisitClient] = useState<Client | null>(null);

  // Quick Walk-in Modal for redemptions
  const [showRedemptionWalkin, setShowRedemptionWalkin] = useState(false);
  const [redemptionClient, setRedemptionClient] = useState<Client | null>(null);
  const [isOpeningAction, setIsOpeningAction] = useState<"redeem" | "logVisit" | null>(null);

  // Claim actions and modal states
  const [approvingClaimId, setApprovingClaimId] = useState<string | null>(null);
  const [rejectingClaimId, setRejectingClaimId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const [showApproveAllModal, setShowApproveAllModal] = useState(false);
  const [isApprovingAll, setIsApprovingAll] = useState(false);
  const [bulkApproveFeedback, setBulkApproveFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  // Claim Past Walk-in Modal (initiated from Member Profile drawer)
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [claimSearch, setClaimSearch] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState<WalkInVisit | null>(null);
  const [isSubmittingClaim, setIsSubmittingClaim] = useState(false);
  const [claimFeedback, setClaimFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  // Live locker map (updated by realtime)
  const [lockerMap, setLockerMap] = useState<Record<string, number>>(initialLockerMap);

  // Reset pagination when search or page sizes change
  useEffect(() => {
    setMembersCurrentPage(1);
    setWalkInsCurrentPage(1);
    setClaimsCurrentPage(1);
  }, [search, membersPageSize, walkInsPageSize, claimsPageSize]);

  // Compute preview points helper
  const computeCandidatePoints = (v: WalkInVisit): number => {
    if (v.service_name === "Wet Area") return WET_AREA_POINTS;
    const svc = services.find((s) => s.name === v.service_name);
    const fullPrice = svc?.price ? Number(svc.price) : (v.amount != null ? Number(v.amount) : 0);
    const basePoints = svc?.points_earned ? Number(svc.points_earned) : 0;
    const paid = v.amount != null ? Number(v.amount) : fullPrice;
    return computeLoyaltyPoints(
      (loyaltySettings?.mode ?? "proportional") as LoyaltyFormulaMode,
      paid,
      fullPrice,
      basePoints,
      loyaltySettings?.pesoPerPoint ?? null
    );
  };

  // Aggregate member visits from point_transactions and memberBookings
  const memberVisitsMap = useMemo(() => {
    const map = new Map<string, MemberVisit[]>();
    const txBookingIds = new Set<string>();

    for (const tx of memberTransactions) {
      if (!tx.client_id) continue;
      if (tx.booking_id) txBookingIds.add(tx.booking_id);

      const sale = Array.isArray(tx.sales) ? tx.sales[0] : tx.sales;
      const booking = Array.isArray(tx.bookings) ? tx.bookings[0] : tx.bookings;
      const bkLocker = booking?.locker_occupancy
        ? Array.isArray(booking.locker_occupancy)
          ? booking.locker_occupancy[0]?.locker_number
          : booking.locker_occupancy.locker_number
        : null;

      let serviceName: string | null =
        sale?.services?.name ?? booking?.services?.name ?? null;

      if (!serviceName && tx.notes) {
        if (tx.notes.startsWith("Visit: ")) {
          serviceName = tx.notes.replace("Visit: ", "");
        } else if (tx.notes.startsWith("Redemption: ")) {
          serviceName = tx.notes.replace("Redemption: ", "");
        } else {
          serviceName = tx.notes;
        }
      }

      const therapistName: string | null =
        sale?.therapists?.name ?? booking?.therapists?.name ?? null;

      const date =
        booking?.booking_date ??
        (tx.created_at ? tx.created_at.split("T")[0] : "");
      const time =
        booking?.start_time ??
        (tx.created_at ? tx.created_at.split("T")[1]?.slice(0, 5) : null);

      const visit: MemberVisit = {
        id: tx.id,
        client_id: tx.client_id,
        date,
        time,
        service_name: serviceName,
        therapist_name: therapistName,
        locker_number: bkLocker ?? null,
        amount: sale?.amount ?? null,
        payment_method: sale?.payment_method ?? null,
        points_delta: tx.points_delta ?? 0,
        entry_type: tx.entry_type ?? "VISIT",
        created_at: tx.created_at,
      };

      const existing = map.get(tx.client_id) ?? [];
      existing.push(visit);
      map.set(tx.client_id, existing);
    }

    for (const bk of memberBookings) {
      if (!bk.client_id || txBookingIds.has(bk.id)) continue;

      const svc = Array.isArray(bk.services) ? bk.services[0] : bk.services;
      const thera = Array.isArray(bk.therapists) ? bk.therapists[0] : bk.therapists;
      const sale = Array.isArray(bk.sales) ? bk.sales[0] : bk.sales;
      const occ = Array.isArray(bk.locker_occupancy) ? bk.locker_occupancy[0] : bk.locker_occupancy;

      const visit: MemberVisit = {
        id: bk.id,
        client_id: bk.client_id,
        date: bk.booking_date,
        time: bk.start_time,
        service_name: svc?.name ?? null,
        therapist_name: thera?.name ?? null,
        locker_number: occ?.locker_number ?? null,
        amount: sale?.amount ?? null,
        payment_method: sale?.payment_method ?? null,
        points_delta: 0,
        entry_type: bk.status ?? "Booked",
        created_at: bk.created_at,
      };

      const existing = map.get(bk.client_id) ?? [];
      existing.push(visit);
      map.set(bk.client_id, existing);
    }

    // Sort member visits descending by created_at / date
    map.forEach((visits) => {
      visits.sort((a, b) => {
        const timeA = new Date(a.created_at || a.date).getTime();
        const timeB = new Date(b.created_at || b.date).getTime();
        return timeB - timeA;
      });
    });

    return map;
  }, [memberTransactions, memberBookings]);

  // Filter clients for search (by codename, phone, or username)
  const filteredClients = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter((c) =>
      c.codename.toLowerCase().includes(q) ||
      c.username.toLowerCase().includes(q) ||
      (c.phone && c.phone.toLowerCase().includes(q))
    );
  }, [clients, search]);

  // Paginated Members calculations
  const totalMembers = filteredClients.length;
  const totalMembersPages = Math.ceil(totalMembers / membersPageSize) || 1;
  const membersStartIndex = (membersCurrentPage - 1) * membersPageSize;
  const paginatedMembers = useMemo(() => {
    return filteredClients.slice(membersStartIndex, membersStartIndex + membersPageSize);
  }, [filteredClients, membersStartIndex, membersPageSize]);

  // Aggregate non-member walk-ins by codename
  const groupedWalkIns = useMemo(() => {
    const map = new Map<string, WalkInVisit[]>();
    for (const visit of walkInVisits) {
      // Defensive filtering: ensure only completed, in-service, or verified checked-in visits are aggregated
      const normStatus = (visit.status ?? "").trim().toLowerCase();
      const isCompletedOrInService = normStatus === "completed" || normStatus === "in_service";
      const hasLockerOrPayment = visit.locker_number != null || visit.amount != null;

      if (!isCompletedOrInService && !hasLockerOrPayment) {
        continue;
      }
      if ((normStatus === "cancelled" || normStatus === "no-show") && !hasLockerOrPayment) {
        continue;
      }

      const key = visit.guest_label.trim();
      const existing = map.get(key) ?? [];
      existing.push(visit);
      map.set(key, existing);
    }

    const result: GroupedWalkIn[] = [];
    map.forEach((visits, codename) => {
      if (visits.length === 0) return;

      const sorted = [...visits].sort((a, b) => {
        const dateA = new Date(`${a.booking_date}T${a.start_time || "00:00:00"}`).getTime();
        const dateB = new Date(`${b.booking_date}T${b.start_time || "00:00:00"}`).getTime();
        return dateB - dateA;
      });

      result.push({
        codename,
        visitCount: sorted.length,
        lastVisitDate: sorted[0].booking_date,
        latestVisit: sorted[0],
        visits: sorted,
      });
    });

    return result.sort((a, b) => {
      const dateA = new Date(a.lastVisitDate).getTime();
      const dateB = new Date(b.lastVisitDate).getTime();
      return dateB - dateA;
    });
  }, [walkInVisits]);

  // Filter walk-ins for search (by codename or date)
  const filteredWalkIns = useMemo(() => {
    if (!search.trim()) return groupedWalkIns;
    const q = search.toLowerCase();
    return groupedWalkIns.filter((g) => {
      if (g.codename.toLowerCase().includes(q)) return true;
      return g.visits.some(
        (v) =>
          v.booking_date.toLowerCase().includes(q) ||
          formatDisplayDate(v.booking_date).toLowerCase().includes(q)
      );
    });
  }, [groupedWalkIns, search]);

  // Paginated Walk-In slice calculations
  const totalWalkIns = filteredWalkIns.length;
  const totalWalkInPages = Math.ceil(totalWalkIns / walkInsPageSize) || 1;
  const walkInsStartIndex = (walkInsCurrentPage - 1) * walkInsPageSize;
  const paginatedWalkIns = useMemo(() => {
    return filteredWalkIns.slice(walkInsStartIndex, walkInsStartIndex + walkInsPageSize);
  }, [filteredWalkIns, walkInsStartIndex, walkInsPageSize]);

  // Selected Walk-In drawer record
  const activeWalkInGroup = useMemo(() => {
    if (!selectedWalkInCodename) return null;
    return groupedWalkIns.find((g) => g.codename === selectedWalkInCodename) ?? null;
  }, [groupedWalkIns, selectedWalkInCodename]);

  // Realtime: subscribe to locker_occupancy changes so locker badges update live
  useEffect(() => {
    const supabase = createClient();

    function rebuildMap() {
      supabase
        .from("locker_occupancy")
        .select("client_id, locker_number")
        .is("checked_out_at", null)
        .not("client_id", "is", null)
        .then(({ data }) => {
          const map: Record<string, number> = {};
          for (const row of data ?? []) {
            if (row.client_id) map[row.client_id] = row.locker_number;
          }
          setLockerMap(map);
        });
    }

    const channel = supabase
      .channel("locker_occupancy_live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "locker_occupancy" },
        () => rebuildMap()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Filtered and Paginated Pending Claims
  const filteredPendingClaims = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pendingClaims;
    return pendingClaims.filter((c) => {
      return (
        c.target_client_codename.toLowerCase().includes(q) ||
        c.target_client_username.toLowerCase().includes(q) ||
        c.target_client_member_code.toLowerCase().includes(q) ||
        (c.walkin_codename && c.walkin_codename.toLowerCase().includes(q)) ||
        (c.guest_label && c.guest_label.toLowerCase().includes(q)) ||
        c.requested_by_staff_name.toLowerCase().includes(q) ||
        c.booking_date.includes(q) ||
        (c.service_name && c.service_name.toLowerCase().includes(q)) ||
        (c.therapist_name && c.therapist_name.toLowerCase().includes(q)) ||
        (c.locker_number != null && c.locker_number.toString().includes(q))
      );
    });
  }, [pendingClaims, search]);

  const totalPendingClaims = filteredPendingClaims.length;
  const totalClaimsPages = Math.ceil(totalPendingClaims / claimsPageSize) || 1;
  const claimsStartIndex = (claimsCurrentPage - 1) * claimsPageSize;
  const paginatedPendingClaims = useMemo(() => {
    return filteredPendingClaims.slice(claimsStartIndex, claimsStartIndex + claimsPageSize);
  }, [filteredPendingClaims, claimsStartIndex, claimsPageSize]);

  // Candidate visits for Claim modal (filtered by claimSearch)
  const candidateWalkIns = useMemo(() => {
    const q = claimSearch.trim().toLowerCase();
    if (!q) return walkInVisits;
    return walkInVisits.filter((v) => {
      return (
        v.guest_label.toLowerCase().includes(q) ||
        v.booking_date.includes(q) ||
        (v.locker_number != null && v.locker_number.toString().includes(q)) ||
        (v.service_name && v.service_name.toLowerCase().includes(q)) ||
        (v.therapist_name && v.therapist_name.toLowerCase().includes(q))
      );
    });
  }, [walkInVisits, claimSearch]);

  const totalPointsToCreditAll = useMemo(() => {
    return pendingClaims.reduce((sum, c) => sum + (c.points_to_credit ?? 0), 0);
  }, [pendingClaims]);

  async function handleApproveSingle(claimId: string) {
    if (approvingClaimId || rejectingClaimId) return;
    setApprovingClaimId(claimId);
    setActionFeedback(null);
    try {
      const res = await approveWalkinClaim(claimId);
      if (!res.ok) {
        setActionFeedback({ ok: false, message: res.error });
      } else {
        setActionFeedback({ ok: true, message: "Claim approved successfully! Points credited and visit linked." });
        router.refresh();
      }
    } catch (err: any) {
      setActionFeedback({ ok: false, message: err?.message || "Failed to approve claim." });
    } finally {
      setApprovingClaimId(null);
    }
  }

  async function handleRejectSingle(claimId: string) {
    if (approvingClaimId || rejectingClaimId) return;
    setRejectingClaimId(claimId);
    setActionFeedback(null);
    try {
      const res = await rejectWalkinClaim(claimId);
      if (!res.ok) {
        setActionFeedback({ ok: false, message: res.error });
      } else {
        setActionFeedback({ ok: true, message: "Claim rejected. Walk-in visit restored to available pool." });
        router.refresh();
      }
    } catch (err: any) {
      setActionFeedback({ ok: false, message: err?.message || "Failed to reject claim." });
    } finally {
      setRejectingClaimId(null);
    }
  }

  async function handleApproveAllConfirm() {
    if (isApprovingAll) return;
    setIsApprovingAll(true);
    setBulkApproveFeedback(null);
    try {
      const res = await approveAllWalkinClaims();
      if (res.ok) {
        setBulkApproveFeedback({
          ok: true,
          message: `Approved all ${res.count} pending claims (+${res.pointsTotal} pts total credited)!`,
        });
        setTimeout(() => {
          setShowApproveAllModal(false);
          setBulkApproveFeedback(null);
          router.refresh();
        }, 1200);
      } else {
        setBulkApproveFeedback({ ok: false, message: res.error });
      }
    } catch (err: any) {
      setBulkApproveFeedback({ ok: false, message: err?.message || "Failed to bulk approve claims." });
    } finally {
      setIsApprovingAll(false);
    }
  }

  async function handleSubmitClaim() {
    if (isSubmittingClaim) return;
    if (!selectedCandidate || !selectedMemberForProfile) return;
    if (!allowWalkinClaims) {
      setClaimFeedback({
        ok: false,
        message: "Past walk-in claims are currently disabled.",
      });
      return;
    }
    setIsSubmittingClaim(true);
    setClaimFeedback(null);

    try {
      const res = await requestWalkinClaim({
        bookingId: selectedCandidate.id,
        targetClientId: selectedMemberForProfile.id,
      });

      if (res.ok) {
        setClaimFeedback({
          ok: true,
          message: "Claim request submitted! It is now pending Owner / Supervisor review.",
        });
        setTimeout(() => {
          setShowClaimModal(false);
          setSelectedCandidate(null);
          setClaimFeedback(null);
          setSelectedMemberForProfile(null);
          router.refresh();
        }, 1200);
      } else {
        setClaimFeedback({ ok: false, message: res.error });
      }
    } catch (err: any) {
      setClaimFeedback({ ok: false, message: err?.message || "Failed to submit claim request." });
    } finally {
      setIsSubmittingClaim(false);
    }
  }

  const handleOpenAdjustPoints = (client: Client) => {
    setAdjustTargetClient(client);
    setAdjustMode("add");
    setAdjustPointsInput("");
    setAdjustRemarks("");
    setAdjustStep("input");
    setAdjustError(null);
    setShowAdjustPointsModal(true);
  };

  const handleCloseAdjustPoints = () => {
    if (isSubmittingAdjust) return;
    setShowAdjustPointsModal(false);
    setAdjustTargetClient(null);
    setAdjustPointsInput("");
    setAdjustRemarks("");
    setAdjustStep("input");
    setAdjustError(null);
  };

  const handleReviewAdjustment = () => {
    const parsed = parseInt(adjustPointsInput, 10);
    if (isNaN(parsed) || parsed <= 0) {
      setAdjustError("Please enter a valid positive number of points.");
      return;
    }
    const currentBal = adjustTargetClient?.points_balance ?? 0;
    if (adjustMode === "deduct" && parsed > currentBal) {
      setAdjustError(`Cannot deduct more than available balance (${currentBal} pts). Balance cannot be negative.`);
      return;
    }
    setAdjustError(null);
    setAdjustStep("confirm");
  };

  const handleConfirmAdjustment = async () => {
    if (isSubmittingAdjust) return;
    if (!adjustTargetClient) return;
    const parsed = parseInt(adjustPointsInput, 10);
    if (isNaN(parsed) || parsed <= 0) {
      setAdjustError("Invalid points amount.");
      return;
    }
    const delta = adjustMode === "add" ? parsed : -parsed;

    setIsSubmittingAdjust(true);
    setAdjustError(null);

    try {
      const res = await adjustClientPoints({
        clientId: adjustTargetClient.id,
        pointsDelta: delta,
        remarks: adjustRemarks.trim() || undefined,
      });

      if (!res.ok) {
        setAdjustError(res.error);
        setIsSubmittingAdjust(false);
        return;
      }

      showBookingToast({
        title: "Points Adjusted",
        description: `Successfully adjusted points for ${adjustTargetClient.codename}: ${delta > 0 ? `+${delta}` : delta} pts (New balance: ${res.newBalance} pts).`,
      });

      // Update in selectedMemberForProfile so open drawer immediately reflects new balance
      if (selectedMemberForProfile && selectedMemberForProfile.id === adjustTargetClient.id) {
        setSelectedMemberForProfile({
          ...selectedMemberForProfile,
          points_balance: res.newBalance,
        });
      }

      handleCloseAdjustPoints();
      router.refresh();
    } catch (err: any) {
      setAdjustError(err?.message || "An unexpected error occurred while adjusting points.");
    } finally {
      setIsSubmittingAdjust(false);
    }
  };

  return (
    <div className="mt-6 flex flex-col gap-5">
      {/* Top-level tab switcher */}
      <div className="flex border-b border-border">
        <button
          type="button"
          onClick={() => {
            setActiveTab("members");
            setSearch("");
            setActionFeedback(null);
          }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
            activeTab === "members"
              ? "border-gold text-gold"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          <span>Members</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              activeTab === "members"
                ? "bg-gold/20 text-gold"
                : "bg-surface-accent text-muted"
            }`}
          >
            {clients.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("walkins");
            setSearch("");
            setActionFeedback(null);
          }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
            activeTab === "walkins"
              ? "border-gold text-gold"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          <span>Walk-In Without Account</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              activeTab === "walkins"
                ? "bg-gold/20 text-gold"
                : "bg-surface-accent text-muted"
            }`}
          >
            {groupedWalkIns.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("claims");
            setSearch("");
            setActionFeedback(null);
          }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
            activeTab === "claims"
              ? "border-gold text-gold"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          <span>Pending Claims</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              activeTab === "claims"
                ? "bg-gold/20 text-gold font-bold"
                : pendingClaims.length > 0
                ? "bg-gold/20 text-gold font-semibold"
                : "bg-surface-accent text-muted"
            }`}
          >
            {pendingClaims.length}
          </span>
        </button>
      </div>

      {/* Search and Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              activeTab === "members"
                ? "Search by codename, phone, or @username..."
                : activeTab === "walkins"
                ? "Search by guest codename (e.g. Wax, Marky) or date..."
                : "Search claims by member, codename, staff, or service..."
            }
            className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted focus:border-gold/50 focus:outline-none"
          />
        </div>

        {canImportOffline && (
          <button
            type="button"
            onClick={() => setShowOfflineCsvModal(true)}
            className="flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3.5 py-2 text-xs font-semibold text-gold hover:bg-gold/20 hover:border-gold transition-colors cursor-pointer self-start sm:self-auto shrink-0 shadow-sm"
          >
            <span>📥 Import Offline CSV</span>
          </button>
        )}
      </div>

      {/* MEMBERS TAB */}
      {activeTab === "members" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
              Registered Member Accounts ({filteredClients.length})
            </p>
          </div>

          {filteredClients.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface p-8 text-center text-sm text-muted">
              {search.trim() ? "No members match your search." : "No registered member accounts currently on file."}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-lg border border-border bg-surface">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-surface-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-4 py-3">Member</th>
                      <th className="px-4 py-3">Username</th>
                      <th className="px-4 py-3">Member Since</th>
                      <th className="px-4 py-3">Points</th>
                      <th className="px-4 py-3">Total Visits</th>
                      <th className="px-4 py-3">Latest Service</th>
                      <th className="px-4 py-3">Latest Therapist</th>
                      <th className="px-4 py-3 text-right">Actions / Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-foreground">
                    {paginatedMembers.map((client) => {
                      const locker = lockerMap[client.id];
                      const visits = memberVisitsMap.get(client.id) ?? [];
                      const visitCount = visits.length;
                      const latest = visits[0];
                      const latestService = latest?.service_name ?? null;
                      const latestTherapist = latest?.therapist_name ?? null;

                      return (
                        <tr
                          key={client.id}
                          className="hover:bg-gold/5 transition-colors"
                        >
                          <td className="px-4 py-3 font-semibold text-gold">
                            <div className="flex items-center gap-2">
                              <span>{client.codename}</span>
                              {locker !== undefined && (
                                <span className="rounded border border-gold/50 bg-gold/10 px-1.5 py-0.5 text-[10px] font-semibold text-gold">
                                  Locker {locker}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <span className="rounded bg-surface-accent px-2 py-0.5 font-mono text-xs text-foreground">
                              @{client.username}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted">
                            {formatSinceDate(client.since_date)}
                          </td>
                          <td className="px-4 py-3 text-xs font-semibold text-gold">
                            {client.points_balance} pts
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <span className="rounded bg-surface-accent px-2 py-0.5 font-mono text-[11px] font-medium text-foreground">
                              {visitCount} visit{visitCount !== 1 ? "s" : ""}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs font-medium">
                            {latestService ?? <span className="text-muted italic">None</span>}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {latestTherapist ?? <span className="text-muted italic">Unassigned</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-xs">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenMemberProfile(client)}
                                className="rounded border border-border bg-surface px-2.5 py-1 font-medium text-gold hover:border-gold/40 hover:bg-gold/10 transition-colors cursor-pointer"
                              >
                                View Profile →
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedMemberForHistory({ client, visits })}
                                className="rounded border border-gold/40 bg-gold/10 px-2.5 py-1 font-medium text-gold hover:bg-gold/20 transition-colors cursor-pointer"
                              >
                                View Past Stays →
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Members Pagination Controls Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-lg border border-border bg-surface p-4 text-sm">
                <div className="text-xs text-muted">
                  Showing <span className="font-medium text-foreground">{membersStartIndex + 1}</span>–
                  <span className="font-medium text-foreground">
                    {Math.min(membersStartIndex + membersPageSize, totalMembers)}
                  </span>{" "}
                  of <span className="font-medium text-foreground">{totalMembers}</span> members
                </div>

                <div className="flex flex-wrap items-center gap-6">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted">Rows per page:</span>
                    <select
                      value={membersPageSize}
                      onChange={(e) => setMembersPageSize(Number(e.target.value))}
                      className="rounded-md border border-[#292524] bg-[#141210] px-2.5 py-1 text-xs text-[#f5f5f4] focus:border-gold/50 focus:outline-none"
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={membersCurrentPage <= 1}
                      onClick={() => setMembersCurrentPage((p) => Math.max(1, p - 1))}
                      className="rounded-md border border-border bg-surface px-3 py-1 text-xs font-medium text-foreground hover:border-gold/30 disabled:cursor-not-allowed disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      Previous
                    </button>
                    <span className="text-xs text-muted">
                      Page <span className="font-medium text-foreground">{membersCurrentPage}</span> of{" "}
                      <span className="font-medium text-foreground">{totalMembersPages}</span>
                    </span>
                    <button
                      type="button"
                      disabled={membersCurrentPage >= totalMembersPages}
                      onClick={() => setMembersCurrentPage((p) => Math.min(totalMembersPages, p + 1))}
                      className="rounded-md border border-border bg-surface px-3 py-1 text-xs font-medium text-foreground hover:border-gold/30 disabled:cursor-not-allowed disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* WALK-IN WITHOUT ACCOUNT TAB */}
      {activeTab === "walkins" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
              Non-Account Walk-In Guests ({filteredWalkIns.length})
            </p>
            <p className="text-xs text-muted">
              Duplicate guest codenames are preserved independently without identity merge.
            </p>
          </div>

          {filteredWalkIns.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface p-8 text-center text-sm text-muted">
              {search.trim() ? "No walk-in guests match your search." : "No walk-in guest records found."}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-lg border border-border bg-surface">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-surface-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-4 py-3">Codename</th>
                      <th className="px-4 py-3">Last Visit Date</th>
                      <th className="px-4 py-3">Total Visits</th>
                      <th className="px-4 py-3">Latest Service</th>
                      <th className="px-4 py-3">Latest Therapist</th>
                      <th className="px-4 py-3">Locker</th>
                      <th className="px-4 py-3">Amount Paid</th>
                      <th className="px-4 py-3 text-right">History</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-foreground">
                    {paginatedWalkIns.map((g) => {
                      const latest = g.latestVisit;
                      const displayLocker =
                        latest.locker_number ??
                        g.visits.find((v) => v.locker_number != null)?.locker_number ??
                        null;

                      return (
                        <tr
                          key={g.codename}
                          className="hover:bg-gold/5 transition-colors cursor-pointer"
                          onClick={() => setSelectedWalkInCodename(g.codename)}
                        >
                          <td className="px-4 py-3 font-semibold text-gold">
                            {g.codename}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted">
                            {formatDisplayDate(g.lastVisitDate)}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <span className="rounded bg-surface-accent px-2 py-0.5 font-mono text-[11px] font-medium text-foreground">
                              {g.visitCount} visit{g.visitCount > 1 ? "s" : ""}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs font-medium">
                            {latest.service_name ?? <span className="text-muted italic">Wet Area / None</span>}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {latest.therapist_name ?? <span className="text-muted italic">Unassigned</span>}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono">
                            {displayLocker != null ? (
                              <span className="rounded border border-gold/30 bg-gold/10 px-1.5 py-0.5 text-gold">
                                Locker {displayLocker}
                              </span>
                            ) : (
                              <span className="text-muted italic">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs font-medium">
                            {latest.amount != null ? (
                              <span>
                                ₱{Number(latest.amount).toLocaleString()}{" "}
                                {latest.payment_method && (
                                  <span className="text-muted text-[10px]">({latest.payment_method})</span>
                                )}
                              </span>
                            ) : (
                              <span className="text-muted italic">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-xs">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedWalkInCodename(g.codename);
                              }}
                              className="rounded border border-gold/40 bg-gold/10 px-2.5 py-1 font-medium text-gold hover:bg-gold/20 transition-colors cursor-pointer"
                            >
                              View Past Stays →
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Walk-In Pagination Controls Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-lg border border-border bg-surface p-4 text-sm">
                <div className="text-xs text-muted">
                  Showing <span className="font-medium text-foreground">{walkInsStartIndex + 1}</span>–
                  <span className="font-medium text-foreground">
                    {Math.min(walkInsStartIndex + walkInsPageSize, totalWalkIns)}
                  </span>{" "}
                  of <span className="font-medium text-foreground">{totalWalkIns}</span> guests
                </div>

                <div className="flex flex-wrap items-center gap-6">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted">Rows per page:</span>
                    <select
                      value={walkInsPageSize}
                      onChange={(e) => setWalkInsPageSize(Number(e.target.value))}
                      className="rounded-md border border-[#292524] bg-[#141210] px-2.5 py-1 text-xs text-[#f5f5f4] focus:border-gold/50 focus:outline-none"
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={walkInsCurrentPage <= 1}
                      onClick={() => setWalkInsCurrentPage((p) => Math.max(1, p - 1))}
                      className="rounded-md border border-border bg-surface px-3 py-1 text-xs font-medium text-foreground hover:border-gold/30 disabled:cursor-not-allowed disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      Previous
                    </button>
                    <span className="text-xs text-muted">
                      Page <span className="font-medium text-foreground">{walkInsCurrentPage}</span> of{" "}
                      <span className="font-medium text-foreground">{totalWalkInPages}</span>
                    </span>
                    <button
                      type="button"
                      disabled={walkInsCurrentPage >= totalWalkInPages}
                      onClick={() => setWalkInsCurrentPage((p) => Math.min(totalWalkInPages, p + 1))}
                      className="rounded-md border border-border bg-surface px-3 py-1 text-xs font-medium text-foreground hover:border-gold/30 disabled:cursor-not-allowed disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PENDING CLAIMS TAB */}
      {activeTab === "claims" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                Pending Visit Claims ({filteredPendingClaims.length})
              </p>
              <p className="text-xs text-muted">
                Review and approve unlinked walk-in visit claims requested by front desk staff.
              </p>
            </div>
            {canReviewClaims && pendingClaims.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setBulkApproveFeedback(null);
                  setShowApproveAllModal(true);
                }}
                className="rounded-md border border-gold bg-gold/15 px-3 py-1.5 text-xs font-semibold text-gold hover:bg-gold/25 transition-colors cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
              >
                <span>✓✓</span> Approve All ({pendingClaims.length})
              </button>
            )}
          </div>

          {actionFeedback && (
            <div
              className={`rounded-lg p-3 text-xs flex items-center justify-between ${
                actionFeedback.ok
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-red-500/10 text-red-400 border border-red-500/20"
              }`}
            >
              <span>{actionFeedback.message}</span>
              <button
                type="button"
                onClick={() => setActionFeedback(null)}
                className="text-xs opacity-70 hover:opacity-100 ml-2 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {filteredPendingClaims.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface p-8 text-center text-sm text-muted">
              {search.trim()
                ? "No pending claims match your search."
                : "No pending walk-in visit claims at this time."}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-lg border border-border bg-surface">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-surface-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-4 py-3">Target Member</th>
                      <th className="px-4 py-3">Original Walk-In Details</th>
                      <th className="px-4 py-3">Points Credit</th>
                      <th className="px-4 py-3">Initiated By</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-foreground">
                    {paginatedPendingClaims.map((claim) => {
                      const isApproving = approvingClaimId === claim.id;
                      const isRejecting = rejectingClaimId === claim.id;

                      return (
                        <tr key={claim.id} className="hover:bg-gold/5 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="font-semibold text-gold">
                                {claim.target_client_codename}
                              </span>
                              <span className="font-mono text-xs text-muted mt-0.5">
                                @{claim.target_client_username}
                              </span>
                            </div>
                          </td>

                          <td className="px-4 py-3 text-xs">
                            <div className="space-y-1">
                              {/* Line 1: Codename badge */}
                              <div className="flex items-center">
                                <span className="inline-flex items-center gap-1 rounded bg-gold/10 border border-gold/30 px-1.5 py-0.5 font-semibold text-gold text-[11px]">
                                  Codename: {claim.walkin_codename ?? "Walk-in Guest"}
                                </span>
                              </div>

                              {/* Line 2: Date & Time */}
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-foreground">
                                  {formatDisplayDate(claim.booking_date)}
                                </span>
                                <span className="font-mono text-muted">
                                  {claim.start_time ? formatTime(claim.start_time) : "None (Wet Area)"}
                                </span>
                              </div>

                              {/* Line 3: Service • Therapist • Locker # • Amount */}
                              <div className="text-muted text-[11px] flex flex-wrap items-center gap-x-2">
                                <span>{claim.service_name ?? "Wet Area"}</span>
                                <span>•</span>
                                <span>Therapist: {claim.therapist_name ?? "Unassigned"}</span>
                                {claim.locker_number != null && (
                                  <>
                                    <span>•</span>
                                    <span className="text-gold font-mono">Locker {claim.locker_number}</span>
                                  </>
                                )}
                                <span>•</span>
                                <span className="font-medium text-foreground">
                                  {claim.amount != null ? (
                                    <span>₱{Number(claim.amount).toLocaleString()}</span>
                                  ) : (
                                    <span className="text-muted italic">—</span>
                                  )}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3 text-xs">
                            <span className="rounded bg-gold/15 border border-gold/30 px-2 py-0.5 text-xs font-bold text-gold">
                              +{claim.points_to_credit} pts
                            </span>
                          </td>

                          <td className="px-4 py-3 text-xs">
                            <div className="text-muted">
                              Requested by: <strong className="text-foreground">{claim.requested_by_staff_name}</strong>
                              <div className="text-[11px] font-mono text-muted mt-0.5">
                                {formatDisplayDate(claim.created_at.split("T")[0])}
                                {claim.created_at.includes("T")
                                  ? ` · ${formatTime(claim.created_at.split("T")[1]?.slice(0, 5))}`
                                  : ""}
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3 text-right text-xs">
                            {canReviewClaims ? (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleApproveSingle(claim.id)}
                                  disabled={isApproving || isRejecting}
                                  className="rounded border border-gold/60 bg-gold/10 px-2.5 py-1 text-xs font-semibold text-gold hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-50 transition-colors cursor-pointer"
                                >
                                  {isApproving ? "Approving..." : "Approve"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRejectSingle(claim.id)}
                                  disabled={isApproving || isRejecting}
                                  className="rounded border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50 transition-colors cursor-pointer"
                                >
                                  {isRejecting ? "Rejecting..." : "Reject"}
                                </button>
                              </div>
                            ) : (
                              <span className="rounded bg-surface-accent px-2 py-0.5 text-[11px] text-muted font-medium">
                                Supervisor review required
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Claims Pagination Controls Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-lg border border-border bg-surface p-4 text-sm">
                <div className="text-xs text-muted">
                  Showing <span className="font-medium text-foreground">{claimsStartIndex + 1}</span>–
                  <span className="font-medium text-foreground">
                    {Math.min(claimsStartIndex + claimsPageSize, totalPendingClaims)}
                  </span>{" "}
                  of <span className="font-medium text-foreground">{totalPendingClaims}</span> claims
                </div>

                <div className="flex flex-wrap items-center gap-6">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted">Rows per page:</span>
                    <select
                      value={claimsPageSize}
                      onChange={(e) => setClaimsPageSize(Number(e.target.value))}
                      className="rounded-md border border-[#292524] bg-[#141210] px-2.5 py-1 text-xs text-[#f5f5f4] focus:border-gold/50 focus:outline-none"
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={claimsCurrentPage <= 1}
                      onClick={() => setClaimsCurrentPage((p) => Math.max(1, p - 1))}
                      className="rounded-md border border-border bg-surface px-3 py-1 text-xs font-medium text-foreground hover:border-gold/30 disabled:cursor-not-allowed disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      Previous
                    </button>
                    <span className="text-xs text-muted">
                      Page <span className="font-medium text-foreground">{claimsCurrentPage}</span> of{" "}
                      <span className="font-medium text-foreground">{totalClaimsPages}</span>
                    </span>
                    <button
                      type="button"
                      disabled={claimsCurrentPage >= totalClaimsPages}
                      onClick={() => setClaimsCurrentPage((p) => Math.min(totalClaimsPages, p + 1))}
                      className="rounded-md border border-border bg-surface px-3 py-1 text-xs font-medium text-foreground hover:border-gold/30 disabled:cursor-not-allowed disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {selectedMemberForProfile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => {
            setSelectedMemberForProfile(null);
            setIsEditingNotes(false);
            setShowClientQr(false);
          }}
        >
          <div
            className="w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-surface p-5 space-y-3.5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Section */}
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                {/* Line 1: Member codename/display name */}
                <h2 className="text-lg font-bold text-foreground truncate">
                  {selectedMemberForProfile.codename}
                </h2>
                {/* Line 2: Username handle and Mobile Number combined */}
                <p className="text-xs font-mono text-muted flex items-center gap-1.5 flex-wrap">
                  <span>@{selectedMemberForProfile.username}</span>
                  {selectedMemberForProfile.phone && (
                    <>
                      <span className="text-muted/60">•</span>
                      <span>{selectedMemberForProfile.phone}</span>
                    </>
                  )}
                </p>
                {/* Line 3: Member since formatted date */}
                <p className="text-xs text-muted">
                  Member since {formatDisplayDate(selectedMemberForProfile.since_date)}
                </p>
              </div>
              {/* Close [✕] button */}
              <button
                type="button"
                onClick={() => {
                  setSelectedMemberForProfile(null);
                  setIsEditingNotes(false);
                  setShowClientQr(false);
                }}
                className="shrink-0 rounded-md p-1 text-muted hover:text-foreground hover:bg-surface-2 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Two-Column Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* Left Card: Available Points */}
              <div className="rounded-lg border border-border bg-surface-2 p-3 flex flex-col justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                  Available Points
                </p>
                <div className="mt-1 flex items-center justify-between gap-1.5 flex-wrap">
                  <p className="text-base font-bold text-gold">
                    {selectedMemberForProfile.points_balance} pts
                  </p>
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => handleOpenAdjustPoints(selectedMemberForProfile)}
                      className="rounded border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-semibold text-accent-gold hover:bg-gold/20 hover:text-gold transition-colors cursor-pointer shrink-0"
                    >
                      Adjust Points
                    </button>
                  )}
                </div>
              </div>

              {/* Right Card: Current Status */}
              <div className="rounded-lg border border-border bg-surface-2 p-3 flex flex-col justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                  Current Status
                </p>
                <div className="mt-1 flex items-center">
                  {lockerMap[selectedMemberForProfile.id] !== undefined ? (
                    <span className="inline-flex items-center rounded border border-gold/40 bg-gold/10 px-2 py-0.5 text-xs font-semibold text-gold">
                      Locker {lockerMap[selectedMemberForProfile.id]}
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-muted">
                      Not Checked In
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Receptionist Notes Card */}
            <div className="rounded-lg border border-border bg-surface-2 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                  Receptionist Notes
                </p>
                {!isEditingNotes && currentMemberNotes && (
                  <button
                    type="button"
                    onClick={() => {
                      setNoteDraft(currentMemberNotes);
                      setIsEditingNotes(true);
                      setNotesError(null);
                    }}
                    className="text-[10px] font-semibold text-gold hover:text-accent-gold transition-colors cursor-pointer"
                  >
                    Edit
                  </button>
                )}
              </div>

              {isEditingNotes ? (
                <div className="space-y-2">
                  <textarea
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="Add notes for this client (preferences, special requests, reminders)..."
                    rows={3}
                    autoFocus
                    className="w-full rounded-md border border-border bg-surface p-2.5 text-xs text-foreground placeholder:text-muted/60 focus:border-gold/60 focus:outline-none resize-none"
                  />
                  {notesError && (
                    <p className="text-[11px] text-red-400">{notesError}</p>
                  )}
                  <div className="flex items-center justify-end gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingNotes(false);
                        setNoteDraft(currentMemberNotes ?? "");
                        setNotesError(null);
                      }}
                      disabled={isSavingNotes}
                      className="px-2.5 py-1 rounded border border-border text-[11px] font-medium text-muted hover:text-foreground transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveNotes}
                      disabled={isSavingNotes}
                      className="px-3 py-1 rounded bg-gold hover:bg-gold-hover text-background text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isSavingNotes ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              ) : currentMemberNotes ? (
                <p className="text-xs text-foreground bg-surface/60 rounded p-2.5 border border-border/60 whitespace-pre-wrap break-words leading-relaxed">
                  {currentMemberNotes}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setNoteDraft("");
                    setIsEditingNotes(true);
                    setNotesError(null);
                  }}
                  className="w-full py-2 px-3 rounded-md border border-dashed border-border/80 hover:border-gold/50 bg-surface/40 hover:bg-surface text-xs text-muted hover:text-gold transition-all text-center cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>+</span> Add Note
                </button>
              )}
            </div>

            {/* Eligibility Banner / Points Status Callout */}
            {selectedMemberForProfile.points_balance >= 100 ? (
              <div className="rounded-lg border border-gold/60 bg-gold/10 p-2.5 flex items-center gap-2.5 shadow-[0_0_15px_rgba(200,155,60,0.18)]">
                <span className="text-base select-none">✨</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gold leading-tight">
                    Eligible for Free Combination Massage (100 pts)
                  </p>
                  <p className="text-[10px] text-muted leading-tight mt-0.5">
                    Redeem for free Combi Massage or upgrade to Signature
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-border/80 bg-surface-2/60 px-3 py-2 flex items-center justify-between text-[11px] text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="text-xs">🎁</span>
                  <span>Free Massage Reward</span>
                </span>
                <span className="font-medium text-muted">
                  Needs {100 - selectedMemberForProfile.points_balance} more pts
                </span>
              </div>
            )}

            {/* Action Group */}
            <div className="flex flex-col gap-2 pt-0.5">
              {/* Primary button: Redeem 100 Points for Free Massage */}
              {selectedMemberForProfile.points_balance >= 100 && (
                <button
                  type="button"
                  onClick={() => {
                    if (isOpeningAction) return;
                    setIsOpeningAction("redeem");
                    setRedemptionClient(selectedMemberForProfile);
                    setShowRedemptionWalkin(true);
                    setSelectedMemberForProfile(null);
                    setIsEditingNotes(false);
                    setShowClientQr(false);
                  }}
                  disabled={services.length === 0 || staff.length === 0 || !!isOpeningAction}
                  className="w-full flex items-center justify-center gap-1.5 rounded-md border border-gold bg-gold hover:bg-gold-hover text-background px-4 py-2 text-xs font-bold shadow-[0_0_15px_rgba(200,155,60,0.3)] transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isOpeningAction === "redeem" ? (
                    <>
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-background border-t-transparent" />
                      Opening…
                    </>
                  ) : (
                    <>
                      <span>🎁</span> Redeem 100 Points for Free Massage
                    </>
                  )}
                </button>
              )}

              {/* Secondary button: + Log Visit for Member (secondary dark button) */}
              <button
                type="button"
                onClick={() => {
                  if (isOpeningAction) return;
                  setIsOpeningAction("logVisit");
                  setLogVisitClient(selectedMemberForProfile);
                  setShowLogVisit(true);
                  setSelectedMemberForProfile(null);
                  setIsEditingNotes(false);
                  setShowClientQr(false);
                }}
                disabled={services.length === 0 || staff.length === 0 || !!isOpeningAction}
                className="w-full flex items-center justify-center gap-1.5 rounded-md border border-border bg-surface-2 hover:bg-surface-accent text-foreground hover:border-gold/40 px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 transition-colors cursor-pointer"
              >
                {isOpeningAction === "logVisit" ? (
                  <>
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
                    Opening…
                  </>
                ) : (
                  <>
                    <span>+</span> Log Visit for Member
                  </>
                )}
              </button>

              {/* Secondary button: Claim Past Walk-in Visit */}
              {allowWalkinClaims && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCandidate(null);
                    setClaimSearch("");
                    setClaimFeedback(null);
                    setShowClaimModal(true);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 rounded-md border border-gold/40 bg-gold/5 px-4 py-2 text-xs font-semibold text-gold hover:bg-gold/15 transition-colors cursor-pointer"
                >
                  <span>🏷</span> Claim Past Walk-in Visit
                </button>
              )}

              {/* Collapsible QR Code Section */}
              {showClientQr && (
                <div className="rounded-lg border border-border bg-surface-2 p-3 flex flex-col items-center gap-2 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                      Digital Member QR
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowClientQr(false)}
                      className="text-[10px] text-muted hover:text-foreground cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                  {selectedMemberForProfile.qr_token ? (
                    <div className="p-2 bg-[#141210] rounded-lg border border-border/80 flex items-center justify-center">
                      <QRImage value={selectedMemberForProfile.qr_token} size={120} />
                    </div>
                  ) : (
                    <p className="text-xs text-muted italic py-2">No QR token assigned</p>
                  )}
                  {selectedMemberForProfile.qr_token && (
                    <p className="text-[10px] font-mono text-muted text-center break-all select-all">
                      {selectedMemberForProfile.qr_token}
                    </p>
                  )}
                </div>
              )}

              {/* Secondary trigger link/button: View / Share Client QR */}
              <button
                type="button"
                onClick={() => setShowClientQr((prev) => !prev)}
                className="w-full flex items-center justify-center gap-1.5 py-1 text-xs text-muted hover:text-foreground transition-colors cursor-pointer"
              >
                <span>📱</span> {showClientQr ? "Hide Client QR" : "View / Share Client QR"}
              </button>

              {/* Tertiary button: Close */}
              <button
                type="button"
                onClick={() => {
                  setSelectedMemberForProfile(null);
                  setIsEditingNotes(false);
                  setShowClientQr(false);
                }}
                className="w-full rounded-md border border-border px-4 py-2 text-xs font-medium text-muted hover:text-foreground hover:border-gold/30 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MEMBER VISIT HISTORY MODAL ("View Past Stays →") */}
      {selectedMemberForHistory && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/60 transition-opacity"
          onClick={() => setSelectedMemberForHistory(null)}
        >
          <div
            className="w-full max-w-lg h-full border-l border-border bg-surface p-6 overflow-y-auto space-y-6 shadow-2xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gold">
                  Member Visit History
                </p>
                <h2 className="text-xl font-bold text-foreground mt-0.5">
                  {selectedMemberForHistory.client.codename}
                </h2>
                <p className="text-xs font-mono text-muted mt-0.5">
                  @{selectedMemberForHistory.client.username} · {selectedMemberForHistory.visits.length} total visit
                  {selectedMemberForHistory.visits.length !== 1 ? "s" : ""} on record
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMemberForHistory(null)}
                className="rounded-lg border border-border p-2 text-muted hover:text-foreground hover:border-gold/30 transition-colors cursor-pointer"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Visit Timeline / History Cards */}
            <div className="space-y-3">
              {selectedMemberForHistory.visits.length === 0 ? (
                <div className="rounded-lg border border-border bg-surface-2 p-6 text-center text-xs text-muted">
                  No visit records found for this member.
                </div>
              ) : (
                selectedMemberForHistory.visits.map((visit, idx) => (
                  <div
                    key={visit.id || idx}
                    className="rounded-lg border border-border bg-surface-2 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-border/50 pb-2">
                      <span className="text-xs font-semibold text-gold">
                        Visit #{selectedMemberForHistory.visits.length - idx}
                      </span>
                      <span className="text-xs text-muted font-mono">
                        {formatDisplayDate(visit.date)}
                        {visit.time ? ` · ${formatTime(visit.time)}` : ""}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted">Service</p>
                        <p className="font-medium text-foreground mt-0.5">
                          {visit.service_name ?? <span className="text-muted italic">Wet Area / None</span>}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted">Therapist</p>
                        <p className="font-medium text-foreground mt-0.5">
                          {visit.therapist_name ?? <span className="text-muted italic">Unassigned</span>}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted">Massage Time</p>
                        <p className="font-medium text-foreground mt-0.5">
                          {visit.time ? (
                            formatTime(visit.time)
                          ) : (
                            <span className="text-muted italic">None (Wet Area)</span>
                          )}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted">Locker</p>
                        <p className="font-medium text-foreground mt-0.5">
                          {visit.locker_number ? (
                            <span className="text-gold font-mono">Locker {visit.locker_number}</span>
                          ) : (
                            <span className="text-muted italic">None</span>
                          )}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted">Amount & Payment</p>
                        <p className="font-medium text-foreground mt-0.5">
                          {visit.amount != null ? (
                            <span>
                              ₱{Number(visit.amount).toLocaleString()}{" "}
                              {visit.payment_method && (
                                <span className="text-muted text-[10px]">({visit.payment_method})</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted italic">—</span>
                          )}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted">Points Delta</p>
                        <p className="font-medium mt-0.5">
                          <span
                            className={
                              visit.points_delta >= 0 ? "text-gold font-bold" : "text-accent-red font-bold"
                            }
                          >
                            {visit.points_delta >= 0 ? "+" : ""}
                            {visit.points_delta} pts
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-muted pt-1">
                      <span>Status: <strong className="text-foreground">{visit.entry_type}</strong></span>
                      <span className="text-[10px] font-mono">ID: {visit.id.slice(0, 8)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <button
              type="button"
              onClick={() => setSelectedMemberForHistory(null)}
              className="w-full rounded-lg border border-border py-2.5 text-sm font-medium text-foreground hover:border-gold/30 transition-colors cursor-pointer"
            >
              Close History
            </button>
          </div>
        </div>
      )}

      {/* WALK-IN GUEST VISIT HISTORY DRAWER ("View Past Stays →") */}
      {activeWalkInGroup && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/60 transition-opacity"
          onClick={() => setSelectedWalkInCodename(null)}
        >
          <div
            className="w-full max-w-lg h-full border-l border-border bg-surface p-6 overflow-y-auto space-y-6 shadow-2xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gold">
                  Walk-In Guest History
                </p>
                <h2 className="text-xl font-bold text-foreground mt-0.5">
                  {activeWalkInGroup.codename}
                </h2>
                <p className="text-xs font-mono text-muted mt-0.5">
                  Non-Account Guest · {activeWalkInGroup.visits.length} total visit
                  {activeWalkInGroup.visits.length !== 1 ? "s" : ""} on record
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedWalkInCodename(null)}
                className="rounded-lg border border-border p-2 text-muted hover:text-foreground hover:border-gold/30 transition-colors cursor-pointer"
                aria-label="Close history drawer"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Visit Timeline / History Cards */}
            <div className="space-y-3">
              {activeWalkInGroup.visits.length === 0 ? (
                <div className="rounded-lg border border-border bg-surface-2 p-6 text-center text-xs text-muted">
                  No visit records found for this walk-in guest.
                </div>
              ) : (
                activeWalkInGroup.visits.map((visit, idx) => {
                  const resolvedLocker =
                    visit.locker_number ??
                    activeWalkInGroup.visits.find((v) => v.locker_number != null)?.locker_number ??
                    null;

                  return (
                    <div
                      key={visit.id || idx}
                      className="rounded-lg border border-border bg-surface-2 p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between border-b border-border/50 pb-2">
                        <span className="text-xs font-semibold text-gold">
                          Visit #{activeWalkInGroup.visits.length - idx}
                        </span>
                        <span className="text-xs text-muted font-mono">
                          {formatDisplayDate(visit.booking_date)}
                          {visit.start_time ? ` · ${formatTime(visit.start_time)}` : ""}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted">Service</p>
                          <p className="font-medium text-foreground mt-0.5">
                            {visit.service_name ?? <span className="text-muted italic">Wet Area / None</span>}
                          </p>
                        </div>

                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted">Therapist</p>
                          <p className="font-medium text-foreground mt-0.5">
                            {visit.therapist_name ?? <span className="text-muted italic">Unassigned</span>}
                          </p>
                        </div>

                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted">Massage Time</p>
                          <p className="font-medium text-foreground mt-0.5">
                            {visit.start_time ? (
                              formatTime(visit.start_time)
                            ) : (
                              <span className="text-muted italic">None (Wet Area)</span>
                            )}
                          </p>
                        </div>

                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted">Room</p>
                          <p className="font-medium text-foreground mt-0.5">
                            {visit.room_number ? (
                              <span>Room {visit.room_number}</span>
                            ) : (
                              <span className="text-muted italic">None (Wet Area)</span>
                            )}
                          </p>
                        </div>

                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted">Locker</p>
                          <p className="font-medium text-foreground mt-0.5">
                            {resolvedLocker ? (
                              <span className="text-gold font-mono">Locker {resolvedLocker}</span>
                            ) : (
                              <span className="text-muted italic">None</span>
                            )}
                          </p>
                        </div>

                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted">Amount & Payment</p>
                          <p className="font-medium text-foreground mt-0.5">
                            {visit.amount != null ? (
                              <span>
                                ₱{Number(visit.amount).toLocaleString()}{" "}
                                {visit.payment_method && (
                                  <span className="text-muted text-[10px]">({visit.payment_method})</span>
                                )}
                              </span>
                            ) : (
                              <span className="text-muted italic">—</span>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-muted pt-1">
                        <span>Status: <strong className="text-foreground">{visit.status}</strong></span>
                        <span className="text-[10px] font-mono">ID: {visit.id.slice(0, 8)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <button
              type="button"
              onClick={() => setSelectedWalkInCodename(null)}
              className="w-full rounded-lg border border-border py-2.5 text-sm font-medium text-foreground hover:border-gold/30 transition-colors cursor-pointer"
            >
              Close History
            </button>
          </div>
        </div>
      )}

      {/* Quick Walk-in Modal (Redemption) */}
      {showRedemptionWalkin && redemptionClient && (
        <QuickWalkinModal
          clients={clients}
          services={services}
          staff={staff}
          therapists={therapists}
          promos={promos}
          addons={addons}
          lockers={lockers}
          initialClient={redemptionClient}
          initialService="Combi Massage"
          initialPromo="redeem_100_pts"
          initialIsRedemption={true}
          onClose={() => {
            setShowRedemptionWalkin(false);
            setRedemptionClient(null);
            setIsOpeningAction(null);
          }}
          onCreated={() => {
            setShowRedemptionWalkin(false);
            setRedemptionClient(null);
            setIsOpeningAction(null);
            router.refresh();
          }}
        />
      )}

      {/* Log Visit Modal */}
      {showLogVisit && (logVisitClient || clients[0]) && (
        <LogVisitModal
          clients={clients}
          services={services}
          staff={staff}
          therapists={therapists}
          promos={promos}
          addons={addons}
          lockers={lockers}
          initialClientId={(logVisitClient || clients[0]).id}
          onClose={() => {
            setShowLogVisit(false);
            setLogVisitClient(null);
            setIsOpeningAction(null);
          }}
          onLogged={() => {
            setShowLogVisit(false);
            setLogVisitClient(null);
            setIsOpeningAction(null);
            router.refresh();
          }}
        />
      )}

      {/* APPROVE ALL CONFIRMATION MODAL */}
      {showApproveAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-foreground">Approve All Claims?</h3>
              <button
                type="button"
                onClick={() => setShowApproveAllModal(false)}
                disabled={isApprovingAll}
                className="text-muted hover:text-foreground p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-sm text-muted leading-relaxed">
              Approve All Claims? This will approve <strong className="text-foreground">{pendingClaims.length}</strong> pending claims and credit a total of <strong className="text-gold font-bold">+{totalPointsToCreditAll} points</strong> to their respective members.
            </p>

            {bulkApproveFeedback && (
              <div
                className={`rounded-lg p-3 text-xs ${
                  bulkApproveFeedback.ok
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                }`}
              >
                {bulkApproveFeedback.message}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowApproveAllModal(false)}
                disabled={isApprovingAll}
                className="rounded-md border border-border px-4 py-2 text-xs font-medium text-muted hover:text-foreground transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApproveAllConfirm}
                disabled={isApprovingAll || pendingClaims.length === 0}
                className="rounded-md border border-gold bg-gold px-4 py-2 text-xs font-bold text-black hover:bg-gold/90 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isApprovingAll ? "Approving All..." : "Confirm Bulk Approval"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLAIM PAST WALK-IN VISIT MODAL (Candidate Search & Initiation) */}
      {showClaimModal && selectedMemberForProfile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 animate-fade-in"
          onClick={() => {
            if (!isSubmittingClaim) setShowClaimModal(false);
          }}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl border border-border bg-surface shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="border-b border-border p-5 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gold">
                  Claim Past Walk-In Visit
                </p>
                <h2 className="text-lg font-bold text-foreground mt-0.5">
                  {selectedMemberForProfile.codename}{" "}
                  <span className="text-xs font-mono text-muted">(@{selectedMemberForProfile.username})</span>
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  Search unlinked walk-ins. Submitted claims require Owner / Supervisor review before points are credited.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowClaimModal(false)}
                disabled={isSubmittingClaim}
                className="rounded-md p-1 text-muted hover:text-foreground transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Search filter in modal */}
            <div className="p-4 border-b border-border bg-surface-2">
              <input
                type="text"
                value={claimSearch}
                onChange={(e) => setClaimSearch(e.target.value)}
                placeholder="Search candidate visits by guest codename, date (YYYY-MM-DD), locker #, or service..."
                className="w-full rounded-lg border border-border bg-surface py-2 px-3 text-xs text-foreground placeholder:text-muted focus:border-gold/50 focus:outline-none"
              />
            </div>

            {/* Candidate list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {candidateWalkIns.length === 0 ? (
                <div className="rounded-lg border border-border bg-surface-2 p-8 text-center text-xs text-muted">
                  {claimSearch.trim()
                    ? "No unlinked walk-in visits match your search criteria."
                    : "No unlinked walk-in visits currently available to claim."}
                </div>
              ) : (
                candidateWalkIns.map((candidate) => {
                  const isSelected = selectedCandidate?.id === candidate.id;
                  const previewPoints = computeCandidatePoints(candidate);

                  return (
                    <div
                      key={candidate.id}
                      onClick={() => setSelectedCandidate(candidate)}
                      className={`rounded-lg border p-3.5 transition-all cursor-pointer ${
                        isSelected
                          ? "border-gold bg-gold/10 shadow-md ring-1 ring-gold/40"
                          : "border-border bg-surface-2 hover:border-gold/30 hover:bg-gold/5"
                      }`}
                    >
                      <div className="flex items-center justify-between border-b border-border/50 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gold">
                            {candidate.guest_label}
                          </span>
                          <span className="text-[11px] font-mono text-muted">
                            {formatDisplayDate(candidate.booking_date)}
                            {candidate.start_time ? ` · ${formatTime(candidate.start_time)}` : ""}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-gold/15 border border-gold/30 px-2 py-0.5 text-xs font-bold text-gold">
                            +{previewPoints} pts
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded font-medium ${
                              isSelected
                                ? "bg-gold text-black font-semibold"
                                : "bg-surface text-muted border border-border"
                            }`}
                          >
                            {isSelected ? "Selected" : "Select"}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-2.5 text-xs">
                        <div>
                          <p className="text-[10px] uppercase text-muted">Service</p>
                          <p className="font-medium text-foreground truncate">
                            {candidate.service_name ?? "Wet Area"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-muted">Therapist</p>
                          <p className="font-medium text-foreground truncate">
                            {candidate.therapist_name ?? "Unassigned"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-muted">Room</p>
                          <p className="font-medium text-foreground truncate">
                            {candidate.room_number ? `Room ${candidate.room_number}` : "None"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-muted">Locker</p>
                          <p className="font-medium text-foreground">
                            {candidate.locker_number ? `Locker ${candidate.locker_number}` : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-muted">Amount</p>
                          <p className="font-medium text-foreground">
                            {candidate.amount != null ? `₱${candidate.amount.toLocaleString()}` : "—"}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer / Feedback */}
            <div className="border-t border-border p-4 bg-surface-2 flex flex-col gap-3">
              {claimFeedback && (
                <div
                  className={`rounded-lg p-3 text-xs ${
                    claimFeedback.ok
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-red-500/10 text-red-400 border border-red-500/20"
                  }`}
                >
                  {claimFeedback.message}
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs text-muted">
                  {selectedCandidate ? (
                    <span>
                      Selected: <strong className="text-foreground">{selectedCandidate.guest_label}</strong> ({formatDisplayDate(selectedCandidate.booking_date)}) · Preview: <strong className="text-gold">+{computeCandidatePoints(selectedCandidate)} pts</strong>
                    </span>
                  ) : (
                    <span>Select a candidate visit above to claim</span>
                  )}
                </div>

                <div className="flex items-center gap-3 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setShowClaimModal(false)}
                    disabled={isSubmittingClaim}
                    className="rounded-md border border-border px-4 py-2 text-xs font-medium text-foreground hover:border-gold/30 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitClaim}
                    disabled={!selectedCandidate || isSubmittingClaim}
                    className="rounded-md border border-gold bg-gold px-4 py-2 text-xs font-bold text-black hover:bg-gold/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    {isSubmittingClaim ? "Submitting..." : "Submit Claim Request"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OWNER MANUAL POINTS ADJUSTMENT MODAL */}
      {showAdjustPointsModal && adjustTargetClient && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 animate-fade-in"
          onClick={handleCloseAdjustPoints}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-surface p-5 space-y-4 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-border/80 pb-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gold">
                  Owner Management
                </p>
                <h2 className="text-base font-bold text-foreground mt-0.5">
                  Manual Points Adjustment
                </h2>
                <p className="text-xs text-muted">
                  Member: <span className="font-semibold text-foreground">{adjustTargetClient.codename}</span>{" "}
                  <span className="font-mono text-muted">(@{adjustTargetClient.username})</span>
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseAdjustPoints}
                disabled={isSubmittingAdjust}
                className="rounded-md p-1 text-muted hover:text-foreground transition-colors cursor-pointer"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Error Banner */}
            {adjustError && (
              <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-400">
                {adjustError}
              </div>
            )}

            {adjustStep === "input" ? (
              /* STEP 1: INPUT & PREVIEW */
              <div className="space-y-4">
                {/* Mode Selector */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">
                    Adjustment Type
                  </label>
                  <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-surface-2 border border-border">
                    <button
                      type="button"
                      onClick={() => {
                        setAdjustMode("add");
                        setAdjustError(null);
                      }}
                      className={`py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                        adjustMode === "add"
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm"
                          : "text-muted hover:text-foreground"
                      }`}
                    >
                      + Add Points
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAdjustMode("deduct");
                        setAdjustError(null);
                      }}
                      className={`py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                        adjustMode === "deduct"
                          ? "bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-sm"
                          : "text-muted hover:text-foreground"
                      }`}
                    >
                      - Deduct Points
                    </button>
                  </div>
                </div>

                {/* Points Input */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">
                    Points Amount
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={adjustPointsInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "" || /^\d+$/.test(val)) {
                          setAdjustPointsInput(val);
                          setAdjustError(null);
                        }
                      }}
                      placeholder="e.g., 50"
                      className="w-full rounded-lg border border-border bg-surface-2 py-2 px-3 text-sm font-semibold text-foreground placeholder:text-muted focus:border-gold/50 focus:outline-none"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-muted font-medium pointer-events-none">
                      pts
                    </span>
                  </div>
                </div>

                {/* Optional Remarks */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">
                    Remarks / Reason <span className="normal-case font-normal text-muted/80">(optional)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={adjustRemarks}
                    onChange={(e) => setAdjustRemarks(e.target.value)}
                    placeholder="e.g., Customer service bonus, correction (optional)"
                    className="w-full rounded-lg border border-border bg-surface-2 py-2 px-3 text-xs text-foreground placeholder:text-muted focus:border-gold/50 focus:outline-none resize-none"
                  />
                </div>

                {/* Live Preview Card */}
                {(() => {
                  const parsed = parseInt(adjustPointsInput, 10);
                  const valid = !isNaN(parsed) && parsed > 0 ? parsed : 0;
                  const cur = adjustTargetClient.points_balance ?? 0;
                  const delta = adjustMode === "add" ? valid : -valid;
                  const newBal = cur + delta;
                  const isInsufficient = adjustMode === "deduct" && valid > cur;

                  return (
                    <div className="rounded-lg border border-border/80 bg-surface-2 p-3 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted">Balance Preview:</span>
                        <span className="font-mono text-xs">
                          <span className="text-muted">{cur} pts</span>
                          <span className="text-muted mx-1.5">→</span>
                          <span className={`font-bold ${newBal < 0 ? "text-rose-400" : "text-gold"}`}>
                            {newBal} pts
                          </span>
                        </span>
                      </div>

                      {isInsufficient && (
                        <p className="text-[11px] text-rose-400 font-medium">
                          ⚠ Deducting {valid} pts exceeds available balance ({cur} pts).
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleCloseAdjustPoints}
                    className="flex-1 rounded-md border border-border py-2 px-3 text-xs font-medium text-muted hover:text-foreground hover:bg-surface-2 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  {(() => {
                    const parsed = parseInt(adjustPointsInput, 10);
                    const valid = !isNaN(parsed) && parsed > 0;
                    const cur = adjustTargetClient.points_balance ?? 0;
                    const isInsufficient = adjustMode === "deduct" && (parsed || 0) > cur;
                    const canReview = valid && !isInsufficient;

                    return (
                      <button
                        type="button"
                        onClick={handleReviewAdjustment}
                        disabled={!canReview}
                        className="flex-1 rounded-md border border-gold bg-gold/15 py-2 px-3 text-xs font-semibold text-accent-gold hover:bg-gold/25 disabled:cursor-not-allowed disabled:opacity-40 transition-colors cursor-pointer"
                      >
                        Review Adjustment →
                      </button>
                    );
                  })()}
                </div>
              </div>
            ) : (
              /* STEP 2: CONFIRMATION GATE */
              <div className="space-y-4">
                <div className="rounded-lg border border-gold/30 bg-gold/5 p-4 space-y-3">
                  <p className="text-xs text-foreground font-medium">
                    Please confirm the points adjustment details below:
                  </p>

                  <div className="space-y-2 text-xs border-t border-border/60 pt-2.5">
                    <div className="flex justify-between items-center">
                      <span className="text-muted">Target Member:</span>
                      <span className="font-semibold text-foreground">
                        {adjustTargetClient.codename}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-muted">Adjustment:</span>
                      {(() => {
                        const parsed = parseInt(adjustPointsInput, 10) || 0;
                        return adjustMode === "add" ? (
                          <span className="inline-flex items-center rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-400">
                            +{parsed} points
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-xs font-bold text-rose-400">
                            -{parsed} points
                          </span>
                        );
                      })()}
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-muted">New Total Balance:</span>
                      {(() => {
                        const parsed = parseInt(adjustPointsInput, 10) || 0;
                        const delta = adjustMode === "add" ? parsed : -parsed;
                        const newBal = (adjustTargetClient.points_balance ?? 0) + delta;
                        return (
                          <span className="font-bold text-gold text-sm">
                            {newBal} pts
                          </span>
                        );
                      })()}
                    </div>

                    <div className="flex justify-between items-start gap-4">
                      <span className="text-muted shrink-0">Remarks:</span>
                      <span className="font-medium text-foreground text-right italic">
                        {adjustRemarks.trim() || "(None - standard reason will be recorded)"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setAdjustStep("input");
                      setAdjustError(null);
                    }}
                    disabled={isSubmittingAdjust}
                    className="flex-1 rounded-md border border-border py-2 px-3 text-xs font-medium text-muted hover:text-foreground hover:bg-surface-2 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmAdjustment}
                    disabled={isSubmittingAdjust}
                    className="flex-1 rounded-md border border-gold bg-gold py-2 px-3 text-xs font-bold text-black hover:bg-gold-hover disabled:cursor-not-allowed disabled:opacity-50 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {isSubmittingAdjust ? (
                      <>
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-black border-t-transparent" />
                        Applying...
                      </>
                    ) : (
                      "Confirm & Apply"
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Offline Fallback CSV Import Modal */}
      {showOfflineCsvModal && (
        <OfflineCsvImportModal
          isOpen={showOfflineCsvModal}
          onClose={() => setShowOfflineCsvModal(false)}
          clients={clients}
          services={services}
          therapists={therapists}
          loyaltySettings={loyaltySettings}
          onSuccess={(res) => {
            showBookingToast({
              title: "CSV Ingestion Successful",
              description: `Ingested ${res.importedCount} visits (+${res.pointsTotal} pts credited, ${res.skippedCount} skipped).`,
            });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
