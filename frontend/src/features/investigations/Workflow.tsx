import { AlertTriangle, ArrowRight, Bot, ChevronRight, Database, FileText, MessageSquare, Route, Sparkles, Wrench, type LucideIcon } from "lucide-react";
import { Fragment, useState } from "react";
import type { Investigation, TraceSpan } from "@/api/types";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Feedback";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { cn } from "@/components/ui/cn";
import { formatDuration, formatNumber } from "@/lib/format";
import { intentMeta } from "@/lib/intents";

const KIND: Record<TraceSpan["kind"], { label: string; icon: LucideIcon; bar: string; chip: string }> = {
  intent: { label: "Classify", icon: Sparkles, bar: "bg-violet", chip: "bg-violet-soft text-violet" },
  prefetch: { label: "Gather data", icon: Database, bar: "bg-ok", chip: "bg-ok-soft text-ok" },
  model: { label: "Model", icon: Bot, bar: "bg-accent", chip: "bg-accent-soft text-accent" },
  tool: { label: "Tool", icon: Wrench, bar: "bg-warn", chip: "bg-warn-soft text-warn" },
  limit: { label: "Budget", icon: AlertTriangle, bar: "bg-err", chip: "bg-err-soft text-err" },
};

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

const tokensOf = (span: TraceSpan) => (span.detail.input_tokens ?? 0) + (span.detail.output_tokens ?? 0);

function spanSummary(span: TraceSpan): string {
  const d = span.detail;
  if (span.status === "error" && d.error) return d.error;
  switch (span.kind) {
    case "intent": return d.intent ? `${intentMeta(d.intent).label}` : "";
    case "prefetch": return d.summary ?? (d.chars != null ? `${formatNumber(d.chars)} chars of evidence` : "");
    case "model": return d.outcome === "tool calls" ? `asked for ${d.tool_calls?.map((c) => c.name).join(", ")}` : "wrote the answer";
    case "tool": return d.result_chars != null ? `${formatNumber(d.result_chars)} chars returned` : "";
    case "limit": return `stopped after ${d.steps} steps`;
  }
}

/** Message → Classify → Gather data → Agent → Report, with what happened at each stage. */
function Pipeline({ investigation, spans }: { investigation: Investigation; spans: TraceSpan[] }) {
  const of = (kind: TraceSpan["kind"]) => spans.filter((s) => s.kind === kind);
  const prefetch = of("prefetch");
  const models = of("model");
  const tools = of("tool");
  const failedPrefetch = prefetch.filter((s) => s.status === "error").length;
  const stages: { icon: LucideIcon; title: string; detail: string; tone: string; skipped?: boolean }[] = [
    { icon: MessageSquare, title: "Message", detail: `${investigation.message.length} chars`, tone: "text-fg-2" },
    { icon: Sparkles, title: "Classify", detail: of("intent")[0]?.detail.intent ? intentMeta(of("intent")[0].detail.intent).label : "skipped", tone: "text-violet", skipped: !of("intent").length },
    { icon: Database, title: "Gather data", detail: prefetch.length ? `${prefetch.length} source${prefetch.length > 1 ? "s" : ""}${failedPrefetch ? `, ${failedPrefetch} failed` : ""}` : "not needed", tone: failedPrefetch ? "text-err" : "text-ok", skipped: !prefetch.length },
    { icon: Bot, title: "Agent", detail: `${models.length} model step${models.length === 1 ? "" : "s"} · ${tools.length} tool call${tools.length === 1 ? "" : "s"}`, tone: "text-accent" },
    { icon: FileText, title: investigation.intent === "investigation" ? "Report" : "Answer", detail: investigation.status === "failed" ? "failed" : formatDuration(investigation.duration_ms), tone: investigation.status === "failed" ? "text-err" : "text-fg-2" },
  ];
  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {stages.map((stage, index) => (
        <Fragment key={stage.title}>
          {index > 0 && <ArrowRight className="size-4 self-center text-muted" aria-hidden />}
          <div className={cn("min-w-[130px] flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2", stage.skipped && "opacity-50")}>
            <div className={cn("flex items-center gap-1.5 text-[12.5px] font-semibold", stage.tone)}>
              <stage.icon className="size-3.5" /> {stage.title}
            </div>
            <div className="mt-0.5 text-[12px] leading-snug text-muted">{stage.detail}</div>
          </div>
        </Fragment>
      ))}
    </div>
  );
}

function Detail({ span }: { span: TraceSpan }) {
  const d = span.detail;
  const rows: [string, React.ReactNode][] = [];
  if (d.intent) rows.push(["Intent", intentMeta(d.intent).label]);
  if (d.reason) rows.push(["Why", d.reason]);
  if (d.summary) rows.push(["Found", d.summary]);
  if (d.chars != null && span.kind === "prefetch") rows.push(["Evidence", `${formatNumber(d.chars)} chars given to the model`]);
  if (d.input_tokens != null) rows.push(["Tokens", `${formatNumber(d.input_tokens)} in · ${formatNumber(d.output_tokens ?? 0)} out`]);
  if (d.tool_calls?.length) rows.push(["Requested", d.tool_calls.map((c) => c.name).join(", ")]);
  if (d.error) rows.push(["Error", <span className="text-err">{d.error}</span>]);
  const json = (value: unknown) => JSON.stringify(value, null, 2);
  return (
    <div className="space-y-2.5">
      {rows.length > 0 && (
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 text-[12.5px]">
          {rows.map(([key, value]) => (
            <Fragment key={key}>
              <dt className="text-muted">{key}</dt>
              <dd className="break-words text-fg">{value}</dd>
            </Fragment>
          ))}
        </dl>
      )}
      {(d.args || d.tool_calls?.length) && (
        <div>
          <div className="mb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">{d.args ? "Arguments" : "Tool calls"}</div>
          <pre className="max-h-48 overflow-auto rounded-md bg-surface px-3 py-2 font-mono text-[12px] text-fg-2 ring-1 ring-line">{json(d.args ?? d.tool_calls)}</pre>
        </div>
      )}
      {d.result && (
        <div>
          <div className="mb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">Result preview</div>
          <pre className="max-h-56 overflow-auto rounded-md bg-surface px-3 py-2 font-mono text-[12px] whitespace-pre-wrap break-words text-fg-2 ring-1 ring-line">{d.result}</pre>
        </div>
      )}
    </div>
  );
}

export function WorkflowPanel({ investigation }: { investigation: Investigation }) {
  const spans = investigation.trace ?? [];
  const [open, setOpen] = useState<number | null>(null);

  if (!spans.length) {
    return (
      <Panel>
        <EmptyState icon={<Route />} title="No workflow recorded">
          This investigation ran before workflow tracing was added. New investigations record every step.
        </EmptyState>
      </Panel>
    );
  }

  const total = Math.max(investigation.duration_ms, ...spans.map((s) => s.start_ms + s.duration_ms), 1);
  const tokensIn = spans.reduce((sum, s) => sum + (s.detail.input_tokens ?? 0), 0);
  const tokensOut = spans.reduce((sum, s) => sum + (s.detail.output_tokens ?? 0), 0);
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader title="How this investigation ran" icon={<Route />} tone="violet">
          <span className="ml-auto flex flex-wrap gap-1.5">
            <Badge>{formatDuration(total)} total</Badge>
            <Badge tone="accent">{plural(spans.filter((s) => s.kind === "model" || s.kind === "intent").length, "model call")}</Badge>
            <Badge tone="warn">{plural(spans.filter((s) => s.kind === "tool").length, "tool call")}</Badge>
            {tokensIn + tokensOut > 0 && <Badge>{formatNumber(tokensIn)} in · {formatNumber(tokensOut)} out tokens</Badge>}
          </span>
        </PanelHeader>
        <PanelBody><Pipeline investigation={investigation} spans={spans} /></PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Steps" icon={<Wrench />}>
          <span className="ml-auto text-[12px] text-muted">Bars show when each step ran; click a step for details</span>
        </PanelHeader>
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[minmax(0,320px)_minmax(0,1fr)_72px] items-center gap-3 border-b border-line px-pad py-2 text-[11px] font-semibold tracking-wider text-muted uppercase">
              <span>Step</span>
              <div className="relative h-4">
                {ticks.map((tick) => (
                  <span key={tick} className="absolute -translate-x-1/2 font-normal whitespace-nowrap normal-case tabular-nums first:translate-x-0 last:-translate-x-full" style={{ left: `${tick * 100}%` }}>
                    {formatDuration(Math.round(total * tick))}
                  </span>
                ))}
              </div>
              <span className="text-right">Time</span>
            </div>
            {spans.map((span, index) => {
              const kind = KIND[span.kind] ?? KIND.model;
              const expanded = open === index;
              const left = (span.start_ms / total) * 100;
              const width = Math.max((span.duration_ms / total) * 100, 0.6);
              return (
                <div key={index} className="border-b border-line last:border-b-0">
                  <button type="button" onClick={() => setOpen(expanded ? null : index)} aria-expanded={expanded}
                    className={cn("grid w-full grid-cols-[minmax(0,320px)_minmax(0,1fr)_72px] items-center gap-3 px-pad py-row text-left hover:bg-hover", expanded && "bg-surface-2")}>
                    <span className="flex min-w-0 items-center gap-2">
                      <ChevronRight className={cn("size-3.5 shrink-0 text-muted transition-transform", expanded && "rotate-90")} />
                      <span className={cn("grid size-6 shrink-0 place-items-center rounded-md [&_svg]:size-3.5", kind.chip)}><kind.icon /></span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className={cn("truncate text-[13px] font-medium", span.kind === "tool" ? "font-mono text-[12.5px]" : "", "text-fg")}>{span.name}</span>
                          {span.status === "error" && <Badge tone="err" icon={<AlertTriangle />}>{span.kind === "limit" ? "limit" : "failed"}</Badge>}
                        </span>
                        <span className="block truncate text-[12px] text-muted" title={spanSummary(span)}>{spanSummary(span)}</span>
                      </span>
                    </span>
                    <span className="relative h-5 rounded bg-hover">
                      {ticks.slice(1, -1).map((tick) => <span key={tick} className="absolute inset-y-0 w-px bg-line" style={{ left: `${tick * 100}%` }} />)}
                      <span className={cn("absolute inset-y-1 rounded-sm", span.status === "error" ? "bg-err" : kind.bar)} style={{ left: `${left}%`, width: `${width}%` }} />
                    </span>
                    <span className="text-right text-[12.5px] text-fg-2 tabular-nums">
                      {formatDuration(span.duration_ms)}
                      {tokensOf(span) > 0 && <span className="block text-[11px] text-muted">{formatNumber(tokensOf(span))} tok</span>}
                    </span>
                  </button>
                  {expanded && <div className="border-t border-line bg-surface-2 px-pad py-3 pl-12"><Detail span={span} /></div>}
                </div>
              );
            })}
          </div>
        </div>
      </Panel>
    </div>
  );
}
