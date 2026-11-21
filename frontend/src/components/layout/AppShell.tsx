import { Activity, Database, LayoutDashboard, Monitor, Moon, Plus, Rows3, Search, Settings, Sun, StretchHorizontal } from "lucide-react";
import { NavLink, Outlet, Link } from "react-router";
import { useConnectors } from "@/api/hooks";
import { useDensity, useTheme, type Theme } from "@/lib/preferences";
import { HealthDot } from "../status";
import { cn } from "../ui/cn";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/investigations", label: "Investigate", icon: Search },
  { to: "/connectors", label: "Connectors", icon: Database },
  { to: "/settings", label: "Settings", icon: Settings },
];

function DataSources() {
  const { data: connectors = [] } = useConnectors();
  return (
    <div className="hidden min-h-0 flex-1 flex-col md:flex">
      <div className="px-5 pt-5 pb-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">Data sources</div>
      <div className="min-h-0 space-y-0.5 overflow-y-auto px-2.5">
        {connectors.length ? (
          connectors.map((connector) => (
            <Link key={connector.id} to="/connectors" className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-fg-2 hover:bg-hover">
              <HealthDot connector={connector} />
              <span className="min-w-0 flex-1 truncate">{connector.name}</span>
              <span className="text-[11px] text-muted">{connector.type === "postgres" ? "PG" : connector.type === "elasticsearch" ? "ES" : connector.type}</span>
            </Link>
          ))
        ) : (
          <Link to="/connectors" className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-muted hover:bg-hover">
            <Plus className="size-3.5" /> Add a data source
          </Link>
        )}
      </div>
    </div>
  );
}

function Preferences() {
  const [theme, setTheme] = useTheme();
  const [density, setDensity] = useDensity();
  const themes: { value: Theme; icon: typeof Sun; label: string }[] = [
    { value: "light", icon: Sun, label: "Light" },
    { value: "system", icon: Monitor, label: "System" },
    { value: "dark", icon: Moon, label: "Dark" },
  ];
  return (
    <div className="hidden space-y-2 border-t border-line px-4 py-3.5 md:block">
      <div className="flex rounded-md bg-surface-2 p-0.5 ring-1 ring-line" role="radiogroup" aria-label="Theme">
        {themes.map(({ value, icon: Icon, label }) => (
          <button key={value} type="button" role="radio" aria-checked={theme === value} title={label} onClick={() => setTheme(value)}
            className={cn("flex flex-1 items-center justify-center rounded py-1 text-muted", theme === value && "bg-surface text-fg shadow-sm")}>
            <Icon className="size-3.5" />
          </button>
        ))}
      </div>
      <button type="button" onClick={() => setDensity(density === "compact" ? "comfortable" : "compact")}
        className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-[12px] text-muted hover:text-fg">
        {density === "compact" ? <Rows3 className="size-3.5" /> : <StretchHorizontal className="size-3.5" />}
        {density === "compact" ? "Compact density" : "Comfortable density"}
      </button>
    </div>
  );
}

export function AppShell() {
  return (
    <div className="grid min-h-full grid-cols-[minmax(0,1fr)] md:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="flex min-w-0 flex-col border-b border-line bg-surface md:sticky md:top-0 md:h-screen md:border-r md:border-b-0">
        <div className="flex items-center gap-2.5 px-5 py-4 font-bold tracking-tight">
          <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-accent to-violet text-white">
            <Activity className="size-4" strokeWidth={2.4} />
          </span>
          Incident Agent
        </div>
        <nav className="flex gap-0.5 overflow-x-auto px-2.5 pb-2 md:flex-col md:pb-0" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] font-medium whitespace-nowrap transition-colors",
                isActive ? "bg-accent-soft text-accent" : "text-fg-2 hover:bg-hover hover:text-fg",
              )}>
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <DataSources />
        <Preferences />
      </aside>
      <main className="min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
