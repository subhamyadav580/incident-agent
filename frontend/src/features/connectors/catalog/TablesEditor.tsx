import { KeyRound } from "lucide-react";
import { useCallback } from "react";
import type { CatalogRequest } from "@/api/hooks";
import type { TableConfig } from "@/api/types";
import { Badge } from "@/components/ui/Badge";
import { Input, Switch } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import { CatalogBrowser, ColumnsLoading } from "./CatalogBrowser";

export type Tables = Record<string, TableConfig>;

const isDescribed = (table?: TableConfig) =>
  Boolean(table && (table.description || Object.keys(table.columns ?? {}).length || table.lookup?.length || table.select?.length));

/** PostgreSQL: describe tables and columns, pick lookup columns and returned columns. */
export function TablesEditor({ value, onChange, request }: { value: Tables; onChange: (value: Tables) => void; request: () => CatalogRequest }) {
  const update = (table: string, change: (current: TableConfig) => TableConfig) =>
    onChange({ ...value, [table]: change(value[table] ?? {}) });
  const described = useCallback((name: string) => isDescribed(value[name]), [value]);

  return (
    <CatalogBrowser
      request={request}
      noun={{ one: "table", many: "tables" }}
      isDescribed={described}
      describedCount={Object.values(value).filter(isDescribed).length}
      renderSummary={(object) => (
        <Input
          value={value[object.name]?.description ?? ""}
          onChange={(e) => update(object.name, (t) => ({ ...t, description: e.target.value }))}
          placeholder={object.comment || "What this table holds (optional)"}
          className="py-1.5 text-[13px]"
          aria-label={`Description of ${object.name}`}
        />
      )}
      renderColumns={({ object, columns, columnsError }) => {
        if (!columns) return <ColumnsLoading error={columnsError} />;
        const table = value[object.name] ?? {};
        const lookups = table.lookup ?? [];
        const select = table.select ?? [];
        return (
          <div className="space-y-2">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[12.5px]">
                <thead>
                  <tr className="text-[10.5px] font-semibold tracking-wider text-muted uppercase">
                    <th className="py-1.5 pr-3">Column</th>
                    <th className="py-1.5 pr-3">Type</th>
                    <th className="w-[40%] py-1.5 pr-3">Description</th>
                    <th className="py-1.5 pr-3" title="When a message contains an id matching the pattern, the row is fetched automatically">Look up by</th>
                    <th className="py-1.5 text-center" title="Columns shown in looked-up rows; none = all">Show</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {columns.map((column) => {
                    const lookup = lookups.find((l) => l.column === column.name);
                    return (
                      <tr key={column.name} className="align-top">
                        <td className="py-1.5 pr-3">
                          <span className="font-mono text-fg">{column.name}</span>
                          {column.indexed && <Badge tone="ok" className="ml-1.5" icon={<KeyRound />}>indexed</Badge>}
                        </td>
                        <td className="py-1.5 pr-3 font-mono text-[11.5px] whitespace-nowrap text-muted">{column.type}</td>
                        <td className="py-1 pr-3">
                          <Input
                            value={table.columns?.[column.name] ?? ""}
                            onChange={(e) => update(object.name, (t) => ({ ...t, columns: { ...t.columns, [column.name]: e.target.value } }))}
                            placeholder={column.comment || "Meaning, codes… (optional)"}
                            className="py-1 text-[12.5px]"
                          />
                        </td>
                        <td className="py-1.5 pr-3">
                          <div className="flex h-7 items-center" title={column.indexed ? "Fetch the row when a message contains a matching id" : "Not indexed: looking rows up by it can be slow on large tables"}>
                            <Switch
                              label={`Look up ${object.name} by ${column.name}`}
                              checked={Boolean(lookup)}
                              onChange={(on) => update(object.name, (t) => ({
                                ...t,
                                lookup: on
                                  ? [...(t.lookup ?? []), { column: column.name, match: "" }]
                                  : (t.lookup ?? []).filter((l) => l.column !== column.name),
                              }))}
                            />
                          </div>
                          {lookup && (
                            <Input
                              value={lookup.match}
                              onChange={(e) => update(object.name, (t) => ({
                                ...t,
                                lookup: (t.lookup ?? []).map((l) => (l.column === column.name ? { ...l, match: e.target.value } : l)),
                              }))}
                              placeholder="id pattern, e.g. \bORD-\d+\b"
                              className={cn("mt-1 w-48 py-1 font-mono text-[12px]", !lookup.match && "border-warn")}
                              aria-label={`Id pattern for ${column.name}`}
                            />
                          )}
                        </td>
                        <td className="py-1.5 text-center align-middle">
                          <input type="checkbox" className="check" checked={select.includes(column.name)}
                            onChange={(e) => update(object.name, (t) => ({
                              ...t,
                              select: e.target.checked ? [...(t.select ?? []), column.name] : (t.select ?? []).filter((c) => c !== column.name),
                            }))}
                            aria-label={`Show ${column.name} in looked-up rows`} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11.5px] text-muted">
              <b className="text-fg-2">Look up by</b>: when a message contains an id matching the pattern (a regex), this row is fetched automatically. Prefer indexed columns.
              {" "}<b className="text-fg-2">Show</b>: columns included in looked-up rows (none ticked = all).
            </p>
            {lookups.some((l) => !l.match) && <p className="text-[12px] text-warn">Add an id pattern for each lookup column, or it won't be saved.</p>}
          </div>
        );
      }}
    />
  );
}
