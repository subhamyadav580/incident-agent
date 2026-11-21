import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "./cn";

export const Spinner = ({ className }: { className?: string }) => (
  <span className={cn("inline-block size-4 animate-spin rounded-full border-2 border-line-strong border-t-accent", className)} />
);

export function Alert({ tone, children }: { tone: "ok" | "err" | "info"; children: ReactNode }) {
  const styles = { ok: "bg-ok-soft text-ok", err: "bg-err-soft text-err", info: "bg-accent-soft text-accent" }[tone];
  const Icon = tone === "ok" ? CheckCircle2 : AlertTriangle;
  return (
    <div role={tone === "err" ? "alert" : "status"} className={cn("flex items-start gap-2 rounded-md px-3 py-2 text-[13px]", styles)}>
      {tone !== "info" && <Icon className="mt-0.5 size-4 shrink-0" />}
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {icon && <div className="mb-3 grid size-10 place-items-center rounded-full bg-surface-2 text-muted [&_svg]:size-5">{icon}</div>}
      <div className="text-[14px] font-semibold text-fg">{title}</div>
      {children && <div className="mt-1 max-w-md text-[13px] text-muted">{children}</div>}
    </div>
  );
}

export const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="rounded border border-line-strong bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted">{children}</kbd>
);
