import type { ReactNode } from "react";
import { cn } from "./cn";

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  count?: number;
}

export function Tabs<T extends string>({ items, value, onChange }: { items: TabItem<T>[]; value: T; onChange: (id: T) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">
      {items.map((item) => (
        <button
          key={item.id}
          role="tab"
          type="button"
          aria-selected={value === item.id}
          onClick={() => onChange(item.id)}
          className={cn(
            "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors",
            value === item.id ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg",
          )}
        >
          {item.label}
          {item.count !== undefined && (
            <span className="rounded-full bg-surface-2 px-1.5 text-[11px] text-muted ring-1 ring-line">{item.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
