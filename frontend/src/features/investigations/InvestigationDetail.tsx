import { AlertTriangle, Check, Copy, FileText, ListChecks, MessageSquare, Target, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useDeleteInvestigation, useInvestigation } from "@/api/hooks";
import type { Investigation } from "@/api/types";
import { IntentBadge, RunStatusBadge } from "@/components/status";
import { Button } from "@/components/ui/Button";
import { Alert, Spinner } from "@/components/ui/Feedback";
import { Markdown } from "@/components/ui/Markdown";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { Tabs } from "@/components/ui/Tabs";
import { formatDateTime, formatDuration } from "@/lib/format";
import { isStructuredReport, splitReport } from "@/lib/report";
import { parseTimeline } from "@/lib/timeline";
import { CodePanel, evidenceCount, RecordsPanel, ServicesTable, TracesPanel } from "./Evidence";
import { TimelinePanel } from "./Timeline";
import { WorkflowPanel } from "./Workflow";

type Tab = "overview" | "evidence" | "timeline" | "workflow" | "report";

function Header({ investigation }: { investigation: Investigation }) {
  const remove = useDeleteInvestigation();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  return (
    <Panel>
      <PanelBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <IntentBadge intent={investigation.intent} />
          <RunStatusBadge status={investigation.status} />
          <span className="text-[12.5px] text-muted">
            {formatDateTime(investigation.created_at)} · {formatDuration(investigation.duration_ms)} · {investigation.steps} model step{investigation.steps === 1 ? "" : "s"}
            {investigation.connectors.length > 0 && ` · ${investigation.connectors.join(", ")}`}
          </span>
          <span className="ml-auto flex gap-1">
            <Button variant="ghost" size="sm" onClick={async () => {
              await navigator.clipboard?.writeText(investigation.report);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}>
              {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy report"}
            </Button>
            <Button variant="ghost" size="sm" aria-label="Delete investigation" loading={remove.isPending} onClick={() => {
              if (confirm("Delete this investigation from history?")) remove.mutate(investigation.id, { onSuccess: () => navigate("/investigations") });
            }}>
              <Trash2 />
            </Button>
          </span>
        </div>
        <pre className="max-h-44 overflow-y-auto rounded-md border border-line bg-surface-2 px-3 py-2.5 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap break-words text-fg">
          {investigation.message}
        </pre>
      </PanelBody>
    </Panel>
  );
}

function Section({ title, icon, tone, accent, children }: { title: string; icon: React.ReactNode; tone?: "accent" | "violet" | "warn" | "ok"; accent?: string; children: string }) {
  return (
    <Panel className={accent}>
      <PanelHeader title={title} icon={icon} tone={tone} />
      <PanelBody><Markdown>{children}</Markdown></PanelBody>
    </Panel>
  );
}

export function InvestigationDetail({ id }: { id: string }) {
  const { data: investigation, isLoading, error } = useInvestigation(id);
  const [tab, setTab] = useState<Tab>("overview");
  const sections = useMemo(() => splitReport(investigation?.report ?? ""), [investigation?.report]);

  if (isLoading) return <Panel className="flex items-center gap-3 p-pad"><Spinner /> Loading investigation…</Panel>;
  if (error || !investigation) return <Alert tone="err">{(error as Error | null)?.message ?? "Not found"}</Alert>;

  const structured = isStructuredReport(sections);
  const evidence = investigation.evidence ?? {};
  const timelineCount = sections.timeline ? parseTimeline(sections.timeline).length : 0;
  const extra = Object.entries(sections).filter(([name]) => !["summary", "root cause", "timeline", "evidence gaps", "intro"].includes(name));

  const tabs = [
    { id: "overview" as const, label: structured ? "Overview" : "Answer" },
    { id: "evidence" as const, label: "Evidence", count: evidenceCount(evidence) },
    ...(structured ? [{ id: "timeline" as const, label: "Timeline", count: timelineCount }] : []),
    { id: "workflow" as const, label: "Workflow", count: investigation.trace?.length || undefined },
    { id: "report" as const, label: "Report" },
  ];

  return (
    <div className="space-y-4">
      <Header investigation={investigation} />
      {investigation.status === "failed" && <Alert tone="err">{investigation.error || "Investigation failed."}</Alert>}
      <Tabs items={tabs} value={tab} onChange={setTab} />

      {tab === "overview" && (structured ? (
        <div className="space-y-4">
          {sections.summary && (
            <Panel>
              <PanelHeader title="Summary" icon={<FileText />} />
              <PanelBody><Markdown className="text-[15px] text-fg">{sections.summary}</Markdown></PanelBody>
            </Panel>
          )}
          {sections["root cause"] && <Section title="Root cause" icon={<Target />} tone="violet" accent="border-l-3 border-l-violet">{sections["root cause"]}</Section>}
          <ServicesTable evidence={evidence} limit={5} />
          <CodePanel evidence={evidence} limit={3} />
          <RecordsPanel evidence={evidence} />
          {sections["evidence gaps"] && <Section title="Evidence gaps" icon={<AlertTriangle />} tone="warn" accent="border-l-3 border-l-warn">{sections["evidence gaps"]}</Section>}
          {extra.map(([name, body]) => <Section key={name} title={name.replace(/^./, (c) => c.toUpperCase())} icon={<ListChecks />}>{body}</Section>)}
        </div>
      ) : (
        <div className="space-y-4">
          <Section title={investigation.intent === "data_question" ? "Answer" : "Reply"} icon={<MessageSquare />} tone={investigation.intent === "conversation" ? "violet" : "accent"}>
            {investigation.report || "_No reply._"}
          </Section>
          <RecordsPanel evidence={evidence} />
        </div>
      ))}

      {tab === "evidence" && (
        evidenceCount(evidence) ? (
          <div className="space-y-4">
            <ServicesTable evidence={evidence} />
            <CodePanel evidence={evidence} />
            <TracesPanel evidence={evidence} />
            <RecordsPanel evidence={evidence} />
          </div>
        ) : (
          <Panel className="p-pad text-[13px] text-muted">No evidence was gathered automatically for this message.</Panel>
        )
      )}

      {tab === "timeline" && sections.timeline && <TimelinePanel markdown={sections.timeline} />}

      {tab === "workflow" && <WorkflowPanel investigation={investigation} />}

      {tab === "report" && (
        <Panel>
          <PanelHeader title="Full report" icon={<FileText />} />
          <PanelBody><Markdown>{investigation.report || "_Empty report._"}</Markdown></PanelBody>
        </Panel>
      )}
    </div>
  );
}
