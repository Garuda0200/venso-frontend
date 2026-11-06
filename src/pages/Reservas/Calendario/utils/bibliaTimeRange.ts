export interface BibliaTimeRange {
  start: string;
  end: string;
}

const timeValue = (hour: string, minute: string, second = "00") => {
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return "";
  return `${hour.padStart(2, "0")}:${minute}`;
};

/** Read legacy Excel windows without rewriting the stored text. */
export function parseBibliaTimeRange(value: string): BibliaTimeRange {
  const times = [...value.matchAll(/(?<![\d:.])(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?(?![\d:.])/g)]
    .map(match => timeValue(match[1], match[2], match[3]))
    .filter(Boolean);
  return { start: times[0] || "", end: times[1] || "" };
}

/** A single selected endpoint remains a single hour, including end-only edits. */
export function formatBibliaTimeRange(start: string, end: string): string {
  return [start, end].map(value => {
    const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value);
    return match ? timeValue(match[1], match[2], match[3]) : "";
  }).filter(Boolean).join("-");
}
