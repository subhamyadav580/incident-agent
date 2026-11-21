import { Plug, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useConnectors, useConnectorTypes, useSaveConnector } from "@/api/hooks";
import type { Connector, ConnectorType } from "@/api/types";
import { PageBody, PageHeader } from "@/components/layout/PageHeader";
import { HealthIndicator, TypeLogo, useHealthState } from "@/components/status";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Field";
import { Alert, EmptyState, Spinner } from "@/components/ui/Feedback";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { ConnectorDialog } from "./ConnectorDialog";

function Row({ connector, type, onEdit }: { connector: Connector; type?: ConnectorType; onEdit: () => void }) {
  const save = useSaveConnector();
  const health = useHealthState(connector);
  return (
    <tr className="hover:bg-hover">
      <td className="px-pad py-row">
        <div className="flex items-center gap-3">
          <TypeLogo type={connector.type} />
          <div className="min-w-0">
            <div className="font-medium text-fg">{connector.name}</div>
            <div className="text-[12px] text-muted">{type?.label ?? connector.type}</div>
          </div>
        </div>
      </td>
      <td className="max-w-0 px-pad py-row">
        {/* Connection details (host, user, database) are only shown in the edit panel. */}
        <div className="truncate text-[13px] text-fg-2" title={String(connector.settings.description ?? "")}>
          {connector.settings.description ? String(connector.settings.description) : <span className="text-muted">—</span>}
        </div>
      </td>
      <td className="px-pad py-row"><HealthIndicator connector={connector} /></td>
      <td className="px-pad py-row">
        <Switch label={`Enable ${connector.name}`} checked={connector.enabled} disabled={save.isPending}
          onChange={(enabled) => save.mutate({ id: connector.id, body: { enabled } }, { onError: (error) => alert(error.message) })} />
      </td>
      <td className="px-pad py-row text-right whitespace-nowrap">
        <Button size="sm" variant="ghost" aria-label="Re-check" disabled={!connector.enabled} onClick={() => health.refetch()}>
          <RefreshCw className={health.isFetching ? "animate-spin" : undefined} />
        </Button>
        <Button size="sm" onClick={onEdit}>Edit</Button>
      </td>
    </tr>
  );
}

export function ConnectorsPage() {
  const { data: types = [] } = useConnectorTypes();
  const { data: connectors = [], isLoading, error } = useConnectors();
  const [editing, setEditing] = useState<{ type: ConnectorType; connector?: Connector } | null>(null);
  const [newType, setNewType] = useState("");
  const typeByName = (name: string) => types.find((type) => type.type === name);

  const addMenu = (
    <div className="flex items-center gap-2">
      <select value={newType || types[0]?.type || ""} onChange={(e) => setNewType(e.target.value)} aria-label="Connector type"
        className="h-9 rounded-md border border-line-strong bg-surface-2 px-2.5 text-[13px] text-fg">
        {types.map((type) => <option key={type.type} value={type.type}>{type.label}</option>)}
      </select>
      <Button variant="primary" disabled={!types.length} onClick={() => {
        const type = typeByName(newType || types[0]?.type);
        if (type) setEditing({ type });
      }}>
        <Plus /> Add connector
      </Button>
    </div>
  );

  return (
    <>
      <PageHeader title="Connectors" subtitle="Data sources the agent can query" actions={addMenu} />
      <PageBody>
        {error && <Alert tone="err">{(error as Error).message}</Alert>}
        <div className="grid gap-4 md:grid-cols-2">
          {types.map((type) => (
            <Panel key={type.type} className="flex items-start gap-3 p-pad">
              <TypeLogo type={type.type} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-fg">{type.label}</div>
                <div className="text-[12.5px] text-muted">{type.description}</div>
              </div>
              <Button size="sm" onClick={() => setEditing({ type })}><Plus /> Add</Button>
            </Panel>
          ))}
        </div>
        <Panel>
          <PanelHeader title="Configured" icon={<Plug />}>
            <span className="text-[12px] text-muted">Credentials are encrypted in the app database and never shown again.</span>
          </PanelHeader>
          {isLoading ? (
            <div className="grid place-items-center p-8"><Spinner /></div>
          ) : connectors.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead>
                  <tr className="border-b border-line text-[11px] font-semibold tracking-wider text-muted uppercase">
                    <th className="px-pad py-2.5">Connector</th>
                    <th className="px-pad py-2.5">Description</th>
                    <th className="w-48 px-pad py-2.5">Status</th>
                    <th className="w-24 px-pad py-2.5">Enabled</th>
                    <th className="w-32 px-pad py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {connectors.map((connector) => (
                    <Row key={connector.id} connector={connector} type={typeByName(connector.type)}
                      onEdit={() => { const type = typeByName(connector.type); if (type) setEditing({ type, connector }); }} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={<Plug />} title="Connect your first data source">
              Add a PostgreSQL database or an Elasticsearch cluster. The agent searches them when you investigate.
            </EmptyState>
          )}
        </Panel>
      </PageBody>
      {editing && <ConnectorDialog type={editing.type} connector={editing.connector} onClose={() => setEditing(null)} />}
    </>
  );
}
