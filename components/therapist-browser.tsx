"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStaffSim } from "@/lib/staff-context";
import {
  toggleDayOff as toggleDayOffAction,
  createTherapist as createTherapistAction,
  markAbsentToday as markAbsentTodayAction,
  markOnLeave as markOnLeaveAction,
} from "@/app/(staff)/therapists/actions";

const DEFAULT_THERAPISTS = [
  "Ron",
  "Don",
  "Tristan",
  "Leo",
  "Roy",
  "Xander",
  "Dan",
  "Marco",
  "Akio",
  "Josh",
];

const ALL_THERAPIST_SERVICES = [
  "Combi Massage",
  "Signature Massage",
  "Scrub",
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const WEEKEND_SLOTS = [
  "16:00",
  "17:30",
  "19:00",
  "20:30",
  "22:00",
  "23:30",
  "01:00",
];

export type TherapistMetaRecord = {
  dayOff: string[];
  services: string[];
  leave: { start: string; end: string; reason: string } | null;
  absentDates: string[];
  archived: boolean;
  archivedReason?: string;
  archivedBy?: string;
  archivedAt?: string;
};

export type TherapistRecord = { id: string; name: string };

export type BookingInfo = {
  id: string | number;
  therapist: string;
  clientName: string;
  date: string;
  time: string;
  service: string;
  status: string;
};

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtTime(t: string): string {
  if (!t || !t.includes(":")) return t;
  const [h, m] = t.split(":");
  const hr = ((+h + 11) % 12) + 1;
  return `${hr}:${m} ${+h < 12 ? "AM" : "PM"}`;
}

function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function spaSortMin(t: string): number {
  const m = timeToMin(t);
  return m < 600 ? m + 1440 : m;
}

function windowOverlap(
  aStart: number,
  aDur: number,
  bStart: number,
  bDur: number
): boolean {
  return aStart < bStart + bDur && bStart < aStart + aDur;
}

export function TherapistBrowser({
  initialTherapists,
  initialDayOff = {},
  initialBookings = [],
  initialAbsence = {},
  initialLeave = {},
}: {
  initialTherapists?: TherapistRecord[];
  initialDayOff?: Record<string, string[]>;
  initialBookings?: BookingInfo[];
  initialAbsence?: Record<string, string[]>;
  initialLeave?: Record<string, { start: string; end: string; reason: string }>;
}) {
  const { sessionStaff } = useStaffSim();
  const router = useRouter();

  const initialRecords: TherapistRecord[] =
    initialTherapists && initialTherapists.length > 0
      ? initialTherapists
      : DEFAULT_THERAPISTS.map((name) => ({ id: name, name }));

  const [therapists, setTherapists] = useState<string[]>(() =>
    initialRecords.map((r) => r.name)
  );

  // Maps therapist display name -> real DB id (or the name itself, for
  // demo-only entries with no backing row — e.g. the DB-empty fallback,
  // or a therapist added this session via the still-local-only Add flow).
  const [therapistIds, setTherapistIds] = useState<Record<string, string>>(
    () => {
      const ids: Record<string, string> = {};
      initialRecords.forEach((r) => {
        ids[r.name] = r.id;
      });
      return ids;
    }
  );

  const [therapistMeta, setTherapistMeta] = useState<
    Record<string, TherapistMetaRecord>
  >(() => {
    const meta: Record<string, TherapistMetaRecord> = {};
    const restricted: Record<string, string[]> = {
      Don: ["Combi Massage"],
      Akio: ["Signature Massage"],
    };
    initialRecords.forEach((r) => {
      meta[r.name] = {
        dayOff: initialDayOff[r.id]
          ? initialDayOff[r.id].slice()
          : r.name === "Josh" && !initialTherapists
          ? ["Sun"]
          : [],
        services: restricted[r.name]
          ? restricted[r.name].slice()
          : ALL_THERAPIST_SERVICES.slice(),
        leave: initialLeave[r.id] ?? null,
        absentDates: initialAbsence[r.id] ? initialAbsence[r.id].slice() : [],
        archived: false,
        archivedReason: "",
      };
    });
    return meta;
  });

  // Demo / live bookings state for schedule & busy checking
  const [bookings, setBookings] = useState<BookingInfo[]>(() => {
    if (initialBookings && initialBookings.length > 0) return initialBookings;
    return [
      {
        id: 1,
        therapist: "Ron",
        clientName: "Ohm",
        date: "2026-08-26",
        time: "13:00",
        service: "Combi Massage",
        status: "Completed",
      },
      {
        id: 3,
        therapist: "Tristan",
        clientName: "JD",
        date: "2026-08-26",
        time: "13:30",
        service: "Signature Massage",
        status: "Completed",
      },
      {
        id: 4,
        therapist: "Leo",
        clientName: "Marky",
        date: "2026-08-26",
        time: "14:00",
        service: "Scrub",
        status: "Completed",
      },
      {
        id: 5,
        therapist: "Roy",
        clientName: "Kei",
        date: "2026-08-26",
        time: "14:15",
        service: "Combi Massage",
        status: "Completed",
      },
      {
        id: 9,
        therapist: "Xander",
        clientName: "Walk-in 2",
        date: "2026-08-26",
        time: "13:20",
        service: "Combi Massage",
        status: "Completed",
      },
      {
        id: 10,
        therapist: "Dan",
        clientName: "Walk-in 3",
        date: "2026-08-26",
        time: "13:40",
        service: "Signature Massage",
        status: "Completed",
      },
      {
        id: 12,
        therapist: "Marco",
        clientName: "Walk-in 5",
        date: "2026-08-26",
        time: "14:20",
        service: "Combi Massage",
        status: "Completed",
      },
      {
        id: 14,
        therapist: "Josh",
        clientName: "DK",
        date: "2026-08-27",
        time: "16:00",
        service: "Combi Massage",
        status: "Needs Reassignment",
      },
    ];
  });

  // Filter controls
  const [viewDate, setViewDate] = useState<string>(() => todayISO());
  const [viewTime, setViewTime] = useState<string>("20:30");
  const [filter, setFilter] = useState<string>("all");
  const [showArchived, setShowArchived] = useState<boolean>(false);

  // Kebab active menu
  const [openKebab, setOpenKebab] = useState<string | null>(null);

  // Modal dialog states
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [addName, setAddName] = useState<string>("");
  const [addDayOff, setAddDayOff] = useState<string[]>([]);
  const [addServices, setAddServices] = useState<string[]>([]);
  const [addError, setAddError] = useState<string | null>(null);

  const [scheduleModalTherapist, setScheduleModalTherapist] = useState<string | null>(null);

  const [leaveTherapist, setLeaveTherapist] = useState<string | null>(null);
  const [leaveStart, setLeaveStart] = useState<string>("");
  const [leaveEnd, setLeaveEnd] = useState<string>("");
  const [leaveReason, setLeaveReason] = useState<string>("");

  const [archiveTherapist, setArchiveTherapist] = useState<string | null>(null);
  const [archiveReason, setArchiveReason] = useState<string>("");
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const [editTherapist, setEditTherapist] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>("");
  const [editError, setEditError] = useState<string | null>(null);

  // Toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => setToastMessage(msg);

  // Copy available-therapist list to clipboard
  const handleCopyAvailable = async () => {
    const names = cardRows
      .filter((r) => r.slotStatus === "available")
      .map((r) => r.t);
    const text = `${fmtTime(viewTime)} Available\n\n${names.join("\n")}`;
    try {
      await navigator.clipboard.writeText(text);
      showToast(
        names.length > 0
          ? `Copied ${names.length} available therapist${names.length === 1 ? "" : "s"} to clipboard`
          : "No available therapists to copy"
      );
    } catch {
      showToast("Couldn't copy to clipboard");
    }
  };

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 2400);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Click outside to close kebab. This listener and React's own delegated
  // click handler both live on `document`, so the kebab button's
  // `e.stopPropagation()` (which only blocks bubbling to ancestors) can't
  // stop this sibling listener from firing right after the button's own
  // onClick opens the menu — it has to explicitly ignore clicks that
  // landed inside a kebab trigger/menu instead.
  useEffect(() => {
    const handleDocClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-kebab-root]")) return;
      setOpenKebab(null);
    };
    document.addEventListener("click", handleDocClick);
    return () => document.removeEventListener("click", handleDocClick);
  }, []);

  // Helper check functions
  const isTherapistOnLeave = (t: string, date: string): boolean => {
    const meta = therapistMeta[t];
    if (!meta || !meta.leave) return false;
    return date >= meta.leave.start && date <= meta.leave.end;
  };

  const isTherapistOff = (t: string, date: string): boolean => {
    const meta = therapistMeta[t];
    if (!meta) return false;
    const wd = WEEKDAYS[new Date(date + "T00:00:00").getDay()];
    return (
      meta.dayOff.includes(wd) ||
      isTherapistOnLeave(t, date) ||
      meta.absentDates.includes(date)
    );
  };

  const isTherapistBusy = (
    t: string,
    date: string,
    time: string,
    dur = 90
  ): boolean => {
    const startMin = timeToMin(time);
    return bookings.some(
      (b) =>
        b.therapist === t &&
        b.date === date &&
        (b.status === "Booked" ||
          b.status === "Completed" ||
          b.status === "Needs Reassignment") &&
        windowOverlap(startMin, dur, timeToMin(b.time), 90)
    );
  };

  // Day off toggle handler — writes through to therapist_day_off
  const handleToggleDayOff = async (t: string, wd: string) => {
    const meta = therapistMeta[t];
    if (!meta || !sessionStaff) return;
    const isCurrentlyOff = meta.dayOff.includes(wd);
    const turningOff = !isCurrentlyOff;
    const therapistId = therapistIds[t];
    const weekday = WEEKDAYS.indexOf(wd);

    const res = await toggleDayOffAction(
      therapistId,
      weekday,
      turningOff,
      sessionStaff.id
    );
    if (!res.ok) {
      showToast(`Couldn't update ${t}'s day off — ${res.error}`);
      return;
    }

    setTherapistMeta((prev) => {
      const current = prev[t];
      if (!current) return prev;
      const updated = turningOff
        ? [...current.dayOff, wd]
        : current.dayOff.filter((d) => d !== wd);
      return {
        ...prev,
        [t]: { ...current, dayOff: updated },
      };
    });
    showToast(`${t} · ${wd} ${turningOff ? "marked off" : "available again"}`);
  };

  // Services offered toggle handler
  const handleToggleService = (t: string, s: string) => {
    setTherapistMeta((prev) => {
      const meta = prev[t];
      if (!meta) return prev;
      const offers = meta.services.includes(s);
      const updated = offers
        ? meta.services.filter((x) => x !== s)
        : [...meta.services, s];
      showToast(`${t} now ${!offers ? "offers" : "no longer offers"} ${s}`);
      return {
        ...prev,
        [t]: { ...meta, services: updated },
      };
    });
  };

  // Mark absent today handler — writes through to therapist_absence and
  // flags that day's Booked appointments as Needs Reassignment.
  const handleMarkAbsent = async (t: string) => {
    const therapistId = therapistIds[t];
    if (!therapistId || !sessionStaff) return;

    const res = await markAbsentTodayAction(therapistId, viewDate, sessionStaff.id);
    if (!res.ok) {
      showToast(`Couldn't mark ${t} absent — ${res.error}`);
      return;
    }

    setTherapistMeta((prev) => {
      const meta = prev[t];
      if (!meta) return prev;
      return {
        ...prev,
        [t]: { ...meta, absentDates: [...meta.absentDates, viewDate] },
      };
    });
    let flaggedCount = 0;
    setBookings((prev) =>
      prev.map((b) => {
        if (b.therapist === t && b.date === viewDate && b.status === "Booked") {
          flaggedCount++;
          return { ...b, status: "Needs Reassignment" };
        }
        return b;
      })
    );
    showToast(
      `${t} marked absent on ${fmtDate(viewDate)}${
        flaggedCount > 0 ? ` · ${flaggedCount} booking(s) flagged` : ""
      }`
    );
    router.refresh();
  };

  // Confirm leave — writes through to therapist_leave and flags any
  // Booked appointments in the leave range as Needs Reassignment.
  const handleConfirmLeave = async () => {
    if (!leaveTherapist || !leaveStart || !leaveEnd) return;
    const therapistId = therapistIds[leaveTherapist];
    if (!therapistId || !sessionStaff) return;

    const reason = leaveReason.trim();
    const res = await markOnLeaveAction(
      therapistId,
      leaveStart,
      leaveEnd,
      reason,
      sessionStaff.id
    );
    if (!res.ok) {
      showToast(`Couldn't put ${leaveTherapist} on leave — ${res.error}`);
      return;
    }

    setTherapistMeta((prev) => {
      const meta = prev[leaveTherapist];
      if (!meta) return prev;
      return {
        ...prev,
        [leaveTherapist]: {
          ...meta,
          leave: { start: leaveStart, end: leaveEnd, reason },
        },
      };
    });
    setBookings((prev) =>
      prev.map((b) => {
        if (
          b.therapist === leaveTherapist &&
          b.date >= leaveStart &&
          b.date <= leaveEnd &&
          b.status === "Booked"
        ) {
          return { ...b, status: "Needs Reassignment" };
        }
        return b;
      })
    );
    showToast(
      `${leaveTherapist} on leave ${fmtDate(leaveStart)}–${fmtDate(leaveEnd)}`
    );
    setLeaveTherapist(null);
    router.refresh();
  };

  // Confirm archive
  const handleConfirmArchive = () => {
    if (!archiveTherapist) return;
    const reason = archiveReason.trim();
    if (!reason) {
      setArchiveError("Please enter a reason.");
      return;
    }
    const t = archiveTherapist;
    setTherapistMeta((prev) => {
      const meta = prev[t];
      if (!meta) return prev;
      return {
        ...prev,
        [t]: {
          ...meta,
          archived: true,
          archivedReason: reason,
          archivedAt: todayISO(),
        },
      };
    });
    let flaggedCount = 0;
    setBookings((prev) =>
      prev.map((b) => {
        if (b.therapist === t && b.status === "Booked") {
          flaggedCount++;
          return { ...b, status: "Needs Reassignment" };
        }
        return b;
      })
    );
    showToast(
      `${t} archived${
        flaggedCount > 0
          ? ` · ${flaggedCount} booking(s) flagged for reassignment`
          : ""
      }`
    );
    setArchiveTherapist(null);
  };

  // Unarchive therapist
  const handleUnarchive = (t: string) => {
    setTherapistMeta((prev) => {
      const meta = prev[t];
      if (!meta) return prev;
      return {
        ...prev,
        [t]: { ...meta, archived: false, archivedReason: "" },
      };
    });
    showToast(`${t} unarchived — back on the active roster`);
  };

  // Confirm edit therapist name
  const handleConfirmEdit = () => {
    if (!editTherapist) return;
    const newName = editName.trim();
    const oldName = editTherapist;
    if (!newName) {
      setEditError("Please enter a name.");
      return;
    }
    if (newName !== oldName && therapists.includes(newName)) {
      setEditError("That name is already in use.");
      return;
    }
    if (newName !== oldName) {
      setTherapists((prev) => prev.map((t) => (t === oldName ? newName : t)));
      setTherapistMeta((prev) => {
        const copy = { ...prev };
        copy[newName] = copy[oldName];
        delete copy[oldName];
        return copy;
      });
      setTherapistIds((prev) => {
        const copy = { ...prev };
        copy[newName] = copy[oldName];
        delete copy[oldName];
        return copy;
      });
      setBookings((prev) =>
        prev.map((b) =>
          b.therapist === oldName ? { ...b, therapist: newName } : b
        )
      );
      showToast(`Renamed to ${newName}`);
    }
    setEditTherapist(null);
  };

  // Confirm add therapist
  const handleConfirmAdd = async () => {
    const name = addName.trim();
    if (!name || addServices.length === 0 || therapists.includes(name)) {
      setAddError("Please enter a unique name and select at least one service.");
      return;
    }
    if (!sessionStaff) {
      setAddError("No staff session found.");
      return;
    }

    const dayOffWeekdays = addDayOff.map((d) => WEEKDAYS.indexOf(d));
    const res = await createTherapistAction(name, dayOffWeekdays, sessionStaff.id);
    if (!res.ok) {
      setAddError(`Couldn't add therapist — ${res.error}`);
      return;
    }

    setTherapists((prev) => [...prev, name]);
    setTherapistIds((prev) => ({ ...prev, [name]: res.id }));
    setTherapistMeta((prev) => ({
      ...prev,
      [name]: {
        dayOff: addDayOff.slice(),
        services: addServices.slice(),
        leave: null,
        absentDates: [],
        archived: false,
        archivedReason: "",
      },
    }));
    showToast(`${name} added to the roster`);
    setShowAddModal(false);
    router.refresh();
  };

  // Calculate card stats and sorting
  const wdToday = WEEKDAYS[new Date(viewDate + "T00:00:00").getDay()];
  const sortedNames = therapists.slice().sort();
  const counts = sortedNames.map(
    (t) =>
      bookings.filter(
        (b) =>
          b.therapist === t &&
          b.date === viewDate &&
          (b.status === "Booked" || b.status === "Completed")
      ).length
  );
  const maxCount = Math.max(...counts, 0);

  const cardRows = sortedNames
    .map((t, idx) => {
      const meta = therapistMeta[t] || {
        dayOff: [],
        services: ALL_THERAPIST_SERVICES,
        leave: null,
        absentDates: [],
        archived: false,
      };
      const onLeave = isTherapistOnLeave(t, viewDate);
      const isOff =
        meta.dayOff.includes(wdToday) ||
        onLeave ||
        meta.absentDates.includes(viewDate) ||
        meta.archived;
      const booked = counts[idx];
      const isTop = booked === maxCount && booked > 0 && !isOff;
      const busyNow = isTherapistBusy(t, viewDate, viewTime, 90);
      const slotStatus = meta.archived
        ? "off"
        : isOff
        ? "off"
        : busyNow
        ? "booked"
        : "available";
      const openSlots = WEEKEND_SLOTS.filter(
        (s) => !isTherapistBusy(t, viewDate, s, 90)
      );
      return { t, meta, isOff, onLeave, booked, isTop, slotStatus, openSlots };
    })
    .filter((r) => {
      if (!showArchived && r.meta.archived) return false;
      if (filter === "all") return true;
      if (filter === "available") return r.slotStatus === "available";
      if (filter === "booked")
        return r.slotStatus === "booked" || r.slotStatus === "off";
      return true;
    });

  return (
    <div className="space-y-6">
      {/* SECTION ROW */}
      <div className="flex items-center justify-between flex-wrap gap-2.5">
        <div className="text-[10.5px] font-bold tracking-[0.13em] uppercase text-muted">
          Therapist Roster
        </div>
        <button
          onClick={() => {
            setAddName("");
            setAddDayOff([]);
            setAddServices(ALL_THERAPIST_SERVICES.slice());
            setAddError(null);
            setShowAddModal(true);
          }}
          className="flex items-center gap-1.5 rounded-lg border border-[#a97e2e] bg-surface px-3.5 py-2 text-[11px] font-bold text-accent-gold transition hover:bg-[#c89b3c]/10"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add Therapist
        </button>
      </div>

      {/* FILTER ROW */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <input
          type="date"
          value={viewDate}
          onChange={(e) => setViewDate(e.target.value)}
          className="rounded-lg border border-border bg-surface px-2.5 py-2 text-xs text-foreground outline-none focus:border-gold"
        />
        <select
          value={viewTime}
          onChange={(e) => setViewTime(e.target.value)}
          className="rounded-lg border border-border bg-surface px-2.5 py-2 text-xs text-foreground outline-none focus:border-gold"
        >
          {WEEKEND_SLOTS.map((s) => (
            <option key={s} value={s}>
              {fmtTime(s)}
            </option>
          ))}
        </select>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface px-2.5 py-2 text-xs text-foreground outline-none focus:border-gold"
        >
          <option value="all">Select All</option>
          <option value="available">Available</option>
          <option value="booked">Booked</option>
        </select>
        <label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer ml-1">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="accent-gold"
          />
          Show Archived
        </label>
        <button
          type="button"
          onClick={handleCopyAvailable}
          title="Copy available therapists to clipboard"
          className="flex items-center justify-center rounded-lg border border-border bg-surface p-2 text-muted transition hover:text-gold hover:border-gold/40"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
      </div>

      {/* THERAPIST GRID */}
      {cardRows.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted">
          No therapists match this filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {cardRows.map((r) => {
            const { t, meta, isOff, onLeave, booked, isTop, slotStatus, openSlots } = r;
            const isAbsentToday = meta.absentDates.includes(viewDate);
            const statusLabel = meta.archived
              ? "Archived"
              : onLeave
              ? `On Leave until ${fmtDate(meta.leave?.end || "")}`
              : isAbsentToday
              ? "Absent"
              : slotStatus === "off"
              ? "Day Off"
              : slotStatus === "booked"
              ? `Booked at ${fmtTime(viewTime)}`
              : `Available at ${fmtTime(viewTime)}`;

            return (
              <div
                key={t}
                className={`relative rounded-2xl border border-border bg-surface p-4 transition-all ${
                  meta.archived ? "opacity-60" : ""
                }`}
              >
                {/* Most Requested Badge */}
                {isTop && (
                  <span className="absolute top-3.5 right-11 text-[7.5px] font-extrabold tracking-wider uppercase px-2 py-0.5 rounded-full bg-[#c89b3c]/15 text-accent-gold border border-[#a97e2e]">
                    ✦ Most Requested
                  </span>
                )}

                {/* Top Section */}
                <div className="flex items-start justify-between">
                  <div
                    onClick={() => setScheduleModalTherapist(t)}
                    className="flex items-center gap-3 cursor-pointer group"
                    title={`View ${t}'s schedule`}
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#f3d48b] to-[#8b5a2b] flex items-center justify-center font-serif font-bold text-base text-black shrink-0">
                      {t.charAt(0)}
                    </div>
                    <div>
                      <div className="font-serif font-semibold text-sm text-foreground flex items-center gap-1.5 group-hover:text-gold transition-colors">
                        {t}
                        {meta.archived && (
                          <span className="text-[8px] font-extrabold tracking-wider uppercase px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            Archived
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted mt-0.5">
                        {fmtDate(viewDate)} ({wdToday})
                      </div>
                    </div>
                  </div>

                  {/* Kebab Action Menu */}
                  <div
                    data-kebab-root
                    className="relative"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() =>
                        setOpenKebab(openKebab === t ? null : t)
                      }
                      className="p-1 rounded-md text-muted hover:text-foreground hover:bg-surface-2 transition-colors"
                      title="More actions"
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <circle cx="12" cy="5" r="1.3" fill="currentColor" stroke="none" />
                        <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
                        <circle cx="12" cy="19" r="1.3" fill="currentColor" stroke="none" />
                      </svg>
                    </button>
                    {openKebab === t && (
                      <div className="absolute right-0 top-7 z-30 min-w-[170px] rounded-xl border border-border bg-surface-2 py-1 shadow-2xl overflow-hidden animate-fade-in">
                        {!meta.archived ? (
                          <>
                            <div
                              onClick={() => {
                                setOpenKebab(null);
                                handleMarkAbsent(t);
                              }}
                              className="px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-surface cursor-pointer border-b border-border"
                            >
                              Mark Absent Today
                            </div>
                            <div
                              onClick={() => {
                                setOpenKebab(null);
                                setLeaveTherapist(t);
                                setLeaveStart(todayISO());
                                setLeaveEnd("");
                                setLeaveReason("");
                              }}
                              className="px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-surface cursor-pointer border-b border-border"
                            >
                              Mark On Leave
                            </div>
                            <div
                              onClick={() => {
                                setOpenKebab(null);
                                setArchiveTherapist(t);
                                setArchiveReason("");
                                setArchiveError(null);
                              }}
                              className="px-3.5 py-2 text-xs font-semibold text-rose-400 hover:bg-surface cursor-pointer border-b border-border"
                            >
                              Archive
                            </div>
                            <div
                              onClick={() => {
                                setOpenKebab(null);
                                setEditTherapist(t);
                                setEditName(t);
                                setEditError(null);
                              }}
                              className="px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-surface cursor-pointer"
                            >
                              Edit
                            </div>
                          </>
                        ) : (
                          <>
                            <div
                              onClick={() => {
                                setOpenKebab(null);
                                handleUnarchive(t);
                              }}
                              className="px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-surface cursor-pointer border-b border-border"
                            >
                              Unarchive
                            </div>
                            <div
                              onClick={() => {
                                setOpenKebab(null);
                                setEditTherapist(t);
                                setEditName(t);
                                setEditError(null);
                              }}
                              className="px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-surface cursor-pointer"
                            >
                              Edit
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Status Line */}
                <div
                  className={`mt-3 text-[10px] font-bold flex items-center gap-1.5 ${
                    slotStatus === "available"
                      ? "text-accent-green"
                      : slotStatus === "booked"
                      ? "text-accent-amber"
                      : "text-accent-red"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      slotStatus === "available"
                        ? "bg-[#8a9a76] shadow-[0_0_5px_#8a9a76]"
                        : slotStatus === "booked"
                        ? "bg-[#d9a441]"
                        : "bg-[#d18b8b]"
                    }`}
                  />
                  {statusLabel}
                </div>

                {/* Slots Summary / Notes */}
                <div className="text-[10.5px] text-muted mt-1.5">
                  {isOff && !meta.archived ? (
                    ""
                  ) : meta.archived ? (
                    `Reason: ${meta.archivedReason || "—"}`
                  ) : (
                    <>
                      <b className="text-accent-gold">{booked} / {WEEKEND_SLOTS.length}</b>{" "}
                      slots booked today
                    </>
                  )}
                </div>

                {onLeave && meta.leave?.reason && (
                  <div className="mt-2 text-[10px] font-bold text-accent-amber bg-[#d9a441]/10 border border-[#6b4f1f] rounded-lg px-2.5 py-1.5">
                    Reason: {meta.leave.reason}
                  </div>
                )}

                {/* Available Slot Section */}
                <div className="text-[9px] font-bold tracking-wider uppercase text-muted mt-3 mb-1.5">
                  Available Slot
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {openSlots.length === 0 ? (
                    <span className="px-2.5 py-1 rounded-full text-[9.5px] font-bold bg-[#F5E4E1] text-[#8A3A2E]">
                      Fully booked
                    </span>
                  ) : (
                    openSlots.slice(0, 3).map((s) => (
                      <span
                        key={s}
                        className="px-2.5 py-1 rounded-full text-[9.5px] font-bold bg-[#E9F1E1] text-[#3D5A29]"
                      >
                        {fmtTime(s)}
                      </span>
                    ))
                  )}
                </div>

                {/* Weekly Day(s) Off Section */}
                <div className="text-[9px] font-bold tracking-wider uppercase text-muted mt-3 mb-1.5">
                  Weekly Day(s) Off
                </div>
                <div className="flex gap-1">
                  {WEEKDAYS.map((d) => {
                    const isDayOff = meta.dayOff.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => handleToggleDayOff(t, d)}
                        className={`flex-1 py-1 rounded-md border text-[9.5px] font-bold transition-all text-center ${
                          isDayOff
                            ? "bg-gradient-to-br from-[#5e3c3c] to-[#7a4646] text-white border-[#5e3c3c]"
                            : "bg-surface-2 text-muted border-border hover:border-gold/40"
                        }`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: Therapist Daily Schedule */}
      {scheduleModalTherapist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl space-y-4">
            <div>
              <h3 className="text-base font-serif font-bold text-foreground">
                {scheduleModalTherapist}
              </h3>
              <p className="text-[11px] text-muted mt-0.5">
                Date: {fmtDate(viewDate)} ·{" "}
                <span className="font-semibold text-gold">
                  {
                    bookings.filter(
                      (b) =>
                        b.therapist === scheduleModalTherapist &&
                        b.date === viewDate &&
                        (b.status === "Booked" || b.status === "Completed")
                    ).length
                  }{" "}
                  / {WEEKEND_SLOTS.length}
                </span>{" "}
                slots booked
              </p>
            </div>

            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {bookings.filter(
                (b) =>
                  b.therapist === scheduleModalTherapist &&
                  b.date === viewDate &&
                  (b.status === "Booked" ||
                    b.status === "Completed" ||
                    b.status === "Needs Reassignment")
              ).length === 0 ? (
                <div className="py-4 text-center text-xs text-muted">
                  No bookings for this date.
                </div>
              ) : (
                bookings
                  .filter(
                    (b) =>
                      b.therapist === scheduleModalTherapist &&
                      b.date === viewDate &&
                      (b.status === "Booked" ||
                        b.status === "Completed" ||
                        b.status === "Needs Reassignment")
                  )
                  .sort((a, b) => spaSortMin(a.time) - spaSortMin(b.time))
                  .map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs"
                    >
                      <span className="font-mono font-bold text-accent-gold">
                        {fmtTime(b.time)}
                      </span>
                      <span className="font-semibold text-foreground">
                        {b.clientName}
                      </span>
                    </div>
                  ))
              )}
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setScheduleModalTherapist(null)}
                className="w-full rounded-lg border border-border py-2 text-xs font-bold text-muted hover:text-foreground"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Add Therapist */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl space-y-4">
            <div>
              <h3 className="text-base font-serif font-bold text-foreground">
                Add Therapist
              </h3>
              <p className="text-[11px] text-muted mt-0.5">
                Not every therapist offers every service — select what they're
                trained for.
              </p>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
                  Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Renz"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground outline-none focus:border-gold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
                  Day(s) Off
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((d) => {
                    const selected = addDayOff.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          setAddDayOff((prev) =>
                            selected
                              ? prev.filter((x) => x !== d)
                              : [...prev, d]
                          )
                        }
                        className={`px-3 py-1.5 rounded-full border text-[10.5px] font-bold transition-all ${
                          selected
                            ? "bg-gradient-to-br from-gold to-[#a97e2e] text-black border-gold"
                            : "bg-surface-2 text-muted border-border"
                        }`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
                  Services Offered <span className="lowercase font-normal opacity-70">(multi-select)</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_THERAPIST_SERVICES.map((s) => {
                    const selected = addServices.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() =>
                          setAddServices((prev) =>
                            selected
                              ? prev.filter((x) => x !== s)
                              : [...prev, s]
                          )
                        }
                        className={`px-3 py-1.5 rounded-full border text-[10.5px] font-bold transition-all ${
                          selected
                            ? "bg-gradient-to-br from-gold to-[#a97e2e] text-black border-gold"
                            : "bg-surface-2 text-muted border-border"
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>

              {addError && (
                <div className="text-[11px] text-rose-400 font-medium">
                  {addError}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAdd}
                className="flex-1 rounded-lg bg-gold py-2 text-xs font-bold text-black hover:brightness-110"
              >
                Add Therapist
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Mark On Leave */}
      {leaveTherapist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl space-y-4">
            <div>
              <h3 className="text-base font-serif font-bold text-foreground">
                Mark On Leave
              </h3>
              <p className="text-[11px] text-muted mt-0.5">{leaveTherapist}</p>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={leaveStart}
                    onChange={(e) => setLeaveStart(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-xs text-foreground outline-none focus:border-gold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={leaveEnd}
                    onChange={(e) => setLeaveEnd(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-xs text-foreground outline-none focus:border-gold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
                  Reason <span className="lowercase font-normal opacity-70">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. sick leave"
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground outline-none focus:border-gold"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setLeaveTherapist(null)}
                className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmLeave}
                className="flex-1 rounded-lg bg-gold py-2 text-xs font-bold text-black hover:brightness-110"
              >
                Save Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Archive Therapist */}
      {archiveTherapist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl space-y-4">
            <div>
              <h3 className="text-base font-serif font-bold text-foreground">
                Archive Therapist
              </h3>
              <p className="text-[11px] text-muted mt-0.5">
                Are you sure you want to archive {archiveTherapist}?
              </p>
            </div>

            <div className="text-[11px] text-muted leading-relaxed">
              They'll be removed from booking/roster lists, but stay in past
              bookings, sales, and Analytics for the audit trail. Any of their
              upcoming Booked appointments will be flagged{" "}
              <b className="text-amber-400">Needs Reassignment</b>.
            </div>

            <div>
              <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
                Reason <span className="lowercase font-normal opacity-70">(required)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Resigned, AWOL"
                value={archiveReason}
                onChange={(e) => setArchiveReason(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground outline-none focus:border-gold"
              />
              {archiveError && (
                <div className="text-[11px] text-rose-400 font-medium mt-1">
                  {archiveError}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setArchiveTherapist(null)}
                className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmArchive}
                className="flex-1 rounded-lg bg-rose-500/80 py-2 text-xs font-bold text-white hover:bg-rose-500"
              >
                Archive
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Edit Therapist Name */}
      {editTherapist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl space-y-4">
            <div>
              <h3 className="text-base font-serif font-bold text-foreground">
                Edit Therapist Name
              </h3>
              <p className="text-[11px] text-muted mt-0.5">
                Fixes a typo without needing to archive and re-add.
              </p>
            </div>

            <div>
              <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
                Name
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-foreground outline-none focus:border-gold"
              />
              {editError && (
                <div className="text-[11px] text-rose-400 font-medium mt-1">
                  {editError}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditTherapist(null)}
                className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmEdit}
                className="flex-1 rounded-lg bg-gold py-2 text-xs font-bold text-black hover:brightness-110"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl border border-[#a97e2e] bg-surface-2 px-5 py-2.5 font-mono text-xs font-semibold text-accent-gold shadow-2xl animate-fade-in">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
