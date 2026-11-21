import { ChevronRight, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { describeCatalogObject, useCatalogList, type CatalogRequest } from "@/api/hooks";
import type { CatalogColumn, CatalogObject } from "@/api/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input } from "@/components/ui/Field";
import { Alert, EmptyState, Spinner } from "@/components/ui/Feedback";
import { cn } from "@/components/ui/cn";

const PAGE = 100;

export interface CatalogRowProps {
  object: CatalogObject;
  columns: CatalogColumn[] | undefined;
  columnsError: string | undefined;
}

/**
 * Lists the tables / index groups of a data source with a search box. Each row
 * has an inline description and expands to its columns, loaded on demand.
 * What a row and its columns let the user edit is up to `renderSummary` and
 * `renderColumns` (PostgreSQL tables vs Elasticsearch index groups).
 */
export function CatalogBrowser({ request, noun, isDescribed, describedCount, renderSummary, renderColumns }: {
  request: () => CatalogRequest;
  noun: { one: string; many: string };
  isDescribed: (name: string) => boolean;
  describedCount: number;
  renderSummary: (object: CatalogObject) => ReactNode;
  renderColumns: (props: CatalogRowProps) => ReactNode;
}) {
  const list = useCatalogList();
  const [filter, setFilter] = useState("");
  const [describedOnly, setDescribedOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [columns, setColumns] = useState<Record<string, CatalogColumn[]>>({});
  const [columnErrors, setColumnErrors] = useState<Record<string, string>>({});

  const load = useCallback(() => list.mutate(request()), [list, request]);
  // Load once when the tab opens; Reload fetches again with the current form values.
  useEffect(load, []);

  const toggle = async (name: string) => {
    setOpen(open === name ? null : name);
    if (open === name || columns[name]) return;
    try {
      const detail = await describeCatalogObject({ ...request(), object: name });
      setColumns((current) => ({ ...current, [name]: detail.columns }));
    } catch (error) {
      setColumnErrors((current) => ({ ...current, [name]: (error as Error).message }));
    }
  };

  const objects = list.data?.objects ?? [];
  const filtered = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return objects
      .filter((object) => (!term || object.name.toLowerCase().includes(term)) && (!describedOnly || isDescribed(object.name)))
      // Described first, then the source's order (largest first).
      .sort((a, b) => Number(isDescribed(b.name)) - Number(isDescribed(a.name)));
  }, [objects, filter, describedOnly, isDescribed]);

  if (list.isPending) {
    return <div className="flex items-center gap-2 py-6 text-[13px] text-muted"><Spinner /> Loading {noun.many} from the data source…</div>;
  }
  if (list.error) {
    return (
      <div className="space-y-3">
        <Alert tone="err">{(list.error as Error).message}</Alert>
        <Button onClick={load}><RefreshCw /> Try again</Button>
        <p className="text-[12.5px] text-muted">Check the connection details in the Connection tab first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-muted">
        Optional. Describe the {noun.many} the agent should know about; everything else is left as it is.
        Described {noun.many} are used first during investigations.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted" />
          <Input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Search ${objects.length} ${noun.many}…`} className="pl-8" />
        </div>
        <Checkbox label="Described only" checked={describedOnly} onChange={(e) => setDescribedOnly(e.target.checked)} />
        <Badge tone={describedCount ? "accent" : "neutral"}>{describedCount} described</Badge>
        <Button size="sm" variant="ghost" onClick={load} aria-label="Reload"><RefreshCw /></Button>
      </div>

      {filtered.length ? (
        <div className="overflow-hidden rounded-lg border border-line">
          {filtered.slice(0, PAGE).map((object) => {
            const expanded = open === object.name;
            return (
              <div key={object.name} className="border-b border-line last:border-b-0">
                <div className={cn("grid grid-cols-[minmax(0,1fr)] items-center gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)]", expanded && "bg-surface-2")}>
                  <button type="button" onClick={() => toggle(object.name)} aria-expanded={expanded} className="flex min-w-0 items-center gap-1.5 text-left">
                    <ChevronRight className={cn("size-3.5 shrink-0 text-muted transition-transform", expanded && "rotate-90")} />
                    <span className="truncate font-mono text-[12.5px] text-fg" title={object.name}>{object.name}</span>
                    {isDescribed(object.name) && <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-label="described" />}
                    <span className="ml-auto shrink-0 pl-2 text-[11.5px] text-muted">{object.detail}</span>
                  </button>
                  {renderSummary(object)}
                </div>
                {expanded && (
                  <div className="border-t border-line bg-surface-2/60 px-3 py-3">
                    {renderColumns({ object, columns: columns[object.name], columnsError: columnErrors[object.name] })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState title={objects.length ? "No match" : `No ${noun.many} found`}>
          {objects.length ? "Try another search." : `The connection works, but no readable ${noun.many} were found.`}
        </EmptyState>
      )}
      {filtered.length > PAGE && <p className="text-[12px] text-muted">Showing {PAGE} of {filtered.length}. Search to narrow the list.</p>}
      {list.data?.truncated && <p className="text-[12px] text-muted">Only the largest {objects.length} {noun.many} are listed.</p>}
    </div>
  );
}

export function ColumnsLoading({ error }: { error?: string }) {
  if (error) return <Alert tone="err">{error}</Alert>;
  return <div className="flex items-center gap-2 text-[12.5px] text-muted"><Spinner className="size-3.5" /> Loading…</div>;
}
