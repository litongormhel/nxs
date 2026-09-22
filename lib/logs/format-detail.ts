import {
  formatActionLog,
  formatActionLabel,
  type ActionLog,
  type Lookups,
} from "@/lib/logs";

export type { Lookups };

export type FormattedDetail = {
  sentence: string;
  technicalIds: string[];
};

export { formatActionLabel };

export function formatLogDetail(
  action: string,
  detail: string | null,
  lookups: Lookups
): FormattedDetail {
  const result = formatActionLog({ action, detail }, lookups);
  return {
    sentence: result.sentence,
    technicalIds: result.technicalIds || [],
  };
}
