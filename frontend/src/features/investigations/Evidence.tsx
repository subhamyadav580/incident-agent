import { ChevronRight, Code2, Database, Layers, Route } from "lucide-react";
import { Fragment, useState } from "react";
import type { Evidence } from "@/api/types";
import { Badge } from "@/components/ui/Badge";
import { Sparkline } from "@/components/ui/Charts";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { cn } from "@/components/ui/cn";
import { formatDateTime, formatNumber } from "@/lib/format";

export const evidenceCount = (evidence: Evidence) =>
  (evidence.services?.length ?? 0) +
  (evidence.traces?.length ?? 0) +
  (evidence.records?.filter((r) => r.rows.length || r.error).length ?? 0) +
  (evidence.code?.filter((c) => c.file).length ?? 0);

/** Where the error text appears in the connected repositories, with surrounding lines. */
export function CodePanel({ evidence, limit }: { evidence: Evidence; limit?: number }) {
  const matches = (evidence.code ?? []).filter((match) => match.file);
  const errors = (evidence.code ?? []).filter((match) => match.error);
  if (!matches.length && !errors.length) return null;
  return (
    <Panel>
      <PanelHeader title="Code references" icon={<Code2 />} tone="violet">
        <span className="text-[12px] text-muted">where the error text appears in your repositories</span>
      </PanelHeader>
      <PanelBody className="space-y-3">
        {errors.map((error, index) => (
          <div key={`e${index}`} className="text-[12.5px] text-err">{error.repo}: {error.error}</div>
        ))}
        {matches.slice(0, limit).map((match, index) => (
          <div key={index} className="overflow-hidden rounded-lg border border-line">
            <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2 px-3 py-1.5">
              <Badge tone="violet">{match.repo}</Badge>
              <span className="min-w-0 truncate font-mono text-[12px] text-fg" title={match.file ?? ""}>
                {match.file}:{match.line}
              </span>
              {match.term && <span className="ml-auto truncate text-[11.5px] text-muted">matched “{match.term}”</span>}
            </div>
            {match.snippet && (
              <pre className="overflow-x-auto px-3 py-2 font-mono text-[12px] leading-relaxed text-fg-2">
                {match.snippet.split("\n").map((line, lineIndex) => {
                  const hit = line.trimStart().startsWith(String(match.line));
                  return <div key={lineIndex} className={hit ? "-mx-3 bg-violet-soft px-3 text-fg" : undefined}>{line}</div>;
                })}
              </pre>
            )}
          </div>
        ))}
        {limit && matches.length > limit && <div className="text-[12px] text-muted">{matches.length - limit} more in the Evidence tab.</div>}
      </PanelBody>
    </Panel>
  );
}

export function ServicesTable({ evidence, limit }: { evidence: Evidence; limit?: number }) {
  const [open, setOpen] = useState<string | null>(null);
  const services = (evidence.services ?? []).slice(0, limit);
  if (!services.length) return null;
  const searched = evidence.searched_for ?? {};
  const terms = [...(searched.exceptions ?? []), ...(searched.phrases ?? []).map((p) => `"${p}"`), ...(searched.identifiers ?? [])];

  return (
    <Panel>
      <PanelHeader title="Affected services" icon={<Layers />} tone="ok">
        <span className="min-w-0 flex-1 truncate text-[12px] text-muted" title={terms.join(", ")}>
          {terms.length > 0 && `matched on ${terms.slice(0, 4).join(", ")}${terms.length > 4 ? "…" : ""}`}
        </span>
        {searched.relaxed_match && <Badge tone="warn">loose match</Badge>}
        {searched.discovered_groups && <Badge tone="accent">auto-discovered</Badge>}
      </PanelHeader>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left">
          <thead>
            <tr className="border-b border-line text-[11px] font-semibold tracking-wider text-muted uppercase">
              <th className="px-pad py-2.5">Service</th>
              <th className="px-pad py-2.5 text-right">Matches</th>
              <th className="px-pad py-2.5">Trend · 24h</th>
              <th className="px-pad py-2.5">First seen</th>
              <th className="px-pad py-2.5">Last seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {services.map((service) => {
              const expanded = open === service.name;
              return (
                <Fragment key={service.name}>
                  <tr className="cursor-pointer hover:bg-hover" onClick={() => setOpen(expanded ? null : service.name)} aria-expanded={expanded}>
                    <td className="px-pad py-row">
                      <div className="flex items-center gap-1.5 font-medium text-fg">
                        <ChevronRight className={cn("size-3.5 text-muted transition-transform", expanded && "rotate-90")} />
                        <span className="break-all">{service.name}</span>
                      </div>
                      {service.error && <div className="pl-5 text-[12px] text-err">{service.error}</div>}
                    </td>
                    <td className="px-pad py-row text-right font-semibold tabular-nums">{formatNumber(service.total)}</td>
                    <td className="px-pad py-row"><Sparkline points={service.histogram} /></td>
                    <td className="px-pad py-row text-[12.5px] whitespace-nowrap text-muted" title={service.first_seen ?? ""}>{formatDateTime(service.first_seen)}</td>
                    <td className="px-pad py-row text-[12.5px] whitespace-nowrap text-muted" title={service.last_seen ?? ""}>{formatDateTime(service.last_seen)}</td>
                  </tr>
                  {expanded && (
                    <tr className="bg-surface-2">
                      <td colSpan={5} className="space-y-1.5 px-pad py-3">
                        <div className="text-[11px] font-semibold tracking-wider text-muted uppercase">Distinct log patterns</div>
                        {service.patterns.map((pattern, index) => (
                          <div key={index} className="flex gap-3 rounded-md bg-surface px-2.5 py-1.5 font-mono text-[12px] text-fg-2 ring-1 ring-line">
                            <b className="w-14 shrink-0 text-right font-semibold text-fg tabular-nums">×{formatNumber(pattern.count)}</b>
                            <span className="min-w-0 break-words">{pattern.text}</span>
                          </div>
                        ))}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {!limit && <div className="px-pad py-2 text-[12px] text-muted">Click a service to see its distinct log patterns.</div>}
    </Panel>
  );
}

export function TracesPanel({ evidence }: { evidence: Evidence }) {
  const traces = evidence.traces ?? [];
  if (!traces.length) return null;
  return (
    <Panel>
      <PanelHeader title="Request traces" icon={<Route />} />
      <PanelBody className="space-y-3">
        {traces.map((trace) => (
          <div key={trace.id}>
            <div className="mb-1.5 font-mono text-[12.5px] font-semibold text-fg">{trace.id}</div>
            <div className="flex flex-wrap gap-1.5">
              {trace.services.map((service) => (
                <Badge key={service.name} tone={service.error ? "err" : "accent"}>
                  {service.name} · {formatNumber(service.total)}
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </PanelBody>
    </Panel>
  );
}

export function RecordsPanel({ evidence }: { evidence: Evidence }) {
  const records = (evidence.records ?? []).filter((record) => record.rows.length || record.error);
  if (!records.length) return null;
  return (
    <Panel>
      <PanelHeader title="Database records" icon={<Database />} />
      <PanelBody className="grid gap-3 lg:grid-cols-2">
        {records.map((record, index) => (
          <div key={index} className="overflow-hidden rounded-lg border border-line bg-surface-2">
            <div className="flex items-center gap-2 border-b border-line px-3 py-2">
              <span className="font-mono text-[12.5px] font-semibold text-fg">{record.database}.{record.table}</span>
              <span className="ml-auto truncate font-mono text-[11.5px] text-muted">
                {Object.entries(record.where).map(([key, value]) => `${key}=${value}`).join(" ")}
              </span>
            </div>
            <div className="space-y-3 p-3">
              {record.error ? (
                <div className="text-[12.5px] text-err">{record.error}</div>
              ) : (
                record.rows.map((row, rowIndex) => (
                  <dl key={rowIndex} className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 font-mono text-[12px]">
                    {Object.entries(row)
                      .filter(([, value]) => value !== null && value !== "")
                      .map(([key, value]) => (
                        <Fragment key={key}>
                          <dt className="text-muted">{key}</dt>
                          <dd className="break-words text-fg">{String(value)}</dd>
                        </Fragment>
                      ))}
                  </dl>
                ))
              )}
            </div>
          </div>
        ))}
      </PanelBody>
    </Panel>
  );
}
