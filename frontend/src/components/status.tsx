import { CheckCircle2, CircleDashed, CircleOff, Loader2, XCircle } from "lucide-react";
import { useConnectorHealth } from "@/api/hooks";
import type { Connector } from "@/api/types";
import { formatDuration } from "@/lib/format";
import { intentMeta } from "@/lib/intents";
import { Badge } from "./ui/Badge";
import { cn } from "./ui/cn";

export const IntentBadge = ({ intent }: { intent: string | null | undefined }) => {
  const meta = intentMeta(intent);
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
};

export const RunStatusBadge = ({ status }: { status: "completed" | "failed" }) =>
  status === "failed" ? (
    <Badge tone="err" icon={<XCircle />}>Failed</Badge>
  ) : (
    <Badge tone="ok" icon={<CheckCircle2 />}>Completed</Badge>
  );

export type HealthState = "ok" | "err" | "pending" | "off";

export function useHealthState(connector: Connector) {
  const health = useConnectorHealth(connector);
  const state: HealthState = !connector.enabled
    ? "off"
    : health.isFetching && !health.data
      ? "pending"
      : health.data?.ok
        ? "ok"
        : health.data || health.error
          ? "err"
          : "pending";
  const message = !connector.enabled ? "Disabled" : health.data?.message ?? (health.error as Error | null)?.message ?? "Checking…";
  return { state, message, latency: health.data?.latency_ms ?? null, refetch: health.refetch, isFetching: health.isFetching };
}

/** Status shown as icon + label + color (never color alone). */
export function HealthIndicator({ connector, compact }: { connector: Connector; compact?: boolean }) {
  const { state, message, latency } = useHealthState(connector);
  const config = {
    ok: { icon: CheckCircle2, label: `Healthy${latency != null ? ` · ${formatDuration(latency)}` : ""}`, cls: "text-ok" },
    err: { icon: XCircle, label: "Unreachable", cls: "text-err" },
    pending: { icon: Loader2, label: "Checking…", cls: "text-warn" },
    off: { icon: CircleOff, label: "Disabled", cls: "text-muted" },
  }[state];
  const Icon = config.icon;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-[12.5px]", config.cls)} title={message}>
      <Icon className={cn("size-4 shrink-0", state === "pending" && "animate-spin")} />
      {!compact && <span className="truncate">{config.label}</span>}
    </span>
  );
}

const LOGOS: Record<string, { text: string; cls: string }> = {
  postgres: { text: "PG", cls: "bg-[#336791]/20 text-[#5f9ad3]" },
  elasticsearch: { text: "ES", cls: "bg-[#fec514]/15 text-[#d9a600] dark:text-[#f0b90b]" },
  git: { text: "GIT", cls: "bg-[#f05133]/15 text-[#e0472a] dark:text-[#ff6a4d]" },
};

const LABELS: Record<string, string> = { postgres: "PostgreSQL", elasticsearch: "Elasticsearch", git: "Git repository" };

/** Human label of a connector type, e.g. "PostgreSQL". */
export const typeLabel = (type: string) => LABELS[type] ?? type;

export function TypeLogo({ type, size = 34 }: { type: string; size?: number }) {
  const logo = LOGOS[type] ?? { text: type.slice(0, 2).toUpperCase(), cls: "bg-surface-2 text-fg-2" };
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-lg text-[10.5px] font-bold tracking-tight", logo.cls)} style={{ width: size, height: size }}>
      {logo.text}
    </span>
  );
}

export const NoDataIcon = CircleDashed;
