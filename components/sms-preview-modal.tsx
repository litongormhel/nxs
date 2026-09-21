"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DEFAULT_SMS_TEMPLATE, interpolateSmsTemplate } from "@/lib/bookings/sms";

export function SmsPreviewModal({
  booking,
  initialMessage,
  onClose,
}: {
  booking: {
    codename: string;
    serviceName: string;
    price: number;
    date: string;
    startTime: string;
    therapistName?: string | null;
    roomNumber?: number | string | null;
  };
  initialMessage?: string;
  onClose: () => void;
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

  async function handleCopy() {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => {
        setCopied(false);
      }, 3000);
    } catch (err) {
      console.error("Failed to copy SMS preview text:", err);
    }
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
        className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-accent-gold uppercase tracking-wider">
          SMS Booking Confirmation Preview
        </h2>
        <p className="mt-1 text-xs text-muted">
          Review or edit the confirmation message below before copying to send to the client.
        </p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={11}
          className="mt-4 w-full rounded-lg border border-border bg-background px-3.5 py-2.5 font-mono text-[12px] leading-relaxed text-foreground focus:border-gold outline-none resize-y"
        />

        <div className="mt-6 flex justify-end gap-3">
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
            onClick={onClose}
            className="rounded-md border border-gold bg-gold/10 px-5 py-2 text-sm font-semibold text-gold hover:bg-gold/20 transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
