import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-line bg-surface", className)} {...props} />;
}

const iconTones = {
  accent: "bg-accent-soft text-accent",
  violet: "bg-violet-soft text-violet",
  warn: "bg-warn-soft text-warn",
  ok: "bg-ok-soft text-ok",
  err: "bg-err-soft text-err",
} as const;

export function PanelHeader({ title, icon, tone = "accent", children, className }: {
  title: ReactNode;
  icon?: ReactNode;
  tone?: keyof typeof iconTones;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-12 items-center gap-2.5 border-b border-line px-pad py-2.5", className)}>
      {icon && <span className={cn("grid size-6.5 shrink-0 place-items-center rounded-md [&_svg]:size-3.5", iconTones[tone])}>{icon}</span>}
      <h2 className="text-[13px] font-semibold whitespace-nowrap text-fg">{title}</h2>
      {children}
    </div>
  );
}

export function PanelBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-pad", className)} {...props} />;
}
