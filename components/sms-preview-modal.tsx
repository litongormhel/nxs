"use client";

import { useState } from "react";

// TEMP: placeholder SMS copy pending locked format — no SMS gateway is wired
// into this repo yet, so this is a compose/preview step only, not a real send.
function buildPlaceholderMessage(booking: {
  codename: string;
  serviceName: string;
  price: number;
  date: string;
  startTime: string;
}): string {
  return `Hi ${booking.codename}, your ${booking.serviceName} booking is confirmed for ${booking.date} at ${booking.startTime}. Amount: ₱${booking.price}. See you soon!`;
}

export function SmsPreviewModal({
  booking,
  onClose,
}: {
  booking: {
    codename: string;
    serviceName: string;
    price: number;
    date: string;
    startTime: string;
  };
  onClose: () => void;
}) {
  const [text, setText] = useState(buildPlaceholderMessage(booking));
  const [copied, setCopied] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide">
          SMS Preview
        </h2>
        <p className="mt-1 text-xs text-muted">
          Booking created. No SMS gateway is configured yet — edit below, then
          copy and send manually.
        </p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="mt-4 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        />

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(text);
              setCopied(true);
            }}
            className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:border-gold/30"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gold bg-gold/10 px-4 py-2 text-sm font-medium text-gold hover:bg-gold/20"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
