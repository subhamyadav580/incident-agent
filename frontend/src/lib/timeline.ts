// The model writes timeline entries as "time — service — event", but the time
// comes in many shapes ("2026-11-21T13:40:08Z", "16:07:06 UTC (2026-11-20)",
// "2026-11-21 19:08:11 IST", database times with no timezone at all) and
// services log in different timezones. Parse what can be parsed to UTC so
// entries can be shown in one timezone and sorted; keep the rest as written.

const TZ_ABBREVIATIONS: Record<string, string> = {
  UTC: "Z", GMT: "Z", Z: "Z", IST: "+05:30", CET: "+01:00", CEST: "+02:00",
  EST: "-05:00", EDT: "-04:00", PST: "-08:00", PDT: "-07:00",
};

const DATE = /(\d{4}-\d{2}-\d{2})/;
const TIME = /(?:T|\b)(\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?)/;
const OFFSET = /(?:\d)(Z|[+-]\d{2}:?\d{2})\b|\b(UTC|GMT|IST|CET|CEST|EST|EDT|PST|PDT)\b/;

export interface ParsedTime {
  /** Absolute instant, when date, time and timezone are all known. */
  date: Date | null;
  /** Time of day to show (UTC when `date` is set, else as written). */
  clock: string;
  /** Calendar day to show under the clock, if known. */
  day: string | null;
  /** The time had no timezone (e.g. a database timestamp), so it can't be placed in UTC. */
  noTimezone: boolean;
}

/** Parse the time part of an entry; null when it doesn't contain a time of day. */
export function parseWhen(text: string): ParsedTime | null {
  // Prefer an explicit UTC time in brackets: "05:26:44 IST (2026-11-20T23:56:44 UTC)".
  const bracketedUtc = text.match(/\((\d{4}-\d{2}-\d{2}[T ][\d:.]+)\s*(?:UTC|Z)\)/i);
  const source = bracketedUtc ? `${bracketedUtc[1]} UTC` : text.split(/\s+to\s+/i)[0];

  const time = source.match(TIME);
  if (!time) return null;
  const date = source.match(DATE) ?? text.match(DATE); // "16:07:06 UTC (2026-11-20)"
  const offsetMatch = source.replace(/\(.*?approx.*?\)/i, "").match(OFFSET);
  const offset = offsetMatch ? (offsetMatch[1] ?? TZ_ABBREVIATIONS[offsetMatch[2]]) : null;
  const clock = time[1].split(".")[0].padStart(time[1].indexOf(":") === 1 ? 8 : 0, "0");

  if (date && offset) {
    const instant = new Date(`${date[1]}T${clock.length === 5 ? `${clock}:00` : clock}${offset === "Z" ? "Z" : offset}`);
    if (!Number.isNaN(instant.getTime())) {
      return {
        date: instant,
        clock: instant.toISOString().slice(11, 19),
        day: instant.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }) + " UTC",
        noTimezone: false,
      };
    }
  }
  return {
    date: null,
    clock,
    day: date ? new Date(`${date[1]}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }) : null,
    noTimezone: !offset,
  };
}

export interface TimelineEntry {
  raw: string;
  when: ParsedTime | null;
  service: string | null;
  event: string;
  failure: boolean;
}

const FAILURE = /fail|error|exception|timeout|timed out|not found|abort|reject|denied|unauthori|5\d\d\b/i;
const SEPARATOR = /\s+[—–]\s+|\s+-{1,2}\s+/;

/** Parse the Markdown bullet list of a Timeline section. */
export function parseTimeline(markdown: string): TimelineEntry[] {
  const items = markdown
    .split("\n")
    .map((line) => line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)$/)?.[1]?.trim())
    .filter((item): item is string => Boolean(item));

  const entries = items.map((raw, index) => {
    const text = raw.replace(/\*\*|`/g, "").trim();
    const parts = text.split(SEPARATOR);
    const when = parts.length >= 2 ? parseWhen(parts[0]) : null;
    const rest = when ? parts.slice(1) : parts;
    return {
      index,
      raw: text,
      when,
      service: when && rest.length >= 2 ? rest[0] : null,
      event: when ? (rest.length >= 2 ? rest.slice(1) : rest).join(" — ") : text,
      failure: FAILURE.test(text),
    };
  });

  // Sort only when every entry is an exact instant; otherwise keep the model's order.
  if (entries.length && entries.every((entry) => entry.when?.date)) {
    entries.sort((a, b) => a.when!.date!.getTime() - b.when!.date!.getTime() || a.index - b.index);
  }
  return entries.map(({ index: _index, ...entry }) => entry);
}

/** True when the entries carry times (a real timeline), false for plain steps. */
export const hasTimes = (entries: TimelineEntry[]) => entries.some((entry) => entry.when);
