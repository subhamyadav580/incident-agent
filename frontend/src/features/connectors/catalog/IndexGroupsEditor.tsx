import { useCallback } from "react";
import type { CatalogRequest } from "@/api/hooks";
import type { IndexGroupConfig } from "@/api/types";
import { Input } from "@/components/ui/Field";
import { CatalogBrowser, ColumnsLoading } from "./CatalogBrowser";

export type IndexGroups = Record<string, IndexGroupConfig>;

const isDescribed = (group?: IndexGroupConfig) =>
  Boolean(group && (group.description || group.fields?.length || group.search_fields?.length || group.timestamp_field));

const toggleIn = (list: string[] | undefined, item: string, on: boolean) =>
  on ? [...(list ?? []).filter((x) => x !== item), item] : (list ?? []).filter((x) => x !== item);

/** Elasticsearch: describe index groups and pick returned, searched and timestamp fields. */
export function IndexGroupsEditor({ value, onChange, request }: { value: IndexGroups; onChange: (value: IndexGroups) => void; request: () => CatalogRequest }) {
  const update = (prefix: string, change: (current: IndexGroupConfig) => IndexGroupConfig) =>
    onChange({ ...value, [prefix]: change(value[prefix] ?? {}) });
  const described = useCallback((name: string) => isDescribed(value[name]), [value]);

  return (
    <CatalogBrowser
      request={request}
      noun={{ one: "index group", many: "index groups" }}
      isDescribed={described}
      describedCount={Object.values(value).filter(isDescribed).length}
      renderSummary={(object) => (
        <Input
          value={value[object.name]?.description ?? ""}
          onChange={(e) => update(object.name, (g) => ({ ...g, description: e.target.value }))}
          placeholder="Which service's logs, what they contain (optional)"
          className="py-1.5 text-[13px]"
          aria-label={`Description of ${object.name}`}
        />
      )}
      renderColumns={({ object, columns, columnsError }) => {
        if (!columns) return <ColumnsLoading error={columnsError} />;
        const group = value[object.name] ?? {};
        return (
          <div className="space-y-2">
            <div className="max-h-80 overflow-auto">
              <table className="w-full min-w-[560px] text-left text-[12.5px]">
                <thead className="sticky top-0 bg-surface-2">
                  <tr className="text-[10.5px] font-semibold tracking-wider text-muted uppercase">
                    <th className="py-1.5 pr-3">Field</th>
                    <th className="py-1.5 pr-3">Type</th>
                    <th className="py-1.5 pr-3 text-center" title="Returned to the agent for each log line">Return</th>
                    <th className="py-1.5 pr-3 text-center" title="Ids and error text are matched in these fields">Search</th>
                    <th className="py-1.5 text-center" title="Used for the time window and ordering">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {columns.map((field) => (
                    <tr key={field.name}>
                      <td className="py-1.5 pr-3 font-mono break-all text-fg">{field.name}</td>
                      <td className="py-1.5 pr-3 font-mono text-[11.5px] text-muted">{field.type}</td>
                      <td className="py-2 pr-3 text-center align-middle">
                        <input type="checkbox" className="check" checked={group.fields?.includes(field.name) ?? false}
                          onChange={(e) => update(object.name, (g) => ({ ...g, fields: toggleIn(g.fields, field.name, e.target.checked) }))}
                          aria-label={`Return ${field.name}`} />
                      </td>
                      <td className="py-2 pr-3 text-center align-middle">
                        {["text", "keyword", "match_only_text", "wildcard"].includes(field.type) && (
                          <input type="checkbox" className="check" checked={group.search_fields?.includes(field.name) ?? false}
                            onChange={(e) => update(object.name, (g) => ({ ...g, search_fields: toggleIn(g.search_fields, field.name, e.target.checked) }))}
                            aria-label={`Search ${field.name}`} />
                        )}
                      </td>
                      <td className="py-2 text-center align-middle">
                        {["date", "date_nanos"].includes(field.type) && (
                          <input type="radio" name={`ts-${object.name}`} className="radio" checked={group.timestamp_field === field.name}
                            onChange={() => update(object.name, (g) => ({ ...g, timestamp_field: field.name }))}
                            aria-label={`Use ${field.name} as timestamp`} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11.5px] text-muted">
              Leave unticked to use the connector's defaults (Advanced tab). Fewer returned fields keep investigations fast.
            </p>
          </div>
        );
      }}
    />
  );
}
