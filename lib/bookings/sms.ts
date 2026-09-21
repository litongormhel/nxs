export const DEFAULT_SMS_TEMPLATE = `Thank you for choosing Nexus Spa! Your NXS appointment details are as follows:

Date: {booking_date}
Client: {client_name}
Time: {slot_time}
Thera: {therapist_name}

For your safety and well-being, our staff will conduct a quick body temperature check upon your arrival.

To make the most of your experience, we recommend arriving 30 minutes before your scheduled time. This allows you to enjoy your full session without any disruptions. Please be mindful that late arrivals may lead to the adjustment of your session duration.

We look forward to be your NXS relaxation spot!

#NexusSpa
#pressureXpleasure`;

export type SmsTemplateVariable = {
  key: string;
  label: string;
  description: string;
  isOptional?: boolean;
};

export const SMS_TEMPLATE_VARIABLES: SmsTemplateVariable[] = [
  { key: "{booking_date}", label: "{booking_date}", description: "Booking date (e.g. Sep 21, 2026)" },
  { key: "{client_name}", label: "{client_name}", description: "Client codename or guest name" },
  { key: "{slot_time}", label: "{slot_time}", description: "Scheduled time (e.g. 4:00 PM)" },
  { key: "{therapist_name}", label: "{therapist_name}", description: "Assigned therapist name" },
  { key: "{service_name}", label: "{service_name}", description: "Booked service (optional)", isOptional: true },
  { key: "{amount}", label: "{amount}", description: "Service price (optional)", isOptional: true },
  { key: "{room_number}", label: "{room_number}", description: "Room number (e.g. Room 1 or None)", isOptional: true },
];

export type SmsInterpolationData = {
  booking_date: string;
  client_name: string;
  slot_time: string;
  therapist_name?: string | null;
  service_name?: string | null;
  amount?: number | string | null;
  room_number?: number | string | null;
};

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

/**
 * Formats a booking date string into "MMM D, YYYY" (e.g. "Sep 21, 2026").
 * Parses YYYY-MM-DD components directly to prevent UTC timezone shifting.
 * Safely falls back to current date or raw value if missing or non-standard.
 */
export function formatSmsDate(dateStr?: string | null): string {
  if (!dateStr || typeof dateStr !== "string") {
    const now = new Date();
    return `${MONTH_NAMES[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
  }

  const trimmed = dateStr.trim();
  if (/^[A-Za-z]{3}\s+\d{1,2},\s+\d{4}$/.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${MONTH_NAMES[month - 1]} ${day}, ${year}`;
    }
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return `${MONTH_NAMES[parsed.getMonth()]} ${parsed.getDate()}, ${parsed.getFullYear()}`;
  }

  return dateStr;
}

/**
 * Interpolates placeholders in an SMS template with real booking values.
 */
export function interpolateSmsTemplate(
  template: string,
  data: SmsInterpolationData
): string {
  const amountStr =
    typeof data.amount === "number"
      ? `₱${data.amount}`
      : data.amount
      ? String(data.amount)
      : "";

  const formattedDate = formatSmsDate(data.booking_date);

  let roomStr = "None";
  if (data.room_number != null && data.room_number !== "") {
    const rawRoom = String(data.room_number).trim();
    if (/^none$/i.test(rawRoom)) {
      roomStr = "None";
    } else if (/^room\s+/i.test(rawRoom)) {
      roomStr = rawRoom;
    } else if (rawRoom) {
      roomStr = `Room ${rawRoom}`;
    }
  }

  const replacements: Record<string, string> = {
    "{booking_date}": formattedDate,
    "{client_name}": data.client_name || "",
    "{slot_time}": data.slot_time || "",
    "{therapist_name}": data.therapist_name || "—",
    "{service_name}": data.service_name || "",
    "{amount}": amountStr,
    "{room_number}": roomStr,
    "{room}": roomStr,
  };

  let result = template;
  for (const [placeholder, val] of Object.entries(replacements)) {
    result = result.replaceAll(placeholder, val);
  }
  return result;
}
