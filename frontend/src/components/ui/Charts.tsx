import { formatHour } from "@/lib/format";

/** Small trend line for per-hour counts. */
export function Sparkline({ points, width = 140, height = 30 }: { points: { t: string; count: number }[]; width?: number; height?: number }) {
  if (!points.length) return <span className="text-xs text-muted">–</span>;
  const max = Math.max(...points.map((p) => p.count), 1);
  const step = points.length > 1 ? width / (points.length - 1) : 0;
  const coords = points.map((p, i) => [points.length > 1 ? i * step : width / 2, height - 3 - (p.count / max) * (height - 6)]);
  const line = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} role="img" aria-label={`Trend, peak ${max} per hour`} className="block">
      <title>{points.map((p) => `${formatHour(p.t)}: ${p.count}`).join("\n")}</title>
      <polygon points={`0,${height} ${line} ${width},${height}`} fill="var(--chart-fill)" />
      <polyline points={line} fill="none" stroke="var(--chart)" strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

/** Stacked bars (ok + failed) per hour, with hour labels every 6 hours. */
export function HourlyBars({ buckets, height = 120 }: { buckets: { t: string; total: number; failed: number }[]; height?: number }) {
  const max = Math.max(...buckets.map((b) => b.total), 1);
  return (
    <div>
      <div className="flex items-end gap-[3px]" style={{ height }} role="img" aria-label="Investigations per hour over the last 24 hours">
        {buckets.map((bucket) => {
          const ok = bucket.total - bucket.failed;
          return (
            <div key={bucket.t} className="group relative flex h-full flex-1 flex-col justify-end" title={`${formatHour(bucket.t)} · ${bucket.total} runs${bucket.failed ? `, ${bucket.failed} failed` : ""}`}>
              {bucket.failed > 0 && <div className="rounded-t-sm bg-err" style={{ height: `${(bucket.failed / max) * 100}%` }} />}
              <div
                className={bucket.failed ? "bg-chart" : "rounded-t-sm bg-chart"}
                style={{ height: ok ? `${(ok / max) * 100}%` : bucket.total ? 0 : 2, opacity: ok ? 1 : 0.25 }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted">
        {buckets.filter((_, i) => i % 6 === 0).map((b) => <span key={b.t}>{formatHour(b.t)}</span>)}
        <span>now</span>
      </div>
    </div>
  );
}
