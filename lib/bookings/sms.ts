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
  { key: "{booking_date}", label: "{booking_date}", description: "Booking date (e.g. 2026-09-21)" },
  { key: "{client_name}", label: "{client_name}", description: "Client codename or guest name" },
  { key: "{slot_time}", label: "{slot_time}", description: "Scheduled time (e.g. 4:00 PM)" },
  { key: "{therapist_name}", label: "{therapist_name}", description: "Assigned therapist name" },
  { key: "{service_name}", label: "{service_name}", description: "Booked service (optional)", isOptional: true },
  { key: "{amount}", label: "{amount}", description: "Service price (optional)", isOptional: true },
];

export type SmsInterpolationData = {
  booking_date: string;
  client_name: string;
  slot_time: string;
  therapist_name?: string | null;
  service_name?: string | null;
  amount?: number | string | null;
};

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

  const replacements: Record<string, string> = {
    "{booking_date}": data.booking_date || "",
    "{client_name}": data.client_name || "",
    "{slot_time}": data.slot_time || "",
    "{therapist_name}": data.therapist_name || "—",
    "{service_name}": data.service_name || "",
    "{amount}": amountStr,
  };

  let result = template;
  for (const [placeholder, val] of Object.entries(replacements)) {
    result = result.replaceAll(placeholder, val);
  }
  return result;
}
