"use client";

import { useState, useEffect } from "react";
import {
  isSlotPastGracePeriod,
  slotsOverlap,
} from "@/lib/bookings/slots";
import type {
  TherapistMetaRecord,
  BookingInfo,
} from "@/components/therapist-browser";

export const WEEKEND_SLOTS = [
  "16:00",
  "17:30",
  "19:00",
  "20:30",
  "22:00",
  "23:30",
  "01:00",
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const ALL_THERAPIST_SERVICES = [
  "Combi Massage",
  "Signature Massage",
  "Scrub",
];

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

export interface TherapistCardProps {
  therapist: string;
  therapistId?: string;
  meta: TherapistMetaRecord;
  viewDate: string;
  currentTime: Date;
  bookings: BookingInfo[];
  isTop?: boolean;
  onToggleDayOff: (day: string) => void;
  onToggleService: (service: string) => void;
  onRequestMarkAbsent: () => void;
  onMarkPresent: () => void;
  onRequestLeave: () => void;
  onRequestArchive: () => void;
  onUnarchive: () => void;
  onRequestEdit: () => void;
  onViewSchedule: () => void;
  isMenuOpen?: boolean;
  onToggleMenu?: () => void;
  onBookSlot: (slot: string) => void;
}

export function TherapistCard({
  therapist,
  therapistId,
  meta,
  viewDate,
  currentTime,
  bookings,
  isTop = false,
  isMenuOpen,
  onToggleMenu,
  onToggleDayOff,
  onToggleService,
  onRequestMarkAbsent,
  onMarkPresent,
  onRequestLeave,
  onRequestArchive,
  onUnarchive,
  onRequestEdit,
  onViewSchedule,
  onBookSlot,
}: TherapistCardProps) {
  const [localMenuOpen, setLocalMenuOpen] = useState<boolean>(false);
  const menuOpen = typeof isMenuOpen === "boolean" ? isMenuOpen : localMenuOpen;
  const toggleMenu = onToggleMenu ?? (() => setLocalMenuOpen((prev) => !prev));
  const closeMenu = () => {
    if (onToggleMenu && isMenuOpen) {
      onToggleMenu();
    } else {
      setLocalMenuOpen(false);
    }
  };

  // Close menu when clicking outside this card's menu
  useEffect(() => {
    if (!menuOpen) return;
    const handleDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`[data-kebab-card="${therapist}"]`)) {
        closeMenu();
      }
    };
    document.addEventListener("click", handleDocClick);
    return () => document.removeEventListener("click", handleDocClick);
  }, [menuOpen, therapist]);

  const wdToday = WEEKDAYS[new Date(viewDate + "T00:00:00").getDay()];

  // Leave check
  const isOnLeave = Boolean(
    meta.leave && viewDate >= meta.leave.start && viewDate <= meta.leave.end
  );

  // State classification
  const isArchived = Boolean(meta.archived);
  const isAbsentToday = meta.absentDates.includes(viewDate);
  const isDayOff = meta.dayOff.includes(wdToday);
  const isAvailable = !isArchived && !isOnLeave && !isAbsentToday && !isDayOff;

  // Active bookings check for overlap
  const isTherapistBusy = (time: string, dur = 90): boolean => {
    return bookings.some((b) => {
      const matchTherapist =
        b.therapist === therapist ||
        (therapistId && b.therapist === therapistId) ||
        (b as any).therapist_id === therapistId;
      const matchDate =
        b.date === viewDate || (b as any).booking_date === viewDate;
      const isActive = b.status !== "Cancelled";
      return (
        matchTherapist &&
        matchDate &&
        isActive &&
        slotsOverlap(time, dur, b.time, 90)
      );
    });
  };

  // Slot classification: free, taken (future AND booked), or past
  const classifiedSlots = WEEKEND_SLOTS.map((slot) => {
    const isPast = isSlotPastGracePeriod(slot, viewDate, currentTime, 20);
    const isBooked = isTherapistBusy(slot, 90);
    const isFree = !isPast && !isBooked;
    return {
      slot,
      isPast,
      isBooked,
      isFree,
    };
  });

  // Next bookable slot is the first chronological free slot for this therapist
  const nextSlotObj = isAvailable
    ? classifiedSlots.find((s) => s.isFree)
    : undefined;
  const nextSlot = nextSlotObj?.slot;

  // Status Line and Dot derivation
  let statusDotClass = "bg-[#8a8378]"; // Default unavailable gray
  let statusText = "";

  if (isArchived) {
    statusDotClass = "bg-[#8a8378]";
    statusText = "Archived";
  } else if (isOnLeave) {
    statusDotClass = "bg-[#8a8378]";
    statusText = meta.leave?.end
      ? `On leave until ${fmtDate(meta.leave.end)}`
      : "On leave";
  } else if (isAbsentToday) {
    statusDotClass = "bg-[#8a8378]";
    statusText = "Absent today";
  } else if (isDayOff) {
    statusDotClass = "bg-[#8a8378]";
    statusText = "Day off";
  } else if (isAvailable) {
    if (nextSlot) {
      statusDotClass = "bg-[#5dcaa5] shadow-[0_0_6px_#5dcaa5]";
      statusText = `Available now · free at ${fmtTime(nextSlot)}`;
    } else {
      statusDotClass = "bg-[#EF9F27]";
      statusText = "No available slots for today";
    }
  }

  // Booked today count for progress calculation
  const bookedToday = bookings.filter((b) => {
    const matchTherapist =
      b.therapist === therapist ||
      (therapistId && b.therapist === therapistId) ||
      (b as any).therapist_id === therapistId;
    const matchDate =
      b.date === viewDate || (b as any).booking_date === viewDate;
    return matchTherapist && matchDate && b.status !== "Cancelled";
  }).length;

  const totalSlots = WEEKEND_SLOTS.length;
  const progressPct = Math.min(100, Math.round((bookedToday / totalSlots) * 100));

  return (
    <div
      className={`relative rounded-2xl border border-white/10 bg-[#14100c] p-4 sm:p-5 transition-all flex flex-col justify-between ${
        isArchived ? "opacity-60" : ""
      }`}
      data-thera={therapistId ?? therapist}
    >
      <div>
        {/* Card Head */}
        <div className="flex items-center justify-between gap-2 mb-3.5">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Avatar */}
            <div
              onClick={onViewSchedule}
              className={`w-10 h-10 rounded-full flex items-center justify-center font-serif font-bold text-sm shrink-0 cursor-pointer transition-transform hover:scale-105 ${
                isAvailable
                  ? "bg-gradient-to-br from-[#f3d48b] to-[#8b5a2b] text-black"
                  : "bg-[#5f5e5a] text-[#f2ede4]"
              }`}
              title={`View ${therapist}'s schedule`}
            >
              {therapist.charAt(0)}
            </div>

            {/* Name and Status Line */}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span
                  onClick={onViewSchedule}
                  className="font-medium text-[15px] sm:text-base text-[#f2ede4] truncate cursor-pointer hover:text-gold transition-colors"
                >
                  {therapist}
                </span>
                <span
                  className={`w-1.5 h-1.5 rounded-full inline-block shrink-0 ${statusDotClass}`}
                  aria-hidden="true"
                />
              </div>
              <div className="text-[11.5px] text-[#8a8378] truncate mt-0.5">
                {statusText}
              </div>
            </div>
          </div>

          {/* Right Action Icons & Badge */}
          <div className="flex items-center gap-2 shrink-0">
            {isTop && (
              <span className="text-[9.5px] font-semibold text-[#412402] bg-[#EF9F27] px-2 py-0.5 rounded-full whitespace-nowrap shadow-sm">
                ✦ Most requested
              </span>
            )}

            {/* Overflow Menu Button */}
            <div
              data-kebab-card={therapist}
              data-kebab-root
              className="relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={toggleMenu}
                className="p-1 rounded-md text-[#8a8378] hover:text-[#f2ede4] hover:bg-white/5 transition-colors"
                aria-label="More actions"
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

              {/* Overflow Menu Dropdown */}
              {menuOpen && (
                <div className="absolute right-0 top-7 z-30 min-w-[170px] rounded-xl border border-white/15 bg-[#221c15] p-1.5 shadow-2xl overflow-hidden animate-fade-in text-xs font-medium text-[#d8d2c4]">
                  {!isArchived ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          closeMenu();
                          onRequestEdit();
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors flex items-center gap-2"
                      >
                        Edit
                      </button>

                      {isAbsentToday || isOnLeave ? (
                        <button
                          type="button"
                          onClick={() => {
                            closeMenu();
                            onMarkPresent();
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg text-emerald-400 hover:bg-white/5 transition-colors flex items-center gap-2"
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          Mark Present Today
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            closeMenu();
                            onRequestMarkAbsent();
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
                        >
                          Mark as absent
                        </button>
                      )}

                      {!isAbsentToday && !isOnLeave && (
                        <button
                          type="button"
                          onClick={() => {
                            closeMenu();
                            onRequestLeave();
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
                        >
                          Mark on leave
                        </button>
                      )}

                      <hr className="border-t border-white/10 my-1 mx-1" />

                      <button
                        type="button"
                        onClick={() => {
                          closeMenu();
                          onRequestArchive();
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg text-rose-400 hover:bg-white/5 transition-colors"
                      >
                        Archive
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          closeMenu();
                          onUnarchive();
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
                      >
                        Unarchive
                      </button>
                      <hr className="border-t border-white/10 my-1 mx-1" />
                      <button
                        type="button"
                        onClick={() => {
                          closeMenu();
                          onRequestEdit();
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
                      >
                        Edit
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Progress Row / Unavailable Note */}
        {isAvailable ? (
          <div className="mb-3.5">
            <div className="flex justify-between items-center text-xs text-[#8a8378] mb-1.5">
              <span>Booked today</span>
              <span className="text-accent-gold font-medium">
                {bookedToday} / {totalSlots} slots
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-gold rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="text-xs text-[#8a8378] mb-3.5">
            Not accepting bookings today.
          </div>
        )}

        {/* Available Slots Section */}
        <div className="mb-3.5">
          <div className="text-[11px] text-[#8a8378] tracking-[0.03em] mb-2 uppercase font-medium">
            Available slots
          </div>
          <div
            className={`grid grid-cols-4 gap-1.5 ${
              isAvailable ? "" : "opacity-40 pointer-events-none"
            }`}
          >
            {classifiedSlots.map(({ slot, isPast, isBooked, isFree }) => {
              const isNext = isAvailable && slot === nextSlot;

              if (!isAvailable) {
                return (
                  <span
                    key={slot}
                    className="text-center text-xs py-1.5 rounded-lg border border-white/10 text-[#4d493f] bg-none"
                  >
                    {fmtTime(slot)}
                  </span>
                );
              }

              if (isNext) {
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => onBookSlot(slot)}
                    className="text-center text-xs py-1.5 rounded-lg font-semibold bg-[#f2ede4] text-[#1a1512] border-none shadow-sm cursor-pointer hover:brightness-105 transition-all"
                    title={`Next bookable slot: ${fmtTime(slot)}`}
                  >
                    {fmtTime(slot)}
                  </button>
                );
              }

              if (isPast) {
                return (
                  <span
                    key={slot}
                    className="text-center text-xs py-1.5 rounded-lg border border-white/5 text-[#4d493f] line-through cursor-default pointer-events-none"
                    title={`${fmtTime(slot)} has passed`}
                  >
                    {fmtTime(slot)}
                  </span>
                );
              }

              if (isBooked) {
                return (
                  <span
                    key={slot}
                    className="text-center text-xs py-1.5 rounded-lg border border-dashed border-white/10 text-[#6f6a60] line-through cursor-not-allowed"
                    title={`${fmtTime(slot)} is already booked`}
                  >
                    {fmtTime(slot)}
                  </span>
                );
              }

              // Future & Free
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => onBookSlot(slot)}
                  className="text-center text-xs py-1.5 rounded-lg border border-white/15 text-[#d8d2c4] hover:border-gold hover:text-gold transition-colors cursor-pointer"
                  title={`Book ${fmtTime(slot)}`}
                >
                  {fmtTime(slot)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Weekly Day(s) Off Section */}
        <div className="mb-3.5">
          <div className="text-[11px] text-[#8a8378] tracking-[0.03em] mb-2 uppercase font-medium">
            Weekly day(s) off
          </div>
          <div className="flex gap-1">
            {WEEKDAYS.map((d) => {
              const isOff = meta.dayOff.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => onToggleDayOff(d)}
                  className={`flex-1 py-1 rounded-md text-[10px] font-semibold transition-all text-center ${
                    isOff
                      ? "bg-[#993556] text-[#fbeaf0] border border-transparent shadow-sm"
                      : "border border-white/10 text-[#8a8378] hover:border-gold/40 hover:text-foreground"
                  }`}
                  title={`${therapist} - ${d} ${isOff ? "Day Off" : "Working"}`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>

        {/* Services Offered Section */}
        <div className="mb-4">
          <div className="text-[11px] text-[#8a8378] tracking-[0.03em] mb-2 uppercase font-medium">
            Services offered
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ALL_THERAPIST_SERVICES.map((s) => {
              const isOffered = meta.services.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => onToggleService(s)}
                  className={`py-1 px-2.5 rounded-md text-[10.5px] font-semibold transition-all text-center ${
                    isOffered
                      ? "bg-[#3b6d11] text-[#EAF3DE] border border-transparent shadow-sm"
                      : "border border-white/10 text-[#8a8378]/70 hover:border-gold/40 hover:text-foreground"
                  }`}
                  title={`${therapist} - ${s} ${isOffered ? "Offered" : "Not Offered"}`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Book CTA Button (only rendered when therapist is available) */}
      {isAvailable && (
        <div className="pt-1">
          {nextSlot ? (
            <button
              type="button"
              onClick={() => onBookSlot(nextSlot)}
              className="w-full bg-gold text-black font-semibold text-xs py-2.5 rounded-lg hover:brightness-105 transition-all shadow-sm cursor-pointer"
            >
              Book {fmtTime(nextSlot)}
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="w-full bg-white/5 text-[#4d493f] font-semibold text-xs py-2.5 rounded-lg cursor-not-allowed border border-white/5"
            >
              No slots left today
            </button>
          )}
        </div>
      )}
    </div>
  );
}
