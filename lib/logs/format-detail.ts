const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

// Detail strings are plain `key=value key2=value2 ...` text written by simple
// string concatenation (no quoting/escaping) — a value itself can contain
// spaces (e.g. service="Combi Massage", position="Front Desk"). Splitting on
// space would truncate those, so instead split on key boundaries: find every
// `word=` occurrence and take the value as the text up to the next one.
const KEY_RE = /(?:^|\s)([a-z_]+)=/gi;

function parseDetail(detail: string | null): Record<string, string> {
  if (!detail) return {};
  const matches = [...detail.matchAll(KEY_RE)];
  const out: Record<string, string> = {};
  for (let i = 0; i < matches.length; i++) {
    const key = matches[i][1];
    const valueStart = matches[i].index! + matches[i][0].length;
    const valueEnd = i + 1 < matches.length ? matches[i + 1].index! : detail.length;
    out[key] = detail.slice(valueStart, valueEnd).trim();
  }
  return out;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function fmtWeekday(n: string): string {
  const i = Number(n);
  return Number.isInteger(i) && i >= 0 && i <= 6 ? WEEKDAYS[i] : `weekday ${n}`;
}

function fmtTime(t: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return t;
  const h = Number(m[1]);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${period}`;
}

function fmtPeso(amount: string): string {
  return `₱${amount}`;
}

export type Lookups = {
  therapistNameById: Map<string, string>;
  serviceNameById: Map<string, string>;
  addonNameById: Map<string, string>;
  clientCodenameById: Map<string, string>;
  lockerNumberByOccupancyId: Map<string, number>;
};

export type FormattedDetail = {
  sentence: string;
  technicalIds: string[];
};

function therapistName(id: string, lookups: Lookups): string {
  return lookups.therapistNameById.get(id) ?? "a therapist who was later removed";
}

function serviceName(id: string, lookups: Lookups): string {
  return lookups.serviceNameById.get(id) ?? "a service that was later deleted";
}

function addonName(id: string, lookups: Lookups): string {
  return lookups.addonNameById.get(id) ?? "an add-on that was later deleted";
}

function clientLabel(value: string, lookups: Lookups): string {
  if (!value) return "a guest";
  if (!isUuid(value)) return value;
  return lookups.clientCodenameById.get(value) ?? "a client who was later removed";
}

type Formatter = (fields: Record<string, string>, lookups: Lookups) => FormattedDetail;

const FORMATTERS: Record<string, Formatter> = {
  locker_checkout: (f, lookups) => {
    const occupancyId = f.occupancy_id ?? "";
    const lockerNumber = lookups.lockerNumberByOccupancyId.get(occupancyId);
    const lockerText =
      lockerNumber !== undefined ? `locker ${lockerNumber}` : "a locker occupancy record that no longer exists";
    return { sentence: `Checked out ${lockerText}.`, technicalIds: occupancyId ? [`occupancy_id=${occupancyId}`] : [] };
  },

  therapist_toggle_day_off: (f, lookups) => {
    const name = therapistName(f.therapist ?? "", lookups);
    const weekday = fmtWeekday(f.weekday ?? "");
    const isOff = f.off === "true";
    return {
      sentence: `Marked ${weekday} as ${isOff ? "a day off" : "a working day"} for ${name}.`,
      technicalIds: [],
    };
  },

  therapist_mark_absent: (f, lookups) => {
    const name = therapistName(f.therapist ?? "", lookups);
    const flagged = Number(f.flagged ?? "0");
    const reassignNote = flagged > 0 ? `, reassigning ${flagged} booking${flagged === 1 ? "" : "s"}` : "";
    return { sentence: `Flagged ${name} absent on ${f.date ?? "?"}${reassignNote}.`, technicalIds: [] };
  },

  quick_walkin: (f, lookups) => {
    const who = f.client ? clientLabel(f.client, lookups) : f.guest || "a guest";
    const technicalIds = [f.sale_id && `sale_id=${f.sale_id}`, f.booking_id && `booking_id=${f.booking_id}`].filter(
      Boolean
    ) as string[];
    return {
      sentence: `Walk-in: ${who} — ${f.service ?? "?"}, ${fmtPeso(f.amount ?? "0")}.`,
      technicalIds,
    };
  },

  sale_edit: (f) => ({
    sentence: `Updated sale to ${fmtPeso(f.amount ?? "0")} (${f.payment ?? "?"}).`,
    technicalIds: f.sale_id ? [`sale_id=${f.sale_id}`] : [],
  }),

  change_therapist: (f) => {
    const parts: string[] = [];
    if (f.old_therapist && f.new_therapist) {
      parts.push(`reassigned from ${f.old_therapist} to ${f.new_therapist}`);
    }
    if (f.old_time && f.new_time) {
      parts.push(`moved from ${fmtTime(f.old_time)} to ${fmtTime(f.new_time)}`);
    }
    const body = parts.length ? parts.join("; ") : "updated";
    const sentence = `Booking on ${f.date ?? "?"} ${body}.`;
    return {
      sentence: sentence.charAt(0).toUpperCase() + sentence.slice(1),
      technicalIds: f.booking_id ? [`booking_id=${f.booking_id}`] : [],
    };
  },

  staff_add: (f) => ({
    sentence: `Added staff member ${f.name ?? "?"} (${f.position ?? "?"}).`,
    technicalIds: [],
  }),

  settings_update_room_count: (f) => {
    if (f.added) {
      const numbers = f.added.split(",").filter(Boolean);
      return {
        sentence: `Added ${numbers.length} room${numbers.length === 1 ? "" : "s"} (now ${f.target ?? "?"} active).`,
        technicalIds: [],
      };
    }
    const numbers = (f.deactivated ?? "").split(",").filter(Boolean);
    return {
      sentence: `Deactivated ${numbers.length} room${numbers.length === 1 ? "" : "s"} (now ${f.target ?? "?"} active).`,
      technicalIds: [],
    };
  },

  settings_add_weekend_slot: (f) => ({
    sentence: `Added weekend slot at ${fmtTime(f.slot ?? "?")}.`,
    technicalIds: [],
  }),

  settings_add_lockers: (f) => {
    const numbers = (f.added ?? "").split(",").filter(Boolean);
    return {
      sentence: `Added ${numbers.length} locker${numbers.length === 1 ? "" : "s"}: ${numbers.join(", ")}.`,
      technicalIds: [],
    };
  },

  settings_update_service_points: (f, lookups) => ({
    sentence: `Set ${serviceName(f.service ?? "", lookups)} to ${f.points ?? "?"} pt${f.points === "1" ? "" : "s"}.`,
    technicalIds: [],
  }),

  settings_delete_service: (f, lookups) => ({
    sentence: `Deleted service ${serviceName(f.service ?? "", lookups)}.`,
    technicalIds: [],
  }),

  settings_update_service_price: (f, lookups) => ({
    sentence: `Set ${serviceName(f.service ?? "", lookups)} price to ${fmtPeso(f.price ?? "0")}.`,
    technicalIds: [],
  }),

  log_visit: (f, lookups) => {
    const who = clientLabel(f.client ?? "", lookups);
    const isRedemption = f.redemption === "t" || f.redemption === "true";
    const technicalIds = [f.sale_id && `sale_id=${f.sale_id}`, f.booking_id && `booking_id=${f.booking_id}`].filter(
      Boolean
    ) as string[];
    return {
      sentence: `Logged ${isRedemption ? "redemption" : "visit"}: ${who} — ${f.service ?? "?"}, ${fmtPeso(
        f.amount ?? "0"
      )}.`,
      technicalIds,
    };
  },

  settings_add_addon: (f) => ({
    sentence: `Added add-on ${f.name ?? "?"} at ${fmtPeso(f.price ?? "0")}.`,
    technicalIds: [],
  }),

  settings_delete_addon: (f, lookups) => ({
    sentence: `Deleted add-on ${addonName(f.addon ?? "", lookups)}.`,
    technicalIds: [],
  }),

  therapist_toggle_service: (f, lookups) => {
    const therapist = therapistName(f.therapist ?? "", lookups);
    const service = serviceName(f.service ?? "", lookups);
    const offering = f.offering === "true";
    return {
      sentence: `Marked ${service} as ${offering ? "offered" : "no longer offered"} by ${therapist}.`,
      technicalIds: [],
    };
  },

  staff_archive: (f) => ({
    sentence: `Archived staff member ${f.name ?? "?"}.`,
    technicalIds: [],
  }),

  settings_update_loyalty_formula: (f) => ({
    sentence: `Set loyalty formula to ${f.mode ?? "?"}${
      f.mode === "uniform" && f.peso_per_point && f.peso_per_point !== "n/a"
        ? `, ${fmtPeso(f.peso_per_point)}/pt`
        : ""
    }.`,
    technicalIds: [],
  }),
};

export function formatLogDetail(action: string, detail: string | null, lookups: Lookups): FormattedDetail {
  const formatter = FORMATTERS[action];
  if (!formatter) {
    return { sentence: detail ?? "", technicalIds: [] };
  }
  const fields = parseDetail(detail);
  return formatter(fields, lookups);
}
