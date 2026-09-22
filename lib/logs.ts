export interface ActionLog {
  id?: string;
  action: string;
  detail?: string | null;
  created_at?: string;
  staff_id?: string | null;
  staff_name?: string | null;
  metadata?: any;
}

export type Lookups = {
  therapistNameById: Map<string, string>;
  serviceNameById: Map<string, string>;
  addonNameById: Map<string, string>;
  clientCodenameById: Map<string, string>;
  lockerNumberByOccupancyId: Map<string, number>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  const trimmed = value.trim();
  return UUID_RE.test(trimmed) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12,16}$/i.test(trimmed);
}

export function truncateUuid(id: string): string {
  const trimmed = id.trim();
  if (isUuid(trimmed) || trimmed.length > 12) {
    return `...${trimmed.slice(-4)}`;
  }
  return trimmed;
}

export const ACTION_LABELS: Record<string, string> = {
  quick_walkin: "Quick Walk-in",
  edit_booking: "Edit Booking",
  therapist_mark_on_leave: "Therapist On Leave",
  therapist_unarchive: "Unarchive Therapist",
  therapist_archive: "Archive Therapist",
  therapist_toggle_day_off: "Toggle Day-off",
  locker_checkout: "Locker Check-out",
  change_therapist: "Change Therapist",
  cancel_reassignment_booking: "Cancel Reassignment",
  log_visit: "Log Visit",
  sale_edit: "Edit Sale",
  sale_void: "Void Sale",
  therapist_create: "Create Therapist",
  therapist_rename: "Rename Therapist",
  therapist_mark_absent: "Therapist Absent",
  therapist_toggle_service: "Toggle Therapist Service",
  therapist_sync_breaks: "Sync Therapist Breaks",
  therapist_set_break: "Set Therapist Break",
  therapist_remove_break: "Remove Therapist Break",
  staff_add: "Add Staff",
  staff_edit: "Edit Staff",
  staff_archive: "Archive Staff",
  staff_restore: "Restore Staff",
  staff_reset_password: "Reset Staff Password",
  settings_add_service: "Add Service",
  settings_update_service_price: "Update Service Price",
  settings_update_service_points: "Update Service Points",
  settings_delete_service: "Delete Service",
  settings_add_promo: "Add Promo",
  settings_update_promo: "Update Promo",
  settings_update_promo_discount: "Update Promo Discount",
  settings_delete_promo: "Delete Promo",
  settings_add_weekend_slot: "Add Weekend Slot",
  settings_delete_weekend_slot: "Delete Weekend Slot",
  settings_add_addon: "Add Add-on",
  settings_update_addon_price: "Update Add-on Price",
  settings_delete_addon: "Delete Add-on",
  settings_add_lockers: "Add Lockers",
  settings_update_room_count: "Update Room Count",
  settings_update_loyalty_formula: "Update Loyalty Formula",
  settings_update_appearance: "Update Appearance",
  settings_update_branding: "Update Branding",
  settings_upload_brand_logo: "Upload Brand Logo",
  settings_update_walkin_claims_toggle: "Update Walk-in Claims",
  settings_update_sms_template: "Update SMS Template",
  settings_reset_sms_template: "Reset SMS Template",
  settings_update_void_auth_code: "Update Void Auth Code",
  auto_cancel_lapsed_booking: "Auto Cancel Booking",
  auto_checkout_stale_locker: "Auto Checkout Locker",
};

export function formatActionLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  return action
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function fmtTime(t: string): string {
  if (!t) return "";
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?/.exec(t.trim());
  if (!m) return t.trim();
  const h = Number(m[1]);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${period}`;
}

export function fmtDate(d: string): string {
  if (!d) return "";
  const cleaned = d.trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    const [year, month, day] = cleaned.split("-").map(Number);
    const dateObj = new Date(year, month - 1, day);
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
  }
  return d.trim();
}

export function fmtPeso(amount: string | number): string {
  const num = typeof amount === "number" ? amount : Number(amount);
  if (!isNaN(num)) {
    return `₱${num.toLocaleString("en-PH")}`;
  }
  return `₱${amount}`;
}

const KEY_RE = /(?:^|\s)([a-z0-9_]+)=/gi;

export function parseDetail(detail: string | null): Record<string, string> {
  if (!detail) return {};
  const trimmed = detail.trim();
  if (!trimmed) return {};

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null) {
        const res: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed)) {
          res[k] = typeof v === "string" ? v : JSON.stringify(v);
        }
        return res;
      }
    } catch {
      // ignore
    }
  }

  const matches = [...trimmed.matchAll(KEY_RE)];
  if (matches.length === 0) {
    return { raw: trimmed };
  }

  const out: Record<string, string> = {};
  for (let i = 0; i < matches.length; i++) {
    const key = matches[i][1];
    const valueStart = matches[i].index! + matches[i][0].length;
    const valueEnd = i + 1 < matches.length ? matches[i + 1].index! : trimmed.length;
    out[key] = trimmed.slice(valueStart, valueEnd).trim();
  }
  return out;
}

function cleanKey(k: string): string {
  return k
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function cleanValue(val: any): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") {
    if (isUuid(val)) {
      return truncateUuid(val);
    }
    return val.replace(/["'{}[\]]/g, "").trim();
  }
  if (Array.isArray(val)) {
    return val.map(cleanValue).filter(Boolean).join(", ");
  }
  if (typeof val === "object") {
    return Object.entries(val)
      .map(([k, v]) => `${cleanKey(k)}: ${cleanValue(v)}`)
      .join(", ");
  }
  return String(val);
}

export function formatFallbackText(text: string | null): string {
  if (!text) return "Completed.";
  const trimmed = text.trim();
  if (!trimmed || trimmed === "Completed." || trimmed === "Completed") return "Completed.";

  let jsonData: any = null;
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      jsonData = JSON.parse(trimmed);
    } catch {
      // ignore
    }
  } else {
    const match = trimmed.match(/(\{.*\}|\[.*\])/);
    if (match) {
      try {
        jsonData = JSON.parse(match[1]);
      } catch {
        // ignore
      }
    }
  }

  if (jsonData) {
    if (Array.isArray(jsonData)) {
      const items = jsonData.map(cleanValue).filter(Boolean);
      return items.join(", ") || "Completed.";
    }
    if (typeof jsonData === "object" && jsonData !== null) {
      const parts: string[] = [];
      for (const [k, v] of Object.entries(jsonData)) {
        if (
          k.endsWith("_id") ||
          k === "id" ||
          k === "therapist" ||
          k === "client" ||
          k === "service" ||
          k === "addon" ||
          (typeof v === "string" && isUuid(v))
        ) {
          continue;
        }
        const valStr = cleanValue(v);
        if (valStr) {
          parts.push(`${cleanKey(k)}: ${valStr}`);
        }
      }
      if (parts.length > 0) return parts.join(" · ");
    }
  }

  const fields = parseDetail(trimmed);
  if (fields.raw) {
    const cleaned = fields.raw
      .replace(/["'{}[\]]/g, "")
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, (match) =>
        truncateUuid(match)
      )
      .trim();
    return cleaned || "Completed.";
  }

  const parts: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (
      key.endsWith("_id") ||
      key === "id" ||
      key === "therapist" ||
      key === "client" ||
      key === "service" ||
      key === "addon" ||
      key === "occupancy" ||
      isUuid(value)
    ) {
      continue;
    }
    const valClean = cleanValue(value);
    if (valClean) {
      parts.push(`${cleanKey(key)}: ${valClean}`);
    }
  }
  return parts.length > 0 ? parts.join(" · ") : "Completed.";
}

// ---------------- Helper Formatters ----------------

function formatPromoConditions(
  days: string[] | null | undefined,
  slots: string[] | null | undefined,
  minPax: number | null | undefined
): string[] {
  const parts: string[] = [];

  if (days && days.length > 0) {
    if (days.length === 5 && ["Mon", "Tue", "Wed", "Thu", "Fri"].every((d) => days.includes(d))) {
      if (slots && slots.length > 0) {
        parts.push("Weekdays (Mon–Fri)");
      } else {
        parts.push("Weekdays");
      }
    } else if (days.length === 2 && ["Sat", "Sun"].every((d) => days.includes(d))) {
      parts.push("Weekends");
    } else if (days.length < 7) {
      parts.push(days.join(", "));
    }
  }

  if (slots && slots.length > 0) {
    const formattedSlots = slots.map(fmtTime).filter(Boolean);
    if (formattedSlots.length > 0) {
      parts.push(formattedSlots.join(", "));
    }
  }

  if (minPax && minPax > 1) {
    parts.push(`Min ${minPax} pax`);
  }

  return parts;
}

function formatPromoLog(
  mode: "add" | "update" | "discount" | "delete",
  detail: string | null
): string {
  if (!detail) {
    return mode === "delete" ? "Deleted promo" : mode === "add" ? "Added promo" : "Updated promo";
  }

  let jsonData: any = null;
  const jsonMatch = detail.match(/(\{.*\}|\[.*\])/);
  if (jsonMatch) {
    try {
      jsonData = JSON.parse(jsonMatch[1]);
    } catch {
      // ignore
    }
  }

  const fields = parseDetail(detail);

  let label =
    jsonData?.label ||
    fields.label ||
    fields.code ||
    fields.name ||
    "";

  const id = fields.promo || fields.id || jsonData?.promoId || "";
  const labelIsUuid = isUuid(label);

  const discountVal =
    jsonData?.discount !== undefined
      ? jsonData.discount
      : fields.discount !== undefined
      ? Number(fields.discount) || fields.discount
      : null;

  const isPercent =
    jsonData?.discountType === "percent" ||
    (typeof discountVal === "string" && discountVal.includes("%"));

  const discountStr =
    discountVal !== null && discountVal !== undefined && discountVal !== ""
      ? isPercent
        ? `${String(discountVal).replace("%", "")}% off`
        : `${fmtPeso(discountVal)} off`
      : "";

  const days = jsonData?.applicableDays ?? jsonData?.applicable_days ?? (fields.applicable_days ? fields.applicable_days.split(",") : null);
  const slots = jsonData?.applicableSlots ?? jsonData?.applicable_slots ?? (fields.applicable_slots ? fields.applicable_slots.split(",") : null);
  const minPax =
    jsonData?.minPax !== undefined
      ? jsonData.minPax
      : jsonData?.min_pax !== undefined
      ? jsonData.min_pax
      : fields.min_pax !== undefined
      ? Number(fields.min_pax)
      : undefined;

  const conditionParts = formatPromoConditions(days, slots, minPax);

  if (mode === "delete") {
    if (label && !labelIsUuid) {
      return `Deleted promo "${label}"`;
    }
    const id = fields.promo || fields.id || (labelIsUuid ? label : "");
    if (id) {
      return `Deleted promo (ID: ${truncateUuid(id)})`;
    }
    return "Deleted promo";
  }

  if (mode === "discount") {
    const promoTitle = label && !labelIsUuid ? `"${label}"` : label ? `(ID: ${truncateUuid(label)})` : "promo";
    if (discountStr) {
      return `Updated promo discount for ${promoTitle}: ${discountStr}`;
    }
    return `Updated promo discount for ${promoTitle}`;
  }

  const actionVerb = mode === "add" ? "Added promo" : "Updated promo";
  const titleDisplay = label && !labelIsUuid ? ` "${label}"` : "";

  const segments: string[] = [];
  if (discountStr) segments.push(discountStr);
  segments.push(...conditionParts);

  if (segments.length > 0) {
    return `${actionVerb}${titleDisplay}: ${segments.join(" · ")}`;
  }
  return `${actionVerb}${titleDisplay}`;
}

function formatTherapistBreaksLog(
  detail: string | null,
  createdAt?: string,
  lookups?: Partial<Lookups>
): string {
  if (!detail) return "Synchronized therapist breaks";

  const fields = parseDetail(detail);

  const therapistId = fields.therapist || fields.therapist_id || "";
  const therapistName =
    therapistId && lookups?.therapistNameById?.get(therapistId)
      ? lookups.therapistNameById.get(therapistId)
      : "";

  const rawDate = fields.date || (createdAt ? createdAt.slice(0, 10) : "");
  const dateStr = rawDate ? fmtDate(rawDate) : "";

  // Check for set / remove single break
  if (fields.slot) {
    const timeFormatted = fmtTime(fields.slot);
    const datePrefix = dateStr ? `${dateStr} · ` : "";
    const therapistSuffix = therapistName ? ` for ${therapistName}` : "";
    return `${datePrefix}Set break at ${timeFormatted}${therapistSuffix}`;
  }

  const parseTimeArray = (raw: string | undefined): string[] => {
    if (!raw) return [];
    return raw
      .replace(/[\[\]]/g, "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(fmtTime);
  };

  let addedTimes: string[] = [];
  let removedTimes: string[] = [];
  let totalCount: number | null = null;

  const addedMatch = detail.match(/added(?:=|\s*:\s*)\[(.*?)\]/i);
  if (addedMatch) {
    addedTimes = parseTimeArray(addedMatch[1]);
  } else if (fields.added) {
    addedTimes = parseTimeArray(fields.added);
  }

  const removedMatch = detail.match(/removed(?:=|\s*:\s*)\[(.*?)\]/i);
  if (removedMatch) {
    removedTimes = parseTimeArray(removedMatch[1]);
  } else if (fields.removed) {
    removedTimes = parseTimeArray(fields.removed);
  }

  const totalMatch = detail.match(/total(?:=|\s*:\s*)(\d+)/i);
  if (totalMatch) {
    totalCount = Number(totalMatch[1]);
  } else if (fields.total) {
    totalCount = Number(fields.total);
  }

  const changes: string[] = [];
  if (addedTimes.length > 0) {
    changes.push(`Added ${addedTimes.join(", ")}`);
  }
  if (removedTimes.length > 0) {
    changes.push(`removed ${removedTimes.join(", ")}`);
  }

  const totalSuffix =
    totalCount !== null
      ? ` (${totalCount} total break${totalCount === 1 ? "" : "s"})`
      : "";

  const breakLabel = changes.length > 0 ? " break" : "";
  const changesSummary = changes.length > 0 ? `${changes.join(", ")}${breakLabel}${totalSuffix}` : "Updated breaks";

  const datePrefix = dateStr ? `${dateStr} · ` : "";
  const therapistSuffix = therapistName ? ` for ${therapistName}` : "";

  return `${datePrefix}${changesSummary}${therapistSuffix}`;
}

function formatAppearanceLog(detail: string | null): string {
  if (!detail) return "Updated branding assets and spa appearance";
  try {
    const parsed = typeof detail === "string" && detail.startsWith("{") ? JSON.parse(detail) : null;
    if (parsed) {
      const items: string[] = [];
      if (parsed.accentColor) items.push(`${cleanValue(parsed.accentColor)} accent`);
      if (parsed.fontFamily) items.push(`${cleanValue(parsed.fontFamily)} font`);
      if (parsed.fontScale) items.push(`${cleanValue(parsed.fontScale)} scale`);
      if (parsed.tableDensity) items.push(`${cleanValue(parsed.tableDensity)} density`);
      if (items.length > 0) {
        return `Updated spa appearance (${items.join(", ")})`;
      }
    }
  } catch {
    // ignore
  }
  return "Updated branding assets and spa appearance";
}

function formatBrandingLog(detail: string | null): string {
  if (!detail) return "Updated branding assets";
  const fields = parseDetail(detail);
  const parts: string[] = [];
  if (fields.spa_name && fields.spa_name !== "unchanged") {
    parts.push(`spa name "${fields.spa_name}"`);
  }
  if (fields.logo) {
    parts.push(`logo ${fields.logo}`);
  }
  if (parts.length > 0) {
    return `Updated branding assets (${parts.join(", ")})`;
  }
  return "Updated branding assets";
}

// ---------------- Universal formatActionLog ----------------

export function formatActionLog(
  log: ActionLog,
  lookups?: Partial<Lookups>
): { actionLabel: string; details: string; sentence: string; technicalIds: string[] } {
  const action = log.action || "";
  const detail = log.detail || null;
  const createdAt = log.created_at;
  const actionLabel = formatActionLabel(action);

  // 1. Promo actions
  if (action === "settings_add_promo") {
    const sentence = formatPromoLog("add", detail);
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }
  if (action === "settings_update_promo") {
    const sentence = formatPromoLog("update", detail);
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }
  if (action === "settings_update_promo_discount") {
    const sentence = formatPromoLog("discount", detail);
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }
  if (action === "settings_delete_promo") {
    const sentence = formatPromoLog("delete", detail);
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  // 2. Therapist Break actions
  if (action === "therapist_sync_breaks") {
    const sentence = formatTherapistBreaksLog(detail, createdAt, lookups);
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }
  if (action === "therapist_set_break") {
    const fields = parseDetail(detail);
    const rawDate = fields.date || (createdAt ? createdAt.slice(0, 10) : "");
    const dateStr = rawDate ? fmtDate(rawDate) : "";
    const slotStr = fields.slot ? fmtTime(fields.slot) : "";
    const therapistName =
      fields.therapist && lookups?.therapistNameById?.get(fields.therapist)
        ? lookups.therapistNameById.get(fields.therapist)
        : "";
    const prefix = dateStr ? `${dateStr} · ` : "";
    const who = therapistName ? ` for ${therapistName}` : "";
    const sentence = `${prefix}Set ${slotStr || "scheduled"} break${who}`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }
  if (action === "therapist_remove_break") {
    const fields = parseDetail(detail);
    const rawDate = fields.date || (createdAt ? createdAt.slice(0, 10) : "");
    const dateStr = rawDate ? fmtDate(rawDate) : "";
    const slotStr = fields.slot ? fmtTime(fields.slot) : "";
    const therapistName =
      fields.therapist && lookups?.therapistNameById?.get(fields.therapist)
        ? lookups.therapistNameById.get(fields.therapist)
        : "";
    const prefix = dateStr ? `${dateStr} · ` : "";
    const who = therapistName ? ` for ${therapistName}` : "";
    const sentence = `${prefix}Removed ${slotStr || "scheduled"} break${who}`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  // 3. Settings Appearance & Branding
  if (action === "settings_update_appearance") {
    const sentence = formatAppearanceLog(detail);
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }
  if (action === "settings_update_branding") {
    const sentence = formatBrandingLog(detail);
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }
  if (action === "settings_upload_brand_logo") {
    const sentence = "Uploaded new brand logo image";
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }
  if (action === "settings_update_walkin_claims_toggle") {
    const fields = parseDetail(detail);
    const enabled = fields.allow_walkin_claims === "true" || fields.enabled === "true";
    const sentence = `Set walk-in claims to ${enabled ? "Enabled" : "Disabled"}`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }
  if (action === "settings_update_sms_template") {
    const sentence = "Updated SMS confirmation message template";
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }
  if (action === "settings_reset_sms_template") {
    const sentence = "Reset SMS confirmation message template to default";
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }
  if (action === "settings_update_void_auth_code") {
    const sentence = "Updated void authorization code";
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  // 4. Other Standard Actions
  const f = parseDetail(detail);

  if (action === "locker_checkout") {
    const occupancyId = f.occupancy_id ?? "";
    const lockerNumber = lookups?.lockerNumberByOccupancyId?.get(occupancyId);
    const lockerText = lockerNumber !== undefined ? `Locker ${lockerNumber}` : "Locker";
    const sentence = `Checked out ${lockerText}`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  if (action === "therapist_toggle_day_off") {
    const name = f.therapist && lookups?.therapistNameById?.get(f.therapist) ? lookups.therapistNameById.get(f.therapist)! : "a therapist";
    const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const i = Number(f.weekday ?? "");
    const weekday = Number.isInteger(i) && i >= 0 && i <= 6 ? weekdays[i] : `weekday ${f.weekday}`;
    const isOff = f.off === "true";
    const sentence = `Marked ${weekday} as ${isOff ? "a day off" : "a working day"} for ${name}`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  if (action === "therapist_mark_absent") {
    const name = f.therapist && lookups?.therapistNameById?.get(f.therapist) ? lookups.therapistNameById.get(f.therapist)! : "a therapist";
    const flagged = Number(f.flagged ?? "0");
    const reassignNote = flagged > 0 ? `, reassigning ${flagged} booking${flagged === 1 ? "" : "s"}` : "";
    const dateFormatted = f.date ? fmtDate(f.date) : "?";
    const sentence = `Flagged ${name} absent on ${dateFormatted}${reassignNote}`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  if (action === "therapist_mark_on_leave") {
    const name = f.therapist && lookups?.therapistNameById?.get(f.therapist) ? lookups.therapistNameById.get(f.therapist)! : "a therapist";
    const start = f.start ? fmtDate(f.start) : "?";
    const end = f.end ? fmtDate(f.end) : "?";
    const sentence = `Marked ${name} on leave from ${start} to ${end}`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  if (action === "therapist_archive") {
    const name = f.therapist && lookups?.therapistNameById?.get(f.therapist) ? lookups.therapistNameById.get(f.therapist)! : f.name || "a therapist";
    const reasonNote = f.reason ? ` (${f.reason})` : "";
    const sentence = `Archived ${name}${reasonNote}`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  if (action === "therapist_unarchive") {
    const name = f.therapist && lookups?.therapistNameById?.get(f.therapist) ? lookups.therapistNameById.get(f.therapist)! : f.name || "a therapist";
    const sentence = `Unarchived ${name}`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  if (action === "therapist_create") {
    const name = f.name || (f.therapist && lookups?.therapistNameById?.get(f.therapist)) || "a therapist";
    const sentence = `Created therapist ${name}`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  if (action === "therapist_rename") {
    const newName = f.name || "therapist";
    const sentence = `Renamed therapist to ${newName}`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  if (action === "quick_walkin") {
    const who = f.client
      ? lookups?.clientCodenameById?.get(f.client) || (isUuid(f.client) ? "a guest" : f.client)
      : f.guest || "a guest";
    const sentence = `Walk-in: ${who} — ${f.service ?? "?"}, ${fmtPeso(f.amount ?? "0")}`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  if (action === "sale_edit") {
    const sentence = `Updated sale to ${fmtPeso(f.amount ?? "0")} (${f.payment ?? "?"})`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  if (action === "sale_void") {
    return { actionLabel, details: "Voided sale", sentence: "Voided sale", technicalIds: [] };
  }

  if (action === "change_therapist") {
    const parts: string[] = [];
    if (f.old_therapist && f.new_therapist) {
      parts.push(`reassigned from ${f.old_therapist} to ${f.new_therapist}`);
    }
    if (f.old_time && f.new_time) {
      parts.push(`moved from ${fmtTime(f.old_time)} to ${fmtTime(f.new_time)}`);
    }
    const body = parts.length ? parts.join("; ") : "updated";
    const sentence = `Updated booking: ${body}`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  if (action === "cancel_reassignment_booking") {
    const dateStr = f.date ? ` on ${fmtDate(f.date)}` : "";
    const reasonStr = f.reason ? ` (${f.reason})` : "";
    const sentence = `Cancelled reassignment for booking${dateStr}${reasonStr}`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  if (action === "edit_booking") {
    const changes: string[] = [];
    if (f.new_service && f.new_service !== f.old_service) {
      changes.push(`Service: ${f.new_service}`);
    }
    if (f.new_therapist && f.new_therapist !== f.old_therapist) {
      changes.push(`Therapist: ${f.new_therapist}`);
    }
    if (f.new_locker && f.new_locker !== f.old_locker) {
      changes.push(`Locker ${f.new_locker} assigned`);
    }
    if (f.new_time && f.new_time !== f.old_time) {
      changes.push(fmtTime(f.new_time));
    }
    let desc = "Updated booking";
    if (changes.length > 0) {
      if (
        f.new_locker &&
        f.new_time &&
        f.new_locker !== f.old_locker &&
        f.new_time !== f.old_time &&
        changes.length === 2
      ) {
        desc = `Updated booking: Locker ${f.new_locker} assigned (${fmtTime(f.new_time)})`;
      } else {
        desc = `Updated booking: ${changes.join(", ")}`;
      }
    }
    const sentence = desc;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  if (action === "staff_add") {
    const sentence = `Added staff member ${f.name ?? "?"} (${f.position ?? "?"})`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  if (action === "staff_edit") {
    const sentence = `Updated staff member ${f.name ?? "?"}`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  if (action === "staff_archive") {
    const sentence = `Archived staff member ${f.name ?? "?"}${f.reason ? ` (${f.reason})` : ""}`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  if (action === "staff_restore") {
    const sentence = `Restored staff member ${f.name ?? "?"}`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  if (action === "staff_reset_password") {
    const sentence = `Reset password for staff member ${f.name ?? "?"}`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  if (action === "settings_add_service") {
    const sentence = `Added service ${f.name ?? "?"} at ${fmtPeso(f.price ?? "0")}`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  if (action === "settings_update_service_points") {
    const sName = f.service && lookups?.serviceNameById?.get(f.service) ? lookups.serviceNameById.get(f.service)! : "service";
    const sentence = `Set ${sName} to ${f.points ?? "?"} pt${f.points === "1" ? "" : "s"}`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  if (action === "settings_delete_service") {
    const sName = f.service && lookups?.serviceNameById?.get(f.service) ? lookups.serviceNameById.get(f.service)! : "service";
    const sentence = `Deleted service ${sName}`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  if (action === "settings_update_service_price") {
    const sName = f.service && lookups?.serviceNameById?.get(f.service) ? lookups.serviceNameById.get(f.service)! : "service";
    const sentence = `Set ${sName} price to ${fmtPeso(f.price ?? "0")}`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  if (action === "settings_add_weekend_slot") {
    const sentence = `Added weekend slot at ${fmtTime(f.slot ?? "?")}`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  if (action === "settings_delete_weekend_slot") {
    const sentence = `Deleted weekend slot at ${fmtTime(f.slot ?? "?")}`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  if (action === "settings_add_addon") {
    const sentence = `Added add-on ${f.name ?? "?"} at ${fmtPeso(f.price ?? "0")}`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  if (action === "settings_update_addon_price") {
    const aName = f.addon && lookups?.addonNameById?.get(f.addon) ? lookups.addonNameById.get(f.addon)! : "add-on";
    const sentence = `Set ${aName} price to ${fmtPeso(f.price ?? "0")}`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  if (action === "settings_delete_addon") {
    const aName = f.addon && lookups?.addonNameById?.get(f.addon) ? lookups.addonNameById.get(f.addon)! : "add-on";
    const sentence = `Deleted add-on ${aName}`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  if (action === "settings_add_lockers") {
    const numbers = (f.added ?? "").split(",").filter(Boolean);
    const sentence = `Added ${numbers.length} locker${numbers.length === 1 ? "" : "s"}: ${numbers.join(", ")}`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  if (action === "settings_update_room_count") {
    if (f.added) {
      const numbers = f.added.split(",").filter(Boolean);
      const sentence = `Added ${numbers.length} room${numbers.length === 1 ? "" : "s"} (now ${f.target ?? "?"} active)`;
      return { actionLabel, details: sentence, sentence, technicalIds: [] };
    }
    const numbers = (f.deactivated ?? "").split(",").filter(Boolean);
    const sentence = `Deactivated ${numbers.length} room${numbers.length === 1 ? "" : "s"} (now ${f.target ?? "?"} active)`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  if (action === "settings_update_loyalty_formula") {
    const sentence = `Set loyalty formula to ${f.mode ?? "?"}${
      f.mode === "uniform" && f.peso_per_point && f.peso_per_point !== "n/a"
        ? `, ${fmtPeso(f.peso_per_point)}/pt`
        : ""
    }`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  if (action === "therapist_toggle_service") {
    const therapist = f.therapist && lookups?.therapistNameById?.get(f.therapist) ? lookups.therapistNameById.get(f.therapist)! : "therapist";
    const service = f.service && lookups?.serviceNameById?.get(f.service) ? lookups.serviceNameById.get(f.service)! : "service";
    const offering = f.offering === "true";
    const sentence = `Marked ${service} as ${offering ? "offered" : "no longer offered"} by ${therapist}`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  if (action === "log_visit") {
    const who = f.client && lookups?.clientCodenameById?.get(f.client)
      ? lookups.clientCodenameById.get(f.client)!
      : isUuid(f.client ?? "")
      ? "a client"
      : f.client || "a guest";
    const isRedemption = f.redemption === "t" || f.redemption === "true";
    const sentence = `Logged ${isRedemption ? "redemption" : "visit"}: ${who} — ${f.service ?? "?"}, ${fmtPeso(
      f.amount ?? "0"
    )}`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  if (action === "auto_cancel_lapsed_booking") {
    const sentence = `Auto-cancelled lapsed booking on ${f.date ? fmtDate(f.date) : "?"}${
      f.start_time ? ` (${fmtTime(f.start_time)})` : ""
    } (past 2:00 AM cutoff)`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  if (action === "auto_checkout_stale_locker") {
    const sentence = `Auto checked-out stale locker ${f.locker ?? "?"} (past 2:00 AM cutoff)`;
    return { actionLabel, details: sentence, sentence, technicalIds: [] };
  }

  // 5. Universal Fallback
  const sentence = formatFallbackText(detail);
  return { actionLabel, details: sentence, sentence, technicalIds: [] };
}
