"use client";

import { useState, useRef, useMemo } from "react";
import { computeLoyaltyPoints, WET_AREA_POINTS, type LoyaltyFormulaMode } from "@/lib/loyalty";
import { importOfflineVisits, type ParsedOfflineRowInput } from "@/app/(staff)/clients/actions";

export type ClientCandidate = {
  id: string;
  codename: string;
  username: string;
  member_code: string;
  phone?: string | null;
};

export type ServiceCandidate = {
  id: string;
  name: string;
  price: number;
  points_earned: number;
};

export type TherapistCandidate = {
  id: string;
  name: string;
};

export type ParsedOfflineRow = {
  rowNumber: number;
  rawDate: string;
  date: string;
  time: string;
  clientIdentifier: string;
  matchedClient: ClientCandidate | null;
  serviceId: string | null;
  serviceName: string;
  resolvedServiceName: string | null;
  therapistId: string | null;
  therapistName: string | null;
  roomNumber: number | null;
  lockerNumber: number | null;
  paymentMethod: string;
  amount: number;
  promoCode?: string;
  notes: string;
  pointsDelta: number;
  pointsToCredit: number;
  status: "matched_member" | "walk_in" | "invalid_service";
  validationError?: string;
};

interface OfflineCsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  clients: ClientCandidate[];
  services: ServiceCandidate[];
  therapists: TherapistCandidate[];
  loyaltySettings?: { mode: string; pesoPerPoint: number | null };
  onSuccess?: (result: {
    importedCount: number;
    skippedCount: number;
    pointsTotal: number;
    salesTotal: number;
  }) => void;
}

// Resilient CSV text parser supporting quoted values and linebreaks
function parseCsvText(text: string): { headers: string[]; rows: string[][] } {
  const lines: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === "," && !insideQuotes) {
      currentRow.push(currentField.trim());
      currentField = "";
    } else if ((char === "\r" || char === "\n") && !insideQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i++; // skip \n in CRLF
      }
      currentRow.push(currentField.trim());
      if (currentRow.some((field) => field.length > 0)) {
        lines.push(currentRow);
      }
      currentRow = [];
      currentField = "";
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((field) => field.length > 0)) {
      lines.push(currentRow);
    }
  }

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const rawHeaders = lines[0].map((h) => h.toLowerCase().replace(/[\s_-]+/g, ""));
  const dataRows = lines.slice(1);

  return { headers: rawHeaders, rows: dataRows };
}

// Standard sanitized digits comparison for Philippine mobile numbers
function sanitizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 10) {
    return digits.slice(-10); // Match last 10 digits (e.g. 9171234567)
  }
  return digits;
}

export function OfflineCsvImportModal({
  isOpen,
  onClose,
  clients,
  services,
  therapists,
  loyaltySettings = { mode: "proportional", pesoPerPoint: null },
  onSuccess,
}: OfflineCsvImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedOfflineRow[]>([]);
  const [targetDateOverride, setTargetDateOverride] = useState<string>("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [importResult, setImportResult] = useState<{
    ok: boolean;
    importedCount: number;
    skippedCount: number;
    pointsTotal: number;
    salesTotal: number;
    error?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Download template CSV helper
  const handleDownloadTemplate = () => {
    const headers = "date,time,client_identifier,service_name,therapist_name,room_number,locker_number,payment_method,amount,promo_code,notes";
    const sampleRows = [
      "2026-09-24,17:00,09171234567,Combi Massage,Ron,1,12,Cash,1200,SEPTREAT,Regular member visit",
      "2026-09-24,18:30,guest_mike,Wet Area,,,15,GCash,500,,Offline walkin sauna",
      "2026-09-24,19:15,alex_c,Prime Scrub Massage,Kiko,2,8,Card,1800,PRIME200,Offline fallback entry",
    ];
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...sampleRows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "template_offline_visits.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Process CSV file
  const handleFileChange = (selectedFile: File) => {
    setFile(selectedFile);
    setParseError(null);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) {
          setParseError("The uploaded CSV file is empty.");
          return;
        }

        const { headers, rows } = parseCsvText(text);
        if (rows.length === 0) {
          setParseError("No data rows found in the CSV file.");
          return;
        }

        // Map column indices
        const dateIdx = headers.findIndex((h) => ["date", "visitdate", "bookingdate"].includes(h));
        const timeIdx = headers.findIndex((h) => ["time", "starttime", "visittime"].includes(h));
        const clientIdx = headers.findIndex((h) =>
          ["clientidentifier", "client", "clientid", "phone", "username", "codename", "member", "guest"].includes(h)
        );
        const serviceIdx = headers.findIndex((h) => ["servicename", "service"].includes(h));
        const therapistIdx = headers.findIndex((h) => ["therapistname", "therapist", "thera"].includes(h));
        const roomIdx = headers.findIndex((h) => ["roomnumber", "room"].includes(h));
        const lockerIdx = headers.findIndex((h) => ["lockernumber", "locker"].includes(h));
        const paymentIdx = headers.findIndex((h) => ["paymentmethod", "payment"].includes(h));
        const amountIdx = headers.findIndex((h) => ["amount", "price", "paid"].includes(h));
        const promoIdx = headers.findIndex((h) => ["promocode", "promo", "code", "voucher"].includes(h));
        const notesIdx = headers.findIndex((h) => ["notes", "note", "remarks"].includes(h));

        if ((dateIdx === -1 && !targetDateOverride) || serviceIdx === -1) {
          setParseError("CSV must contain at least 'date' and 'service_name' header columns (or set a Target Spa Date Override).");
          return;
        }

        // Active Prime Scrub Massage single source of truth lookup
        const primeScrubSvc = services.find((s) => s.name.toLowerCase().includes("prime scrub"));
        const wetAreaSvc = services.find((s) => s.name.toLowerCase().includes("wet area"));

        const parsed: ParsedOfflineRow[] = rows.map((row, idx) => {
          const rowNum = idx + 2; // 1-indexed, skipping header
          const rawDate = (dateIdx !== -1 ? row[dateIdx] ?? "" : "").trim();
          const effectiveDate = targetDateOverride.trim() || rawDate;

          let rawTime = (timeIdx !== -1 ? row[timeIdx] ?? "" : "").trim();
          if (rawTime.length === 4 && rawTime.includes(":")) {
            rawTime = "0" + rawTime;
          } else if (!rawTime) {
            rawTime = "17:00"; // default fallback time
          }

          const rawClient = (clientIdx !== -1 ? row[clientIdx] ?? "" : "").trim();
          const rawService = (row[serviceIdx] ?? "").trim();
          const rawTherapist = (therapistIdx !== -1 ? row[therapistIdx] ?? "" : "").trim();
          const rawRoom = (roomIdx !== -1 ? row[roomIdx] ?? "" : "").trim();
          const rawLocker = (lockerIdx !== -1 ? row[lockerIdx] ?? "" : "").trim();
          const rawPayment = (paymentIdx !== -1 ? row[paymentIdx] ?? "" : "").trim() || "Cash";
          const rawAmount = (amountIdx !== -1 ? row[amountIdx] ?? "" : "").trim();
          const rawPromo = (promoIdx !== -1 ? row[promoIdx] ?? "" : "").trim();
          const rawNotes = (notesIdx !== -1 ? row[notesIdx] ?? "" : "").trim();

          // 1. Client Matching: phone (exact or sanitized), codename, username (case-insensitive)
          let matchedClient: ClientCandidate | null = null;
          if (rawClient) {
            const rawSanitizedPhone = sanitizePhone(rawClient);
            const searchId = rawClient.toLowerCase().replace(/^@/, "");

            matchedClient =
              clients.find((c) => {
                if (c.phone) {
                  const clientPhoneSanitized = sanitizePhone(c.phone);
                  if (clientPhoneSanitized && clientPhoneSanitized === rawSanitizedPhone) {
                    return true;
                  }
                }
                if (c.codename.trim().toLowerCase() === searchId) {
                  return true;
                }
                if (c.username.trim().toLowerCase().replace(/^@/, "") === searchId) {
                  return true;
                }
                if (c.member_code.trim().toLowerCase() === searchId) {
                  return true;
                }
                return false;
              }) ?? null;
          }

          // 2. Service Matching & Alias Normalization
          const cleanService = rawService.toLowerCase().replace(/[\s_-]+/g, " ");
          let resolvedSvc: ServiceCandidate | null = null;

          const isPrimeScrubAlias = [
            "prime scrub",
            "prime scrub massage",
            "scrub",
            "scrub massage",
            "scrub + massage",
            "scrub & massage",
          ].includes(cleanService);

          const isWetAreaAlias = [
            "wet area",
            "wet",
            "sauna",
            "facilities",
            "wet-area",
            "wetarea",
          ].includes(cleanService);

          if (isPrimeScrubAlias && primeScrubSvc) {
            resolvedSvc = primeScrubSvc;
          } else if (isWetAreaAlias && wetAreaSvc) {
            resolvedSvc = wetAreaSvc;
          } else {
            resolvedSvc =
              services.find(
                (s) =>
                  s.name.toLowerCase() === cleanService ||
                  s.name.toLowerCase().replace(/[\s_-]+/g, " ") === cleanService
              ) ?? null;
          }

          // 3. Wet Area Invariant Handling
          const isWetArea = resolvedSvc?.name === "Wet Area" || isWetAreaAlias;
          let therapistId: string | null = null;
          let therapistName: string | null = null;
          let roomNumber: number | null = null;

          if (!isWetArea) {
            if (rawTherapist) {
              const matchedTh = therapists.find(
                (t) => t.name.trim().toLowerCase() === rawTherapist.toLowerCase()
              );
              therapistId = matchedTh ? matchedTh.id : null;
              therapistName = matchedTh ? matchedTh.name : rawTherapist;
            }
            const parsedRoom = parseInt(rawRoom, 10);
            roomNumber = isNaN(parsedRoom) ? null : parsedRoom;
          }

          const parsedLocker = parseInt(rawLocker, 10);
          const lockerNumber = isNaN(parsedLocker) ? null : parsedLocker;

          // 4. Strict Amount Resolution: preserve explicitly entered amounts (including 0)
          const cleanedAmount = rawAmount.replace(/[^0-9.]/g, "");
          let parsedAmount = rawAmount !== "" && cleanedAmount !== "" ? parseFloat(cleanedAmount) : NaN;
          if (isNaN(parsedAmount)) {
            parsedAmount = resolvedSvc ? Number(resolvedSvc.price) : 0;
          } else if (parsedAmount < 0) {
            parsedAmount = 0;
          }

          // 5. Strict Amount-Based Loyalty Points Computation
          let pointsDelta = 0;
          let status: "matched_member" | "walk_in" | "invalid_service" = "walk_in";
          let validationError: string | undefined = undefined;

          if (!resolvedSvc) {
            status = "invalid_service";
            validationError = `Unrecognized service: "${rawService}"`;
          } else if (!effectiveDate) {
            status = "invalid_service";
            validationError = "Missing visit date";
          } else if (matchedClient) {
            status = "matched_member";
            if (isWetArea) {
              pointsDelta = WET_AREA_POINTS;
            } else if (parsedAmount <= 0) {
              pointsDelta = 0;
            } else {
              const mode = (loyaltySettings.mode ?? "proportional") as LoyaltyFormulaMode;
              pointsDelta = computeLoyaltyPoints(
                mode,
                parsedAmount,
                Number(resolvedSvc.price),
                Number(resolvedSvc.points_earned),
                loyaltySettings.pesoPerPoint ?? null
              );
            }
          } else {
            status = "walk_in";
            pointsDelta = 0;
          }

          return {
            rowNumber: rowNum,
            rawDate,
            date: effectiveDate,
            time: rawTime,
            clientIdentifier: rawClient,
            matchedClient,
            serviceId: resolvedSvc ? resolvedSvc.id : null,
            serviceName: rawService,
            resolvedServiceName: resolvedSvc ? resolvedSvc.name : null,
            therapistId,
            therapistName,
            roomNumber,
            lockerNumber,
            paymentMethod: rawPayment,
            amount: parsedAmount,
            promoCode: rawPromo || undefined,
            notes: rawNotes,
            pointsDelta,
            pointsToCredit: pointsDelta,
            status,
            validationError,
          };
        });

        setParsedRows(parsed);
      } catch (err: any) {
        setParseError(err?.message || "Failed to parse CSV file.");
      }
    };
    reader.readAsText(selectedFile);
  };

  // Dynamically resolve row dates when targetDateOverride changes
  const rowsWithResolvedDate = useMemo(() => {
    return parsedRows.map((r) => {
      const effectiveDate = targetDateOverride.trim() || r.rawDate;
      const isMissingDate = !effectiveDate;
      let status = r.status;
      let validationError = r.validationError;

      if (isMissingDate && status !== "invalid_service") {
        status = "invalid_service";
        validationError = "Missing visit date";
      } else if (!isMissingDate && validationError === "Missing visit date") {
        status = r.matchedClient ? "matched_member" : "walk_in";
        validationError = undefined;
      }

      return {
        ...r,
        date: effectiveDate,
        status,
        validationError,
      };
    });
  }, [parsedRows, targetDateOverride]);

  // Summary Metrics calculations
  const metrics = useMemo(() => {
    const validRows = rowsWithResolvedDate.filter((r) => r.status !== "invalid_service");
    const matchedCount = rowsWithResolvedDate.filter((r) => r.status === "matched_member").length;
    const walkInCount = rowsWithResolvedDate.filter((r) => r.status === "walk_in").length;
    const invalidCount = rowsWithResolvedDate.filter((r) => r.status === "invalid_service").length;
    const totalSales = validRows.reduce((sum, r) => sum + r.amount, 0);
    const totalPoints = validRows.reduce((sum, r) => sum + (r.pointsDelta ?? r.pointsToCredit), 0);

    return {
      totalVisits: rowsWithResolvedDate.length,
      validVisits: validRows.length,
      matchedCount,
      walkInCount,
      invalidCount,
      totalSales,
      totalPoints,
    };
  }, [rowsWithResolvedDate]);

  // Execute Ingestion
  const handleConfirmIngest = async () => {
    if (isPending) return;
    const validRows = rowsWithResolvedDate.filter((r) => r.status !== "invalid_service" && r.serviceId != null);
    if (validRows.length === 0) return;

    setIsPending(true);
    setImportResult(null);

    try {
      const payload: ParsedOfflineRowInput[] = validRows.map((r) => ({
        date: r.date,
        time: r.time,
        clientIdentifier: r.clientIdentifier,
        matchedClientId: r.matchedClient?.id ?? null,
        serviceId: r.serviceId!,
        serviceName: r.resolvedServiceName ?? r.serviceName,
        therapistId: r.therapistId,
        roomNumber: r.roomNumber,
        lockerNumber: r.lockerNumber,
        paymentMethod: r.paymentMethod,
        amount: r.amount,
        promoCode: r.promoCode,
        notes: r.notes,
        pointsDelta: r.pointsDelta ?? r.pointsToCredit,
        pointsToCredit: r.pointsDelta ?? r.pointsToCredit,
      }));

      const res = await importOfflineVisits(payload);

      if (!res.ok) {
        setImportResult({
          ok: false,
          importedCount: 0,
          skippedCount: 0,
          pointsTotal: 0,
          salesTotal: 0,
          error: res.error,
        });
      } else {
        setImportResult({
          ok: true,
          importedCount: res.importedCount,
          skippedCount: res.skippedCount,
          pointsTotal: res.pointsTotal,
          salesTotal: res.salesTotal,
        });
        if (onSuccess) {
          onSuccess(res);
        }
      }
    } catch (err: any) {
      setImportResult({
        ok: false,
        importedCount: 0,
        skippedCount: 0,
        pointsTotal: 0,
        salesTotal: 0,
        error: err?.message || "An unexpected error occurred during ingestion.",
      });
    } finally {
      setIsPending(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setParsedRows([]);
    setParseError(null);
    setImportResult(null);
    setTargetDateOverride("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-xl border border-border bg-[#141210] shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-surface">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <span>📥</span>
              <span>Offline Fallback CSV Importer</span>
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Ingest emergency offline visits recorded during network outages and credit loyalty points to members.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-accent hover:text-foreground transition-colors disabled:opacity-50 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Target Ingestion Date Selector (Override) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-sm">
            <div>
              <label htmlFor="target-spa-date-override" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <span>📅</span>
                <span>Target Spa Date (Override)</span>
                {targetDateOverride && (
                  <span className="ml-1 rounded bg-gold/15 px-1.5 py-0.5 text-[10px] font-semibold text-gold">
                    Active Override
                  </span>
                )}
              </label>
              <p className="text-[11px] text-muted mt-0.5">
                If populated, applies this date to all rows (or fills empty dates). If blank, respects individual CSV row dates.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="target-spa-date-override"
                type="date"
                value={targetDateOverride}
                onChange={(e) => setTargetDateOverride(e.target.value)}
                disabled={isPending}
                className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs text-foreground focus:border-gold focus:outline-none disabled:opacity-50"
              />
              {targetDateOverride && (
                <button
                  type="button"
                  onClick={() => setTargetDateOverride("")}
                  disabled={isPending}
                  className="rounded px-2 py-1 text-[11px] text-muted hover:text-foreground hover:bg-surface-accent transition-colors cursor-pointer"
                  title="Clear date override"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Post-Import Result Feedback */}
          {importResult && (
            <div
              className={`rounded-xl border p-4 text-sm ${
                importResult.ok
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-red-500/30 bg-red-500/10 text-red-300"
              }`}
            >
              {importResult.ok ? (
                <div className="space-y-1">
                  <div className="font-semibold text-emerald-400 flex items-center gap-2">
                    <span>✓</span>
                    <span>Offline Visits Ingestion Complete!</span>
                  </div>
                  <p className="text-xs text-emerald-300/90">
                    Successfully ingested <strong>{importResult.importedCount}</strong> visit(s) (₱
                    {importResult.salesTotal.toLocaleString()} sales), credited{" "}
                    <strong>+{importResult.pointsTotal} pts</strong> to member accounts.
                    {importResult.skippedCount > 0 && (
                      <span className="block mt-0.5 text-muted">
                        Note: {importResult.skippedCount} identical record(s) were skipped by the idempotency guard.
                      </span>
                    )}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="font-semibold text-red-400">Ingestion Failed</div>
                  <p className="text-xs">{importResult.error}</p>
                </div>
              )}
            </div>
          )}

          {/* STEP 1: File Drop Zone & Template Download (if no file loaded) */}
          {!file && (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files?.[0]) {
                    handleFileChange(e.dataTransfer.files[0]);
                  }
                }}
                className="group flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-10 text-center hover:border-gold/50 hover:bg-gold/5 transition-all cursor-pointer bg-surface"
              >
                <div className="rounded-full bg-gold/10 p-3 text-gold mb-3 group-hover:scale-105 transition-transform">
                  <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                </div>
                <div className="text-sm font-semibold text-foreground">
                  Drag and drop your offline visits CSV here, or{" "}
                  <span className="text-gold underline underline-offset-2">browse file</span>
                </div>
                <p className="mt-1 text-xs text-muted">Supports standard CSV exports from Google Sheets or Excel</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      handleFileChange(e.target.files[0]);
                    }
                  }}
                />
              </div>

              {/* Template Download Bar */}
              <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-xs">
                <div className="flex items-center gap-2 text-muted">
                  <span>ℹ️</span>
                  <span>Need the expected schema format? Use our offline Google Sheet template.</span>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="flex items-center gap-1.5 font-semibold text-gold hover:text-gold-hover hover:underline cursor-pointer"
                >
                  <span>📥 Download CSV Template</span>
                </button>
              </div>
            </div>
          )}

          {/* Parsing Error */}
          {parseError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-300 flex items-center justify-between">
              <span>{parseError}</span>
              <button
                type="button"
                onClick={handleReset}
                className="text-red-400 underline hover:text-red-300 ml-4 cursor-pointer"
              >
                Try Another File
              </button>
            </div>
          )}

          {/* STEP 2: Dry-Run Preview Table & Summary Metrics */}
          {rowsWithResolvedDate.length > 0 && (
            <div className="space-y-5">
              {/* Summary Metrics Banner */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg border border-border bg-surface p-3.5">
                  <div className="text-xs uppercase font-medium text-muted">Total Visits</div>
                  <div className="mt-1 text-xl font-bold text-foreground flex items-baseline gap-1.5">
                    <span>{metrics.totalVisits}</span>
                    <span className="text-xs font-normal text-muted">({metrics.validVisits} valid)</span>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-surface p-3.5">
                  <div className="text-xs uppercase font-medium text-muted">Matched Members</div>
                  <div className="mt-1 text-xl font-bold text-gold flex items-baseline gap-1.5">
                    <span>{metrics.matchedCount}</span>
                    <span className="text-xs font-normal text-muted">/ {metrics.walkInCount} walk-in</span>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-surface p-3.5">
                  <div className="text-xs uppercase font-medium text-muted">Total Sales</div>
                  <div className="mt-1 text-xl font-bold text-foreground">
                    ₱{metrics.totalSales.toLocaleString()}
                  </div>
                </div>

                <div className="rounded-lg border border-gold/30 bg-gold/5 p-3.5">
                  <div className="text-xs uppercase font-medium text-gold">Points to Disburse</div>
                  <div className="mt-1 text-xl font-bold text-gold">+{metrics.totalPoints} pts</div>
                </div>
              </div>

              {/* Warning for invalid service entries */}
              {metrics.invalidCount > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 flex items-center gap-2">
                  <span>⚠️</span>
                  <span>
                    <strong>{metrics.invalidCount} row(s)</strong> have unrecognized service names and will be skipped
                    during ingestion.
                  </span>
                </div>
              )}

              {/* Preview Table */}
              <div className="rounded-xl border border-border overflow-hidden bg-surface">
                <div className="max-h-[380px] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 z-10 border-b border-border bg-surface-2 text-muted uppercase tracking-wider font-semibold">
                      <tr>
                        <th className="px-3.5 py-2.5">#</th>
                        <th className="px-3.5 py-2.5">
                          Date / Time {targetDateOverride && <span className="text-gold lowercase font-normal">(override)</span>}
                        </th>
                        <th className="px-3.5 py-2.5">Identifier & Status</th>
                        <th className="px-3.5 py-2.5">Service</th>
                        <th className="px-3.5 py-2.5">Therapist / Room</th>
                        <th className="px-3.5 py-2.5">Locker</th>
                        <th className="px-3.5 py-2.5">Amount (Method)</th>
                        <th className="px-3.5 py-2.5">Promo</th>
                        <th className="px-3.5 py-2.5 text-right">Points</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rowsWithResolvedDate.map((row) => (
                        <tr
                          key={row.rowNumber}
                          className={`hover:bg-surface-accent/40 transition-colors ${
                            row.status === "invalid_service" ? "bg-red-500/5" : ""
                          }`}
                        >
                          <td className="px-3.5 py-2.5 font-mono text-muted">{row.rowNumber}</td>
                          <td className="px-3.5 py-2.5">
                            <div className="font-medium text-foreground flex items-center gap-1.5">
                              <span>{row.date || <span className="text-red-400 italic">No date</span>}</span>
                              {targetDateOverride && row.rawDate && row.rawDate !== row.date && (
                                <span className="text-[10px] text-muted font-normal line-through">({row.rawDate})</span>
                              )}
                            </div>
                            <div className="font-mono text-[11px] text-muted">{row.time}</div>
                          </td>
                          <td className="px-3.5 py-2.5">
                            {row.status === "matched_member" && row.matchedClient ? (
                              <div>
                                <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/15 px-2 py-0.5 text-[11px] font-semibold text-gold">
                                  <span>★</span>
                                  <span>{row.matchedClient.codename}</span>
                                </span>
                                <div className="text-[11px] text-muted mt-0.5">
                                  @{row.matchedClient.username}
                                  {row.matchedClient.phone && ` · ${row.matchedClient.phone}`}
                                </div>
                              </div>
                            ) : row.status === "invalid_service" ? (
                              <div>
                                <span className="inline-flex rounded-full border border-red-500/30 bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-400">
                                  Invalid Service
                                </span>
                                <div className="text-[11px] text-red-400/80 mt-0.5">{row.validationError}</div>
                              </div>
                            ) : (
                              <div>
                                <span className="inline-flex rounded-full border border-border bg-surface-accent px-2 py-0.5 text-[11px] font-medium text-muted">
                                  Walk-in Guest
                                </span>
                                {row.clientIdentifier && (
                                  <div className="text-[11px] text-muted mt-0.5 truncate max-w-[140px]">
                                    "{row.clientIdentifier}"
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5">
                            <div className="font-medium text-gold">{row.resolvedServiceName ?? row.serviceName}</div>
                            {row.resolvedServiceName && row.resolvedServiceName !== row.serviceName && (
                              <div className="text-[10px] text-muted italic">alias: "{row.serviceName}"</div>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 text-muted">
                            {row.resolvedServiceName === "Wet Area" ? (
                              <span className="italic text-muted/80">None (Wet Area)</span>
                            ) : (
                              <div>
                                <div className="text-foreground">{row.therapistName || "—"}</div>
                                <div className="text-[11px]">{row.roomNumber ? `Room ${row.roomNumber}` : "No room"}</div>
                              </div>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 font-mono text-muted">
                            {row.lockerNumber ? `Locker ${row.lockerNumber}` : "—"}
                          </td>
                          <td className="px-3.5 py-2.5">
                            <div className="font-semibold text-foreground">₱{row.amount.toLocaleString()}</div>
                            <div className="text-[11px] text-muted">{row.paymentMethod}</div>
                          </td>
                          <td className="px-3.5 py-2.5">
                            {row.promoCode ? (
                              <span className="inline-flex items-center rounded border border-gold/40 bg-gold/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-gold">
                                {row.promoCode}
                              </span>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-medium">
                            {row.status === "matched_member" ? (
                              (row.pointsDelta ?? row.pointsToCredit) > 0 ? (
                                <div>
                                  <span className="text-gold font-bold">+{row.pointsDelta ?? row.pointsToCredit} pts</span>
                                  <div className="text-[10px] text-muted">
                                    {row.resolvedServiceName === "Wet Area" ? "facility rule" : `from ₱${row.amount.toLocaleString()}`}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-muted font-normal">0 pts</span>
                              )
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer / Action Bar */}
        <div className="flex items-center justify-between border-t border-border px-6 py-4 bg-surface">
          <div>
            {rowsWithResolvedDate.length > 0 && !importResult?.ok && (
              <button
                type="button"
                onClick={handleReset}
                disabled={isPending}
                className="text-xs text-muted hover:text-foreground underline cursor-pointer disabled:opacity-50"
              >
                Clear / Choose another CSV
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-muted hover:bg-surface-accent hover:text-foreground transition-colors disabled:opacity-50 cursor-pointer"
            >
              {importResult?.ok ? "Close" : "Cancel"}
            </button>

            {rowsWithResolvedDate.length > 0 && !importResult?.ok && (
              <button
                type="button"
                onClick={handleConfirmIngest}
                disabled={isPending || metrics.validVisits === 0}
                className="flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-xs font-bold text-background hover:bg-gold-hover transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
              >
                {isPending ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-background" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span>Ingesting {metrics.validVisits} Visits...</span>
                  </>
                ) : (
                  <>
                    <span>Confirm & Ingest Visits ({metrics.validVisits})</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
