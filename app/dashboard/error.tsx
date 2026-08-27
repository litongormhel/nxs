"use client";

import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error boundary caught:", error);
  }, [error]);

  return (
    <div className="p-8 flex flex-col items-start gap-4">
      <h1 className="text-xl font-semibold text-red-500">Something went wrong inside the Dashboard!</h1>
      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 max-w-md">
        <p className="text-sm text-red-400 font-medium">Error Details:</p>
        <p className="mt-1 text-xs text-muted font-mono break-all">{error.message || "An unexpected error occurred."}</p>
      </div>
      <button
        onClick={() => reset()}
        className="px-4 py-2 bg-gold hover:bg-gold-hover text-background font-semibold rounded text-sm transition-colors cursor-pointer"
      >
        Try Again
      </button>
    </div>
  );
}
