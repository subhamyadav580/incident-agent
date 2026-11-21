import { ArrowRight, Check, CheckCircle2, Circle, Plug, Search, Settings, Sparkles, Table2 } from "lucide-react";
import type { ReactNode } from "react";
import { useConnectors, useConnectorTypes, useOverview, useSettings } from "@/api/hooks";
import type { Connector } from "@/api/types";
import { PageBody } from "@/components/layout/PageHeader";
import { TypeLogo } from "@/components/status";
import { ButtonLink } from "@/components/ui/Button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { cn } from "@/components/ui/cn";
import { formatDuration } from "@/lib/format";
import { AgentFlow } from "./AgentFlow";

const described = (connector: Connector) => {
  const catalog = connector.settings.tables ?? connector.settings.index_groups;
  return Boolean(catalog && typeof catalog === "object" && Object.keys(catalog).length) || connector.type === "git";
};

function ChecklistItem({ done, title, children, to, action }: { done: boolean; title: string; children: ReactNode; to: string; action: string }) {
  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      {done ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" aria-label="done" /> : <Circle className="mt-0.5 size-5 shrink-0 text-line-strong" aria-label="to do" />}
      <div className="min-w-0 flex-1">
        <div className={cn("text-[13.5px] font-medium", done ? "text-muted" : "text-fg")}>{title}</div>
        <div className="text-[12.5px] text-muted">{children}</div>
      </div>
      {!done && <ButtonLink to={to} size="sm">{action}</ButtonLink>}
    </li>
  );
}

export function HomePage() {
  const { data: connectors = [] } = useConnectors();
  const { data: types = [] } = useConnectorTypes();
  const { data: overview } = useOverview();
  const { data: settings } = useSettings();

  const enabled = connectors.filter((c) => c.enabled);
  const steps = [
    { done: enabled.length > 0, title: "Connect a data source", body: "PostgreSQL, Elasticsearch or a Git repository. Credentials are encrypted.", to: "/connectors", action: "Add" },
    { done: connectors.some(described), title: "Describe your data (optional)", body: "Pick the important tables and log groups so the agent looks there first.", to: "/connectors", action: "Describe" },
    { done: Boolean(settings && (settings.model_api_key_set || settings.extra_instructions.trim())), title: "Set the model and team instructions", body: "Choose a model, add an API key, and tell the agent your ids, status codes and service map.", to: "/settings", action: "Settings" },
    { done: Boolean(overview?.recent.length), title: "Run your first investigation", body: "Paste an error message or a failing id.", to: "/investigations", action: "Start" },
  ];
  const completed = steps.filter((step) => step.done).length;

  return (
    <PageBody>
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-line bg-surface px-6 py-10 sm:px-10">
        <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-accent/15 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 size-72 rounded-full bg-violet/10 blur-3xl" aria-hidden />
        <div className="relative max-w-3xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[12px] font-medium text-accent">
            <Sparkles className="size-3.5" /> AI incident investigation
          </span>
          <h1 className="mt-4 text-[30px] leading-tight font-bold tracking-tight text-fg sm:text-[36px]">
            From an error message to its root cause, with the evidence.
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] text-fg-2">
            Paste an error, a failing id or a question. The agent searches your logs, databases and code,
            follows the affected request across services and explains what happened — and what it couldn't verify.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <ButtonLink to="/investigations" variant="primary"><Search /> Start an investigation</ButtonLink>
            <ButtonLink to="/connectors"><Plug /> Connect a data source</ButtonLink>
          </div>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[12.5px] text-muted">
            <span><b className="text-fg">{enabled.length}</b> data source{enabled.length === 1 ? "" : "s"} connected</span>
            <span><b className="text-fg">{overview?.investigations_24h ?? 0}</b> investigations today</span>
            {overview?.avg_duration_ms_24h != null && <span><b className="text-fg">{formatDuration(overview.avg_duration_ms_24h)}</b> average time to answer</span>}
          </div>
        </div>
      </section>

      {/* How it works */}
      <Panel>
        <PanelHeader title="How it works" icon={<Sparkles />} tone="violet">
          <span className="ml-auto hidden text-[12px] text-muted sm:inline">From message to report in five steps</span>
        </PanelHeader>
        <PanelBody><AgentFlow /></PanelBody>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        {/* Getting started */}
        <Panel>
          <PanelHeader title="Getting started" icon={<Check />} tone="ok">
            <span className="ml-auto text-[12px] text-muted">{completed} of {steps.length} done</span>
          </PanelHeader>
          <PanelBody>
            <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-ok transition-all" style={{ width: `${(completed / steps.length) * 100}%` }} />
            </div>
            <ol className="divide-y divide-line">
              {steps.map((step) => (
                <ChecklistItem key={step.title} done={step.done} title={step.title} to={step.to} action={step.action}>{step.body}</ChecklistItem>
              ))}
            </ol>
          </PanelBody>
        </Panel>

        {/* Data sources */}
        <Panel>
          <PanelHeader title="Data sources" icon={<Table2 />}>
            <ButtonLink to="/connectors" variant="ghost" size="sm" className="ml-auto">Manage <ArrowRight /></ButtonLink>
          </PanelHeader>
          <ul className="divide-y divide-line">
            {types.map((type) => {
              const count = connectors.filter((c) => c.type === type.type && c.enabled).length;
              return (
                <li key={type.type} className="flex items-center gap-3 px-pad py-row">
                  <TypeLogo type={type.type} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-fg">{type.label}</div>
                    <div className="truncate text-[12px] text-muted">{type.description}</div>
                  </div>
                  {count ? (
                    <span className="inline-flex items-center gap-1 text-[12.5px] text-ok"><CheckCircle2 className="size-4" /> {count} connected</span>
                  ) : (
                    <ButtonLink to="/connectors" size="sm">Add</ButtonLink>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="border-t border-line px-pad py-3 text-[12px] text-muted">
            <Settings className="mr-1 inline size-3.5 align-[-2px]" />
            New source types plug in as connectors; see the README.
          </div>
        </Panel>
      </div>
    </PageBody>
  );
}
