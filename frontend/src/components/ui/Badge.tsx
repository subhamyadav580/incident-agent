import type { ReactNode } from "react";
import type { Tone } from "@/lib/intents";
import { cn } from "./cn";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-fg-2 ring-1 ring-inset ring-line",
  accent: "bg-accent-soft text-accent",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  err: "bg-err-soft text-err",
  violet: "bg-violet-soft text-violet",
};

export function Badge({ tone = "neutral", icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium [&_svg]:size-3", tones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}
