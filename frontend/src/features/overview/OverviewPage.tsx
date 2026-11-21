import { AlertTriangle, Clock3, Database, History, Plug, Search } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { useConnectors, useConnectorsHealth, useOverview } from "@/api/hooks";
import type { Connector } from "@/api/types";
import { PageBody, PageHeader } from "@/components/layout/PageHeader";
import { HealthIndicator, IntentBadge, RunStatusBadge, TypeLogo, typeLabel } from "@/components/status";
import { ButtonLink } from "@/components/ui/Button";
import { HourlyBars } from "@/components/ui/Charts";
import { Alert, EmptyState, Spinner } from "@/components/ui/Feedback";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { cn } from "@/components/ui/cn";
import { formatDateTime, formatDuration, formatNumber, timeAgo } from "@/lib/format";
import { intentMeta } from "@/lib/intents";

function Kpi({ label, icon, value, sub, tone }: { label: string; icon: ReactNode; value: ReactNode; sub?: ReactNode; tone?: "err" }) {
  return (
    <Panel className="p-pad">
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-muted [&_svg]:size-3.5">{icon}{label}</div>
      <div className={cn("mt-1.5 text-[26px] font-semibold tracking-tight tabular-nums", tone === "err" ? "text-err" : "text-fg")}>{value}</div>
      <div className="mt-0.5 truncate text-[12px] text-muted">{sub ?? " "}</div>
    </Panel>
  );
}

function HealthyCount({ connectors }: { connectors: Connector[] }) {
  const enabled = connectors.filter((c) => c.enabled);
  const results = useConnectorsHealth(enabled);
  const healthy = results.filter((r) => r.data?.ok).length;
  const checking = results.some((r) => r.isFetching && !r.data);
  const unreachable = results.filter((r) => r.data && !r.data.ok).length + results.filter((r) => r.error).length;
  return (
    <Kpi
      label="Healthy connectors"
      icon={<Plug />}
      value={enabled.length ? `${healthy}/${enabled.length}` : "0"}
      tone={unreachable ? "err" : undefined}
      sub={!enabled.length ? "no connector enabled" : checking ? "checking…" : unreachable ? `${unreachable} unreachable` : "all reachable"}
    />
  );
}

function ConnectorHealthPanel({ connectors }: { connectors: Connector[] }) {
  return (
    <Panel>
      <PanelHeader title="Connector health" icon={<Database />} tone="ok">
        <ButtonLink to="/connectors" variant="ghost" size="sm" className="ml-auto">Manage</ButtonLink>
      </PanelHeader>
      {connectors.length ? (
        <ul className="divide-y divide-line">
          {connectors.map((connector) => (
            <li key={connector.id} className="flex items-center gap-3 px-pad py-row">
              <TypeLogo type={connector.type} size={28} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-fg">{connector.name}</div>
                <div className="text-[12px] text-muted">{typeLabel(connector.type)}</div>
              </div>
              <HealthIndicator connector={connector} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<Plug />} title="No data sources">
          <Link to="/connectors" className="text-accent">Add PostgreSQL or Elasticsearch</Link>
        </EmptyState>
      )}
    </Panel>
  );
}

export function OverviewPage() {
  const overview = useOverview();
  const { data: connectors = [] } = useConnectors();
  const navigate = useNavigate();
  const data = overview.data;
  const intents = Object.entries(data?.by_intent_24h ?? {});
  const totalIntents = intents.reduce((sum, [, count]) => sum + count, 0);

  return (
    <>
      <PageHeader title="Overview" subtitle="Last 24 hours" />
      <PageBody>
        {overview.error && <Alert tone="err">{(overview.error as Error).message}</Alert>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Investigations" icon={<Search />} value={data ? formatNumber(data.investigations_24h) : <Spinner />}
            sub={data && (data.investigations_24h ? `${data.by_intent_24h.investigation ?? 0} incidents investigated` : "nothing yet today")} />
          <Kpi label="Failed runs" icon={<AlertTriangle />} value={data ? formatNumber(data.failed_24h) : "–"} tone={data?.failed_24h ? "err" : undefined}
            sub={data?.investigations_24h ? `${Math.round((100 * data.failed_24h) / data.investigations_24h)}% of runs` : undefined} />
          <Kpi label="Avg time to answer" icon={<Clock3 />} value={formatDuration(data?.avg_duration_ms_24h)} sub="per investigation" />
          <HealthyCount connectors={connectors} />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Panel>
            <PanelHeader title="Investigations per hour" icon={<History />}>
              <span className="ml-auto flex items-center gap-3 text-[12px] text-muted">
                <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-chart" />Completed</span>
                <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-err" />Failed</span>
              </span>
            </PanelHeader>
            <PanelBody>
              {data ? <HourlyBars buckets={data.per_hour_24h} /> : <div className="h-32" />}
              <div className="mt-5">
                <div className="mb-2 text-[12px] font-medium text-muted">Messages by intent</div>
                <div className="flex h-2 overflow-hidden rounded-full bg-surface-2">
                  {intents.map(([intent, count]) => (
                    <span key={intent} style={{ width: `${(100 * count) / totalIntents}%`, background: intentMeta(intent).color }} title={`${intentMeta(intent).label}: ${count}`} />
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-fg-2">
                  {totalIntents ? intents.map(([intent, count]) => (
                    <span key={intent} className="flex items-center gap-1.5">
                      <i className="size-2.5 rounded-sm" style={{ background: intentMeta(intent).color }} />
                      {intentMeta(intent).label} · {count}
                    </span>
                  )) : <span className="text-muted">No messages in the last 24 hours.</span>}
                </div>
              </div>
            </PanelBody>
          </Panel>
          <ConnectorHealthPanel connectors={connectors} />
        </div>

        <Panel>
          <PanelHeader title="Recent investigations" icon={<Search />}>
            <ButtonLink to="/investigations" variant="ghost" size="sm" className="ml-auto">View all</ButtonLink>
          </PanelHeader>
          {!data ? (
            <SkeletonRows rows={4} />
          ) : data.recent.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left">
                <thead>
                  <tr className="border-b border-line text-[11px] font-semibold tracking-wider text-muted uppercase">
                    <th className="w-28 px-pad py-2.5">When</th>
                    <th className="px-pad py-2.5">Message</th>
                    <th className="w-36 px-pad py-2.5">Intent</th>
                    <th className="w-24 px-pad py-2.5 text-right">Time</th>
                    <th className="w-32 px-pad py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.recent.map((item) => (
                    <tr key={item.id} className="cursor-pointer hover:bg-hover" onClick={() => navigate(`/investigations/${item.id}`)}>
                      <td className="px-pad py-row text-[12.5px] text-muted" title={formatDateTime(item.created_at)}>{timeAgo(item.created_at)}</td>
                      <td className="max-w-0 px-pad py-row">
                        <Link to={`/investigations/${item.id}`} className="block truncate font-mono text-[12.5px] text-fg" onClick={(e) => e.stopPropagation()}>{item.message}</Link>
                        {item.headline && <div className="truncate text-[12.5px] text-muted">{item.headline}</div>}
                      </td>
                      <td className="px-pad py-row"><IntentBadge intent={item.intent} /></td>
                      <td className="px-pad py-row text-right tabular-nums">{formatDuration(item.duration_ms)}</td>
                      <td className="px-pad py-row"><RunStatusBadge status={item.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={<Search />} title="No investigations yet">
              <Link to="/investigations" className="text-accent">Start your first investigation</Link>
            </EmptyState>
          )}
        </Panel>
      </PageBody>
    </>
  );
}
