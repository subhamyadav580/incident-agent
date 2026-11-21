import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { NavLink } from "react-router";
import { useInvestigations } from "@/api/hooks";
import { Input } from "@/components/ui/Field";
import { EmptyState, Spinner } from "@/components/ui/Feedback";
import { Panel } from "@/components/ui/Panel";
import { cn } from "@/components/ui/cn";
import { formatDuration, timeAgo } from "@/lib/format";
import { intentMeta } from "@/lib/intents";

export function HistoryList() {
  const { data = [], isLoading } = useInvestigations();
  const [filter, setFilter] = useState("");
  const items = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return term ? data.filter((item) => `${item.message} ${item.headline}`.toLowerCase().includes(term)) : data;
  }, [data, filter]);

  return (
    <Panel className="flex max-h-[360px] flex-col lg:sticky lg:top-[72px] lg:max-h-[calc(100vh-92px)]">
      <div className="relative border-b border-line p-2.5">
        <Search className="pointer-events-none absolute top-1/2 left-5 size-3.5 -translate-y-1/2 text-muted" />
        <Input type="search" placeholder="Filter history…" value={filter} onChange={(e) => setFilter(e.target.value)} className="pl-8" aria-label="Filter history" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="grid place-items-center p-6"><Spinner /></div>
        ) : items.length ? (
          items.map((item) => {
            const meta = intentMeta(item.intent);
            return (
              <NavLink key={item.id} to={`/investigations/${item.id}`}
                className={({ isActive }) => cn("block border-b border-line px-3.5 py-row hover:bg-hover", isActive && "bg-accent-soft shadow-[inset_3px_0_0_var(--accent)]")}>
                <div className="line-clamp-2 text-[13px] font-medium break-words text-fg">{item.message}</div>
                <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-muted">
                  <span className={cn("size-2 rounded-full", item.status === "failed" && "bg-err")} style={item.status === "failed" ? undefined : { background: meta.color }} />
                  {item.status === "failed" ? "Failed" : meta.label}
                  <span>·</span>
                  {timeAgo(item.created_at)}
                  <span className="ml-auto tabular-nums">{formatDuration(item.duration_ms)}</span>
                </div>
              </NavLink>
            );
          })
        ) : (
          <EmptyState title={data.length ? "No match" : "No history yet"}>{data.length ? "Try another filter." : "Your investigations appear here."}</EmptyState>
        )}
      </div>
    </Panel>
  );
}
