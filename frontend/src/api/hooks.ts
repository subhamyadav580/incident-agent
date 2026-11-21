import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type {
  CatalogColumn,
  CatalogObject,
  Connector,
  ConnectorTestResult,
  ConnectorType,
  ConnectorWrite,
  Investigation,
  InvestigationSummary,
  Overview,
  SettingsOut,
  SettingsUpdate,
} from "./types";

export const keys = {
  types: ["connector-types"] as const,
  connectors: ["connectors"] as const,
  health: (id: number) => ["connector-health", id] as const,
  overview: ["overview"] as const,
  investigations: ["investigations"] as const,
  investigation: (id: string) => ["investigation", id] as const,
  settings: ["settings"] as const,
};

// ---- connectors ----------------------------------------------------------

export const useConnectorTypes = () =>
  useQuery({ queryKey: keys.types, queryFn: () => api<ConnectorType[]>("GET", "/api/connector-types"), staleTime: Infinity });

export const useConnectors = () =>
  useQuery({ queryKey: keys.connectors, queryFn: () => api<Connector[]>("GET", "/api/connectors") });

/** Connection check of a stored connector; cached for a minute. */
export const useConnectorHealth = (connector: Connector) => useQuery(healthQuery(connector));

const healthQuery = (connector: Connector) => ({
  queryKey: keys.health(connector.id),
  queryFn: () => api<ConnectorTestResult>("GET", `/api/connectors/${connector.id}/health`),
  enabled: connector.enabled,
  staleTime: 60_000,
  retry: false,
});

/** Health of several connectors at once (shares the cache with useConnectorHealth). */
export const useConnectorsHealth = (connectors: Connector[]) =>
  useQueries({ queries: connectors.map(healthQuery) });

export function useSaveConnector() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: ConnectorWrite }) =>
      id === undefined ? api<Connector>("POST", "/api/connectors", body) : api<Connector>("PATCH", `/api/connectors/${id}`, body),
    onSuccess: (connector) => {
      client.invalidateQueries({ queryKey: keys.connectors });
      client.invalidateQueries({ queryKey: keys.health(connector.id) });
    },
  });
}

export function useDeleteConnector() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>("DELETE", `/api/connectors/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.connectors }),
  });
}

export const useTestConnector = () =>
  useMutation({
    mutationFn: (body: ConnectorWrite & { id?: number; type: string }) =>
      api<ConnectorTestResult>("POST", "/api/connectors/test", body),
  });

export type CatalogRequest = ConnectorWrite & { id?: number; type: string };

/** Tables / index groups of a (possibly unsaved) connector. */
export const useCatalogList = () =>
  useMutation({
    mutationFn: (body: CatalogRequest) =>
      api<{ objects: CatalogObject[]; truncated: boolean }>("POST", "/api/connectors/catalog", body),
  });

export const describeCatalogObject = (body: CatalogRequest & { object: string }) =>
  api<{ name: string; columns: CatalogColumn[] }>("POST", "/api/connectors/catalog/describe", body);

// ---- investigations -------------------------------------------------------

export const useOverview = () =>
  useQuery({ queryKey: keys.overview, queryFn: () => api<Overview>("GET", "/api/overview"), refetchInterval: 30_000 });

export const useInvestigations = () =>
  useQuery({
    queryKey: keys.investigations,
    queryFn: () => api<InvestigationSummary[]>("GET", "/api/investigations?limit=200"),
  });

export const useInvestigation = (id: string | undefined) =>
  useQuery({
    queryKey: keys.investigation(id ?? ""),
    queryFn: () => api<Investigation>("GET", `/api/investigations/${id}`),
    enabled: Boolean(id),
  });

export function useDeleteInvestigation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>("DELETE", `/api/investigations/${id}`),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.investigations });
      client.invalidateQueries({ queryKey: keys.overview });
    },
  });
}

// ---- settings ---------------------------------------------------------------

export const useSettings = () =>
  useQuery({ queryKey: keys.settings, queryFn: () => api<SettingsOut>("GET", "/api/settings") });

export function useSaveSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: SettingsUpdate) => api<SettingsOut>("PUT", "/api/settings", body),
    onSuccess: (settings) => client.setQueryData(keys.settings, settings),
  });
}
