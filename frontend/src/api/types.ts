// Mirrors the Pydantic schemas in src/incident_agent/server/schemas/.

export type Intent = "conversation" | "investigation" | "data_question";

export interface FieldSpec {
  name: string;
  label: string;
  kind: "text" | "number" | "bool" | "select" | "textarea" | "password" | "catalog";
  required: boolean;
  default: unknown;
  options: string[] | null;
  help: string;
  secret: boolean;
  group: "main" | "advanced";
}

export interface ConnectorType {
  type: string;
  label: string;
  description: string;
  catalog_label: string;
  fields: FieldSpec[];
}

/** Optional notes on a PostgreSQL table (stored in the connector's `tables`). */
export interface TableConfig {
  description?: string;
  columns?: Record<string, string>;
  lookup?: { column: string; match: string }[];
  select?: string[];
}

/** Optional notes on an Elasticsearch index group (stored in `index_groups`). */
export interface IndexGroupConfig {
  description?: string;
  fields?: string[];
  search_fields?: string[];
  timestamp_field?: string;
}

export type Catalog = Record<string, TableConfig | IndexGroupConfig>;
export type SettingValue = string | number | boolean | Catalog;
export type Settings = Record<string, SettingValue>;

export interface CatalogObject {
  name: string;
  detail: string;
  comment: string;
}

export interface CatalogColumn {
  name: string;
  type: string;
  indexed: boolean;
  comment: string;
}

export interface Connector {
  id: number;
  name: string;
  type: string;
  enabled: boolean;
  settings: Settings;
  secrets_set: string[];
  created_at: string;
  updated_at: string;
}

export interface ConnectorWrite {
  name?: string;
  type?: string;
  enabled?: boolean;
  settings?: Settings;
  secrets?: Record<string, string | null>;
}

export interface ConnectorTestResult {
  ok: boolean;
  message: string;
  latency_ms: number | null;
}

export interface InvestigationSummary {
  id: string;
  message: string;
  headline: string;
  intent: Intent | null;
  status: "completed" | "failed";
  steps: number;
  duration_ms: number;
  created_at: string;
}

export interface ServiceEvidence {
  name: string;
  total: number | string | null;
  first_seen: string | null;
  last_seen: string | null;
  histogram: { t: string; count: number }[];
  patterns: { count: number; text: string }[];
  error: string | null;
}

export interface TraceEvidence {
  id: string;
  services: { name: string; total: number | null; error: string | null }[];
}

export interface RecordEvidence {
  database: string;
  table: string;
  where: Record<string, string>;
  rows: Record<string, unknown>[];
  error: string | null;
}

export interface Evidence {
  searched_for?: {
    identifiers?: string[];
    exceptions?: string[];
    phrases?: string[];
    traced_identifiers?: string[];
    relaxed_match?: boolean;
    discovered_groups?: Record<string, number>;
  };
  services?: ServiceEvidence[];
  traces?: TraceEvidence[];
  records?: RecordEvidence[];
}

export interface Investigation extends InvestigationSummary {
  report: string;
  error: string;
  connectors: string[];
  evidence: Evidence;
}

export interface Overview {
  investigations_24h: number;
  failed_24h: number;
  by_intent_24h: Record<string, number>;
  avg_duration_ms_24h: number | null;
  per_hour_24h: { t: string; total: number; failed: number }[];
  recent: InvestigationSummary[];
}

export interface AgentSettings {
  model_provider: string;
  model_name: string;
  router_enabled: boolean;
  router_model_name: string | null;
  max_steps: number;
  extra_instructions: string;
}

export interface SettingsOut extends AgentSettings {
  model_api_key_set: boolean;
  default_prompt: string;
}

export interface SettingsUpdate extends AgentSettings {
  model_api_key: string | null;
}
