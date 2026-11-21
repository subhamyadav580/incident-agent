import { ArrowDown, ArrowRight, Bot, Database, FileText, GitBranch, MessageSquare, MessagesSquare, Repeat, ScrollText, Search, Sparkles, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";

type Tone = "neutral" | "violet" | "ok" | "accent" | "warn";

interface Stage {
  id: string;
  step: number;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  tone: Tone;
  chips?: { icon: LucideIcon; label: string }[];
  what: string;
  details: string[];
}

const STAGES: Stage[] = [
  {
    id: "message", step: 1, title: "Your message", subtitle: "error, id or question", icon: MessageSquare, tone: "neutral",
    what: "Paste whatever you have: an error message or stack trace line, the id of something that failed, or a question about your data.",
    details: [
      "“NumberFormatException: For input string …”",
      "“Order ORD-48213 failed at checkout, why?”",
      "“What is the status of order ORD-48213?”",
    ],
  },
  {
    id: "classify", step: 2, title: "Classify", subtitle: "what kind of message", icon: Sparkles, tone: "violet",
    what: "A small model call decides what the message needs, so a greeting doesn't trigger a log search and a data question doesn't get an incident report.",
    details: [
      "Investigation — an error, a failing id, “checkout is slow”: full pipeline.",
      "Data question — “status of order X?”: database lookups and tools, no log search.",
      "Conversation — “what can you do?”: answered directly, no data access.",
    ],
  },
  {
    id: "gather", step: 3, title: "Gather evidence", subtitle: "from every connected source", icon: Database, tone: "ok",
    chips: [
      { icon: ScrollText, label: "Logs" },
      { icon: Database, label: "Databases" },
      { icon: GitBranch, label: "Code" },
    ],
    what: "Before the model reasons, plain code searches your data sources. This is fast, repeatable and costs no model calls.",
    details: [
      "Logs: the error's fixed phrases and exception names are searched in every service; counts, first/last seen and distinct patterns per service; affected request ids are traced across services.",
      "Databases: rows for ids in the message are looked up in the tables you described.",
      "Code: the exact file and line that logs or throws the error.",
      "100k matching log lines are collapsed into a few patterns, so the evidence stays small.",
    ],
  },
  {
    id: "agent", step: 4, title: "Agent loop", subtitle: "reads, digs, verifies", icon: Bot, tone: "accent",
    chips: [
      { icon: Search, label: "search" },
      { icon: Database, label: "SQL" },
      { icon: GitBranch, label: "read code" },
    ],
    what: "The model reads the evidence and calls tools only to fill gaps, until it can explain the failure or the step budget runs out.",
    details: [
      "Tools: log search and index mappings, read-only SQL with timeouts, code search, file reading and recent commits.",
      "Each data source tells the model what it holds and how to query it; your descriptions and team instructions are included.",
      "Every step is recorded with its timing, tokens and results — see the Workflow tab of an investigation.",
    ],
  },
  {
    id: "report", step: 5, title: "Report", subtitle: "cause, evidence, gaps", icon: FileText, tone: "warn",
    what: "A report built around evidence, not guesses.",
    details: [
      "Summary of what happened.",
      "Root cause, each point marked Fact or Hypothesis.",
      "Timeline across services in UTC, plus affected services, code references and database records.",
      "Evidence gaps: what couldn't be checked and the next check worth doing.",
    ],
  },
];

const TONE: Record<Tone, { ring: string; icon: string; badge: string; dot: string }> = {
  neutral: { ring: "ring-line-strong", icon: "bg-surface-2 text-fg-2", badge: "bg-surface-2 text-fg-2", dot: "bg-muted" },
  violet: { ring: "ring-violet", icon: "bg-violet-soft text-violet", badge: "bg-violet-soft text-violet", dot: "bg-violet" },
  ok: { ring: "ring-ok", icon: "bg-ok-soft text-ok", badge: "bg-ok-soft text-ok", dot: "bg-ok" },
  accent: { ring: "ring-accent", icon: "bg-accent-soft text-accent", badge: "bg-accent-soft text-accent", dot: "bg-accent" },
  warn: { ring: "ring-warn", icon: "bg-warn-soft text-warn", badge: "bg-warn-soft text-warn", dot: "bg-warn" },
};

/** Animated connector between stages (horizontal on desktop, vertical on phones). */
function Connector() {
  return (
    <div className="flex shrink-0 items-center justify-center text-muted lg:h-[176px] lg:w-8 lg:self-start" aria-hidden>
      <span className="hidden h-0.5 w-full flow-line-x lg:block" />
      <ArrowRight className="hidden size-4 -ml-2 lg:block" />
      <ArrowDown className="size-4 lg:hidden" />
    </div>
  );
}

function StageCard({ stage, selected, onSelect, children }: { stage: Stage; selected: boolean; onSelect: () => void; children?: ReactNode }) {
  const tone = TONE[stage.tone];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "group relative flex min-w-0 flex-col rounded-xl border border-line bg-surface p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-drawer lg:h-[176px]",
        selected && cn("ring-2", tone.ring),
      )}
    >
      <div className="flex items-center gap-2.5">
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg [&_svg]:size-4", tone.icon)}><stage.icon /></span>
        <span className={cn("rounded-full px-1.5 text-[10.5px] font-semibold", tone.badge)}>{stage.step}</span>
        {stage.id === "agent" && <Repeat className="ml-auto size-3.5 text-muted" aria-label="repeats" />}
      </div>
      <div className="mt-2.5 text-[14px] font-semibold text-fg">{stage.title}</div>
      <div className="text-[12px] text-muted">{stage.subtitle}</div>
      {stage.chips && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {stage.chips.map((chip) => (
            <span key={chip.label} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-fg-2 ring-1 ring-line">
              <chip.icon className="size-3" /> {chip.label}
            </span>
          ))}
        </div>
      )}
      {children}
    </button>
  );
}

export function AgentFlow() {
  const [selected, setSelected] = useState("gather");
  const active = STAGES.find((stage) => stage.id === selected)!;
  const tone = TONE[active.tone];

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-stretch gap-2 lg:flex-row">
        {STAGES.map((stage, index) => (
          <div key={stage.id} className="contents">
            {index > 0 && <Connector />}
            <div className="flex min-w-0 flex-1 flex-col lg:self-start">
              <StageCard stage={stage} selected={selected === stage.id} onSelect={() => setSelected(stage.id)} />
              {stage.id === "classify" && (
                // Branch: conversation is answered directly and skips the rest.
                <div className="mt-2 flex flex-col items-center text-muted lg:items-start lg:pl-5">
                  <span className="h-4 w-0.5 flow-line-y" aria-hidden />
                  <div className="flex items-center gap-1.5 rounded-lg border border-dashed border-line-strong px-2.5 py-1.5 text-[11.5px] text-fg-2">
                    <MessagesSquare className="size-3.5 text-violet" />
                    chat → replied directly
                  </div>
                </div>
              )}
              {stage.id === "agent" && (
                <div className="mt-2 flex flex-col items-center text-muted lg:items-start lg:pl-5">
                  <span className="h-4 w-0.5 flow-line-y" aria-hidden />
                  <div className="flex items-center gap-1.5 rounded-lg border border-dashed border-line-strong px-2.5 py-1.5 text-[11.5px] text-fg-2">
                    <Repeat className="size-3.5 text-accent" />
                    repeats until confident or out of steps
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-line bg-surface-2/60 p-4" aria-live="polite">
        <div className="flex items-center gap-2">
          <span className={cn("grid size-6 place-items-center rounded-md [&_svg]:size-3.5", tone.icon)}><active.icon /></span>
          <span className="text-[13px] font-semibold text-fg">Step {active.step} · {active.title}</span>
          <span className="ml-auto text-[11.5px] text-muted">Click a step to see what happens</span>
        </div>
        <p className="mt-2 text-[13.5px] text-fg-2">{active.what}</p>
        <ul className="mt-2 space-y-1">
          {active.details.map((detail) => (
            <li key={detail} className="flex gap-2 text-[13px] text-fg-2">
              <span className={cn("mt-2 size-1.5 shrink-0 rounded-full", tone.dot)} />
              {detail}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
