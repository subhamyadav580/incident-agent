import { Bot, CheckCircle2, Database, GitBranch, Loader2, ScrollText, Sparkles, Wrench, XCircle, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { TraceSpan } from "@/api/types";
import { Panel } from "@/components/ui/Panel";
import { cn } from "@/components/ui/cn";
import { formatDuration } from "@/lib/format";
import { intentMeta } from "@/lib/intents";

export interface LiveStep {
  span: TraceSpan;
  done: boolean;
}

const SOURCE: Record<string, { icon: LucideIcon; running: string }> = {
  elasticsearch: { icon: ScrollText, running: "Searching logs across services" },
  postgres: { icon: Database, running: "Looking up records in databases" },
  git: { icon: GitBranch, running: "Searching code for where the error comes from" },
};

function argSummary(args: Record<string, unknown> | undefined): string {
  if (!args) return "";
  const value = args.path ?? args.pattern ?? args.query ?? args.index_name ?? args.table ?? Object.values(args)[0];
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return text.length > 70 ? `…${text.slice(-70)}` : text;
}

/** What a step is doing (while running) or found (when done), in plain language. */
function describe(step: LiveStep): { icon: LucideIcon; title: string; detail?: string } {
  const { span, done } = step;
  const d = span.detail;
  switch (span.kind) {
    case "intent":
      return { icon: Sparkles, title: done ? `Classified as ${intentMeta(d.intent).label.toLowerCase()}` : "Understanding your message", detail: done ? d.reason : undefined };
    case "prefetch": {
      const source = SOURCE[span.name] ?? { icon: Database, running: `Gathering evidence from ${span.name}` };
      return { icon: source.icon, title: source.running, detail: done ? (span.status === "error" ? d.error : d.summary) : undefined };
    }
    case "model":
      if (span.name === "Reply") return { icon: Bot, title: done ? "Replied" : "Writing a reply" };
      if (!done) return { icon: Bot, title: "Analyzing the evidence" };
      return d.outcome === "tool calls"
        ? { icon: Bot, title: "Decided to dig deeper", detail: `next: ${d.tool_calls?.map((c) => c.name).join(", ")}` }
        : { icon: Bot, title: "Wrote the report" };
    case "tool":
      return { icon: Wrench, title: `${span.name.replaceAll("_", " ")} ${argSummary(d.args)}`.trim(), detail: done ? (span.status === "error" ? d.error : d.result_chars != null ? `${d.result_chars.toLocaleString()} chars returned` : undefined) : undefined };
    case "limit":
      return { icon: XCircle, title: "Step budget reached" };
  }
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, []);
  return <span className="font-mono text-[12.5px] whitespace-nowrap text-muted tabular-nums">{((now - since) / 1000).toFixed(1)} s</span>;
}

/** The agent's steps as they happen: running steps spin, finished ones show what they found. */
export function LiveRun({ steps, startedAt, message }: { steps: LiveStep[]; startedAt: number; message: string }) {
  const running = steps.some((step) => !step.done) || !steps.length;
  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-line px-pad py-3">
        <span className="relative grid size-8 place-items-center rounded-lg bg-accent-soft text-accent">
          <Sparkles className="size-4" />
          {running && <span className="absolute -top-0.5 -right-0.5 size-2.5 animate-ping rounded-full bg-accent" />}
        </span>
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold text-fg">Investigating</div>
          <div className="truncate font-mono text-[12px] text-muted">{message}</div>
        </div>
        <span className="ml-auto"><Elapsed since={startedAt} /></span>
      </div>
      <ol className="px-pad py-3" aria-live="polite">
        {!steps.length && (
          <li className="flex items-center gap-3 py-1.5 text-[13px] text-muted"><Loader2 className="size-4 animate-spin" /> Starting…</li>
        )}
        {steps.map((step, index) => {
          const { icon: Icon, title, detail } = describe(step);
          const failed = step.span.status === "error";
          return (
            <li key={index} className="relative flex animate-pop-in gap-3 py-1.5">
              {index < steps.length - 1 && <span className="absolute top-7 bottom-0 left-[9px] w-px bg-line" aria-hidden />}
              <span className="relative z-10 mt-0.5 grid size-[19px] shrink-0 place-items-center rounded-full bg-surface">
                {!step.done ? <Loader2 className="size-4 animate-spin text-accent" /> : failed ? <XCircle className="size-4 text-err" /> : <CheckCircle2 className="size-4 text-ok" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className={cn("flex items-center gap-1.5 text-[13.5px]", step.done ? "text-fg-2" : "font-medium text-fg")}>
                  <Icon className="size-3.5 shrink-0 text-muted" />
                  <span className="truncate">{title}</span>
                </div>
                {detail && <div className={cn("mt-0.5 text-[12.5px] break-words", failed ? "text-err" : "text-muted")}>{detail}</div>}
              </div>
              {step.done && <span className="shrink-0 pt-0.5 font-mono text-[12px] text-muted tabular-nums">{formatDuration(step.span.duration_ms)}</span>}
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
