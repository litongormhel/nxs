"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DEFAULT_SMS_TEMPLATE, interpolateSmsTemplate } from "@/lib/bookings/sms";

export type SmsConfirmationBooking = {
  codename: string;
  serviceName: string;
  price: number;
  date: string;
  startTime: string;
  therapistName?: string | null;
  roomNumber?: number | string | null;
  phone?: string | null;
};

export function SmsConfirmationModal({
  booking,
  initialMessage,
  onClose,
  onSend,
}: {
  booking: SmsConfirmationBooking;
  initialMessage?: string;
  onClose: () => void;
  onSend?: (message: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [text, setText] = useState(() => {
    if (initialMessage) return initialMessage;
    return interpolateSmsTemplate(DEFAULT_SMS_TEMPLATE, {
      booking_date: booking.date,
      client_name: booking.codename,
      slot_time: booking.startTime,
      therapist_name: booking.therapistName ?? "—",
      service_name: booking.serviceName,
      amount: booking.price,
      room_number: booking.roomNumber,
    });
  });
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  async function copyToClipboard(str: string): Promise<boolean> {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(str);
        return true;
      } else {
        const ta = document.createElement("textarea");
        ta.value = str;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const success = document.execCommand("copy");
        document.body.removeChild(ta);
        return success;
      }
    } catch (err) {
      console.error("Failed to copy SMS text to clipboard:", err);
      return false;
    }
  }

  async function handleCopy() {
    const success = await copyToClipboard(text);
    if (success) {
      setCopied(true);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => {
        setCopied(false);
      }, 3000);
    }
  }

  async function handleSendSms() {
    await copyToClipboard(text);
    if (onSend) {
      onSend(text);
    }
    const cleanPhone = booking.phone?.replace(/[^\d+]/g, "") || "";
    if (typeof window !== "undefined") {
      const smsUri = cleanPhone
        ? `sms:${cleanPhone}?body=${encodeURIComponent(text)}`
        : `sms:?body=${encodeURIComponent(text)}`;
      try {
        window.location.href = smsUri;
      } catch (err) {
        console.warn("Could not launch default SMS app:", err);
      }
    }
    onClose();
  }

  if (!mounted || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="relative w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header with Close Button */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-accent-gold uppercase tracking-wider">
              SMS Booking Confirmation
            </h2>
            <p className="mt-1 text-xs text-muted">
              Review or edit the confirmation message below before sending to the client.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-md p-1.5 text-muted hover:bg-background hover:text-foreground transition-all"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Recipient Details (if available) */}
        {booking.phone && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-border/60 bg-background/50 px-3 py-1.5 text-xs text-muted">
            <span className="font-medium text-foreground">Recipient:</span>
            <span className="font-mono text-accent-gold">{booking.phone}</span>
          </div>
        )}

        {/* Message Textarea */}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={11}
          className="mt-4 w-full rounded-lg border border-border bg-background px-3.5 py-2.5 font-mono text-[12px] leading-relaxed text-foreground focus:border-gold outline-none resize-y"
        />

        {/* Action Controls */}
        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted hover:border-gold/30 hover:text-foreground transition-all"
          >
            Skip
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className={`rounded-md border px-4 py-2 text-sm font-medium transition-all ${
                copied
                  ? "border-emerald-500/60 bg-emerald-950/20 text-emerald-400 font-semibold"
                  : "border-border text-foreground hover:border-gold/30 hover:text-gold"
              }`}
            >
              {copied ? "✓ Copied!" : "Copy"}
            </button>
            <button
              type="button"
              onClick={handleSendSms}
              className="rounded-md border border-gold bg-gold px-5 py-2 text-sm font-semibold text-black hover:brightness-105 transition-all shadow-sm"
            >
              Send SMS
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Retain SmsPreviewModal export for backwards compatibility
export const SmsPreviewModal = SmsConfirmationModal;
