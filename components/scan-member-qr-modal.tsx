"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { resolveMemberQr } from "@/app/(staff)/bookings/actions";

export type ScannedClient = {
  id: string;
  codename: string;
  username: string;
  points_balance: number;
};

export function ScanMemberQrModal({
  onClose,
  onResolved,
}: {
  onClose: () => void;
  onResolved: (client: ScannedClient) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastAttemptedRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  async function handleDecoded(qrToken: string) {
    setResolving(true);
    setError(null);
    const res = await resolveMemberQr(qrToken);
    setResolving(false);
    // Allow retrying the same/a different token after a failed scan.
    lastAttemptedRef.current = null;
    if (!res.ok) {
      setError(
        res.reason === "orphaned"
          ? "This QR is linked to a portal account with no client record. Please search manually."
          : "Unrecognized or expired QR code. Please try again."
      );
      return;
    }
    onResolved(res.client);
  }

  const handleDecodedRef = useRef(handleDecoded);
  useEffect(() => {
    handleDecodedRef.current = handleDecoded;
  });

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        tick();
      } catch {
        if (!cancelled) {
          setCameraError("Could not access the camera. Check browser/site camera permission.");
        }
      }
    }

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code && code.data && code.data !== lastAttemptedRef.current) {
        lastAttemptedRef.current = code.data;
        void handleDecodedRef.current(code.data);
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    start();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Scan Member QR</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-muted hover:text-foreground"
          >
            Close
          </button>
        </div>

        <div className="relative aspect-square w-full overflow-hidden rounded-md border border-border bg-black">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
          <canvas ref={canvasRef} className="hidden" />
          {resolving && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs text-white">
              Looking up client…
            </div>
          )}
        </div>

        {cameraError && <p className="text-xs text-accent-red">{cameraError}</p>}
        {error && <p className="text-xs text-accent-red">{error}</p>}
        {!cameraError && !error && (
          <p className="text-xs text-muted">Point the camera at the client&apos;s Member QR.</p>
        )}
      </div>
    </div>
  );
}
