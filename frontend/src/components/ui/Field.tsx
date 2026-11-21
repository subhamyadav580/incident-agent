import type { ComponentProps, InputHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export const controlClass =
  "w-full rounded-md border border-line-strong bg-surface-2 px-3 py-2 text-[13.5px] text-fg placeholder:text-muted " +
  "outline-none transition focus:border-accent focus:ring-3 focus:ring-accent-soft";

export function Field({ label, help, required, children }: { label: ReactNode; help?: ReactNode; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-semibold text-fg-2">
        {label}
        {required && <span className="text-err"> *</span>}
      </span>
      {children}
      {help && <span className="mt-1.5 block text-xs whitespace-pre-wrap text-muted">{help}</span>}
    </label>
  );
}

export const Input = ({ className, ...props }: ComponentProps<"input">) => (
  <input className={cn(controlClass, className)} {...props} />
);

export const TextArea = ({ className, ...props }: ComponentProps<"textarea">) => (
  <textarea className={cn(controlClass, "resize-y", className)} {...props} />
);

export const Select = ({ className, ...props }: ComponentProps<"select">) => (
  <select className={cn(controlClass, "pr-8", className)} {...props} />
);

export function Checkbox({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-fg-2">
      <input type="checkbox" className="check" {...props} />
      {label}
    </label>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-ok" : "bg-line-strong",
      )}
    >
      <span className={cn("size-3.5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-4.5" : "translate-x-0.75")} />
    </button>
  );
}
