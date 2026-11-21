import { ArrowRight, Database, FileSearch, House, LayoutDashboard, Monitor, Moon, Plus, Rows3, Search, Settings, Sun, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useConnectorTypes, useInvestigations } from "@/api/hooks";
import { timeAgo } from "@/lib/format";
import { intentMeta } from "@/lib/intents";
import { useDensity, useTheme } from "@/lib/preferences";
import { Kbd } from "./ui/Feedback";
import { cn } from "./ui/cn";

export const OPEN_PALETTE = "ia-open-command-palette";
export const openCommandPalette = () => window.dispatchEvent(new Event(OPEN_PALETTE));

interface Command {
  id: string;
  group: string;
  title: string;
  hint?: string;
  keywords?: string;
  icon: LucideIcon;
  run: () => void;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD_KEY = isMac ? "⌘" : "Ctrl";

/** ⌘K / Ctrl+K: every page, action and recent investigation in one searchable list. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const [, setTheme] = useTheme();
  const [density, setDensity] = useDensity();
  const { data: types = [] } = useConnectorTypes();
  const { data: investigations = [] } = useInvestigations();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 0);
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => navigate(path);
    return [
      { id: "new", group: "Actions", title: "New investigation", hint: "Paste an error or an id", icon: Plus, keywords: "start investigate error", run: go("/investigations") },
      ...types.map((type) => ({
        id: `add-${type.type}`, group: "Actions", title: `Add ${type.label} connector`, icon: Database,
        keywords: `connect data source ${type.type}`, run: go(`/connectors?add=${type.type}`),
      })),
      { id: "home", group: "Go to", title: "Home", icon: House, run: go("/") },
      { id: "overview", group: "Go to", title: "Overview", hint: "Dashboard", icon: LayoutDashboard, keywords: "dashboard metrics health", run: go("/overview") },
      { id: "investigations", group: "Go to", title: "Investigations", hint: "History", icon: FileSearch, keywords: "history reports", run: go("/investigations") },
      { id: "connectors", group: "Go to", title: "Connectors", icon: Database, keywords: "data sources databases logs git", run: go("/connectors") },
      { id: "settings", group: "Go to", title: "Settings", icon: Settings, keywords: "model api key instructions router", run: go("/settings") },
      { id: "light", group: "Preferences", title: "Theme: light", icon: Sun, keywords: "appearance", run: () => setTheme("light") },
      { id: "dark", group: "Preferences", title: "Theme: dark", icon: Moon, keywords: "appearance", run: () => setTheme("dark") },
      { id: "system", group: "Preferences", title: "Theme: match system", icon: Monitor, keywords: "appearance auto", run: () => setTheme("system") },
      { id: "density", group: "Preferences", title: `Density: ${density === "compact" ? "comfortable" : "compact"}`, icon: Rows3, keywords: "spacing rows", run: () => setDensity(density === "compact" ? "comfortable" : "compact") },
      ...investigations.slice(0, 200).map((item) => ({
        id: `inv-${item.id}`, group: "Recent investigations", title: item.message.replace(/\s+/g, " ").slice(0, 120),
        hint: `${intentMeta(item.intent).label} · ${timeAgo(item.created_at)}`, icon: FileSearch,
        keywords: item.headline, run: go(`/investigations/${item.id}`),
      })),
    ];
  }, [types, investigations, navigate, setTheme, density, setDensity]);

  const results = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = commands.filter((command) => {
      const haystack = `${command.title} ${command.hint ?? ""} ${command.keywords ?? ""} ${command.group}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
    // Without a query show a short list; recent investigations are capped either way.
    let recent = 0;
    const visible = matches.filter((command) => command.group !== "Recent investigations" || ++recent <= (terms.length ? 8 : 5));
    const text = query.trim();
    if (text.length > 2) {
      const investigate: Command = {
        id: "investigate-query", group: visible.length ? "Investigate" : "Actions", title: `Investigate “${text.slice(0, 80)}”`, icon: Search,
        run: () => navigate(`/investigations?q=${encodeURIComponent(text)}`),
      };
      // Pasted errors and ids go first; a short word is more likely a page or action.
      const looksLikeAnError = text.length > 24 || /exception|error|fail|timeout|\d{4,}/i.test(text);
      if (looksLikeAnError || !visible.length) visible.unshift({ ...investigate, group: "Actions" });
      else visible.push(investigate);
    }
    return visible;
  }, [commands, query, navigate]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const runCommand = (command: Command | undefined) => {
    if (!command) return;
    close();
    command.run();
  };

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-3 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="absolute inset-0 animate-fade-in bg-black/50 backdrop-blur-[2px]" onClick={close} />
      <div className="relative w-full max-w-xl animate-pop-in overflow-hidden rounded-xl border border-line bg-surface shadow-drawer">
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search className="size-4 shrink-0 text-muted" />
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") { event.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
              else if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
              else if (event.key === "Enter") { event.preventDefault(); runCommand(results[active]); }
              else if (event.key === "Escape") { event.preventDefault(); close(); }
            }}
            placeholder="Search pages, actions, investigations… or paste an error"
            className="h-12 w-full bg-transparent text-[14px] text-fg outline-none placeholder:text-muted"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-results"
            aria-activedescendant={results[active] ? `command-${results[active].id}` : undefined}
          />
          <Kbd>esc</Kbd>
        </div>
        <div ref={list} id="command-results" role="listbox" className="max-h-[min(420px,60vh)] overflow-y-auto p-1.5">
          {results.length ? results.map((command, index) => {
            const header = command.group !== lastGroup ? command.group : null;
            lastGroup = command.group;
            return (
              <div key={command.id}>
                {header && <div className="px-2.5 pt-2.5 pb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">{header}</div>}
                <button
                  id={`command-${command.id}`}
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  data-index={index}
                  onMouseMove={() => setActive(index)}
                  onClick={() => runCommand(command)}
                  className={cn("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left", index === active ? "bg-accent-soft text-fg" : "text-fg-2")}
                >
                  <command.icon className={cn("size-4 shrink-0", index === active ? "text-accent" : "text-muted")} />
                  <span className="min-w-0 flex-1 truncate text-[13.5px]">{command.title}</span>
                  {command.hint && <span className="shrink-0 text-[12px] text-muted">{command.hint}</span>}
                  {index === active && <ArrowRight className="size-3.5 shrink-0 text-accent" />}
                </button>
              </div>
            );
          }) : (
            <div className="px-3 py-8 text-center text-[13px] text-muted">No matches</div>
          )}
        </div>
        <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-[11.5px] text-muted">
          <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
          <span className="flex items-center gap-1"><Kbd>↵</Kbd> open</span>
          <span className="ml-auto flex items-center gap-1"><Kbd>{MOD_KEY}</Kbd><Kbd>K</Kbd> toggle</span>
        </div>
      </div>
    </div>
  );
}
