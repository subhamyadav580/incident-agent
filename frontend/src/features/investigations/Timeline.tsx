import { Clock3 } from "lucide-react";
import { Markdown } from "@/components/ui/Markdown";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { cn } from "@/components/ui/cn";
import { parseTimeline } from "@/lib/timeline";

export function TimelinePanel({ markdown }: { markdown: string }) {
  const entries = parseTimeline(markdown);
  return (
    <Panel>
      <PanelHeader title="Timeline" icon={<Clock3 />}>
        <span className="ml-auto text-[12px] text-muted">Times in UTC, oldest first</span>
      </PanelHeader>
      <PanelBody>
        {entries.length ? (
          <ol className="relative space-y-0">
            <span className="absolute top-2 bottom-2 left-[95px] w-0.5 bg-line" aria-hidden />
            {entries.map((entry, index) => (
              <li key={index} className="grid grid-cols-[84px_22px_minmax(0,1fr)] items-start gap-x-2 py-1.5">
                <div className="text-right font-mono text-[12px] leading-snug whitespace-nowrap text-fg-2" title={entry.timeLabel}>
                  {entry.when ? (
                    <>
                      {entry.when.toISOString().slice(11, 19)}
                      <span className="block text-[10.5px] text-muted">
                        {entry.when.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted">{entry.timeLabel}</span>
                  )}
                </div>
                <span
                  className={cn("relative z-10 mt-1 ml-[5px] size-3 rounded-full border-2", entry.failure ? "border-err bg-err" : "border-accent bg-surface")}
                  aria-label={entry.failure ? "failure" : undefined}
                />
                <div className="min-w-0 text-[13.5px]">
                  {entry.service && <span className="mr-1.5 text-[12px] font-semibold text-accent">{entry.service}</span>}
                  <span className={cn(entry.failure ? "text-fg" : "text-fg-2")}>{entry.event}</span>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <Markdown>{markdown}</Markdown>
        )}
      </PanelBody>
    </Panel>
  );
}
