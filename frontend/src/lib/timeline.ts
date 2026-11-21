// The model writes timeline entries as "time — service — event", but services
// log in different timezones (UTC, +05:30, "IST"). Parse every time to UTC so
// entries can be shown in one timezone and sorted chronologically.

const TZ_ABBREVIATIONS: Record<string, string> = {
  UTC: "Z", GMT: "Z", IST: "+05:30", CET: "+01:00", CEST: "+02:00", EST: "-05:00", PST: "-08:00",
};

export function parseWhen(text: string): Date | null {
  // Prefer an explicit UTC time in brackets: "05:26:44 IST (2026-11-20T23:56:44 UTC)".
  const bracketed = text.match(/\((\d{4}-\d{2}-\d{2}[T ][\d:.]+)\s*UTC\)/i);
  let value = bracketed ? `${bracketed[1]} UTC` : text.split(/\s+to\s+/i)[0].replace(/\s*\(.*\)\s*/, "").trim();
  if (!/\d{4}-\d{2}-\d{2}/.test(value)) return null;

  let offset = "";
  const abbreviation = value.match(/\s([A-Z]{3,4})$/);
  if (abbreviation && TZ_ABBREVIATIONS[abbreviation[1]]) {
    offset = TZ_ABBREVIATIONS[abbreviation[1]];
    value = value.slice(0, -abbreviation[0].length);
  }
  value = value.trim().replace(" ", "T");
  const date = new Date(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(value) ? value : value + (offset || "Z"));
  return Number.isNaN(date.getTime()) ? null : date;
}

export interface TimelineEntry {
  raw: string;
  when: Date | null;
  timeLabel: string;
  service: string | null;
  event: string;
  failure: boolean;
}

const FAILURE = /fail|error|exception|timeout|timed out|not found|abort|reject|denied|unauthori|5\d\d\b/i;

/** Parse the Markdown bullet list of a Timeline section. */
export function parseTimeline(markdown: string): TimelineEntry[] {
  const items = markdown
    .split("\n")
    .map((line) => line.match(/^\s*[-*+]\s+(.*)$/)?.[1]?.trim())
    .filter((item): item is string => Boolean(item));

  const entries = items.map((raw, index) => {
    const text = raw.replace(/\*\*|`/g, "");
    const parts = text.split(/\s+[—–]\s+|\s+-{1,2}\s+/);
    const structured = parts.length >= 3;
    const when = structured ? parseWhen(parts[0]) : null;
    return {
      index,
      raw: text,
      when,
      timeLabel: structured ? parts[0].replace(/\s*UTC$/i, "") : "",
      service: structured ? parts[1] : null,
      event: structured ? parts.slice(2).join(" — ") : text,
      failure: FAILURE.test(text),
    };
  });

  if (entries.length && entries.every((entry) => entry.when)) {
    entries.sort((a, b) => a.when!.getTime() - b.when!.getTime() || a.index - b.index);
  }
  return entries.map(({ index: _index, ...entry }) => entry);
}
