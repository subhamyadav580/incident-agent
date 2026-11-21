import { Clock3, ListOrdered } from "lucide-react";
import { Markdown } from "@/components/ui/Markdown";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { cn } from "@/components/ui/cn";
import { hasTimes, parseTimeline, type TimelineEntry } from "@/lib/timeline";

function TimeCell({ entry }: { entry: TimelineEntry }) {
  const when = entry.when;
  if (!when) return <span className="text-muted">–</span>;
  return (
    <span title={entry.raw.split(/\s+[—–]\s+/)[0]}>
      <span className={cn(when.noTimezone ? "text-fg-2" : "text-fg")}>{when.clock}</span>
      {when.day && <span className="block text-[10.5px] text-muted">{when.day}</span>}
      {when.noTimezone && (
        <span className="block text-[10.5px] text-warn" title="Written without a timezone (e.g. a database timestamp), so it can't be placed in UTC">
          no timezone
        </span>
      )}
    </span>
  );
}

export function TimelinePanel({ markdown }: { markdown: string }) {
  const entries = parseTimeline(markdown);

  if (!entries.length) {
    return (
      <Panel>
        <PanelHeader title="Timeline" icon={<Clock3 />} />
        <PanelBody><Markdown>{markdown}</Markdown></PanelBody>
      </Panel>
    );
  }

  // Entries without any times are a sequence of steps, not a timeline.
  if (!hasTimes(entries)) {
    return (
      <Panel>
        <PanelHeader title="Sequence of events" icon={<ListOrdered />}>
          <span className="ml-auto text-[12px] text-muted">No timestamps in this report</span>
        </PanelHeader>
        <PanelBody>
          <ol className="space-y-2">
            {entries.map((entry, index) => (
              <li key={index} className="flex gap-3 text-[13.5px]">
                <span className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold",
                  entry.failure ? "bg-err-soft text-err" : "bg-accent-soft text-accent",
                )}>
                  {index + 1}
                </span>
                <span className="pt-0.5 text-fg-2">{entry.event}</span>
              </li>
            ))}
          </ol>
        </PanelBody>
      </Panel>
    );
  }

  const sorted = entries.every((entry) => entry.when?.date);
  const anyNoTimezone = entries.some((entry) => entry.when?.noTimezone);
  return (
    <Panel>
      <PanelHeader title="Timeline" icon={<Clock3 />}>
        <span className="ml-auto text-[12px] text-muted">
          {sorted ? "Times in UTC, oldest first" : anyNoTimezone ? "Some times have no timezone; shown in the report's order" : "Shown in the report's order"}
        </span>
      </PanelHeader>
      <PanelBody>
        <ol className="relative">
          <span className="absolute top-2 bottom-2 left-[107px] w-0.5 bg-line" aria-hidden />
          {entries.map((entry, index) => (
            <li key={index} className="grid grid-cols-[96px_22px_minmax(0,1fr)] items-start gap-x-2 py-1.5">
              <div className="text-right font-mono text-[12px] leading-snug whitespace-nowrap">
                <TimeCell entry={entry} />
              </div>
              <span
                className={cn("relative z-10 mt-1 ml-[5px] size-3 rounded-full border-2", entry.failure ? "border-err bg-err" : "border-accent bg-surface")}
                aria-label={entry.failure ? "failure" : undefined}
              />
              <div className="min-w-0 text-[13.5px] break-words">
                {entry.service && <span className="mr-1.5 text-[12px] font-semibold text-accent">{entry.service}</span>}
                <span className={cn(entry.failure ? "text-fg" : "text-fg-2")}>{entry.event}</span>
              </div>
            </li>
          ))}
        </ol>
      </PanelBody>
    </Panel>
  );
}
