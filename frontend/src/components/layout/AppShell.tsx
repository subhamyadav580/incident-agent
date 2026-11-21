import { Activity, Database, House, LayoutDashboard, Monitor, Moon, Rows3, Search, Settings, Sun, StretchHorizontal } from "lucide-react";
import { Link, NavLink, Outlet } from "react-router";
import { useDensity, useTheme, type Theme } from "@/lib/preferences";
import { CommandPalette, MOD_KEY, openCommandPalette } from "../CommandPalette";
import { Kbd } from "../ui/Feedback";
import { cn } from "../ui/cn";

const NAV = [
  { to: "/", label: "Home", icon: House, end: true },
  { to: "/overview", label: "Overview", icon: LayoutDashboard },
  { to: "/investigations", label: "Investigate", icon: Search },
  { to: "/connectors", label: "Connectors", icon: Database },
  { to: "/settings", label: "Settings", icon: Settings },
];

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
        <Link to="/" className="flex items-center gap-2.5 px-5 py-4 font-bold tracking-tight">
          <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-accent to-violet text-white">
            <Activity className="size-4" strokeWidth={2.4} />
          </span>
          Incident Agent
        </Link>
        <div className="hidden px-2.5 pb-2 md:block">
          <button type="button" onClick={openCommandPalette}
            className="flex w-full items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[13px] text-muted transition-colors hover:border-line-strong hover:text-fg">
            <Search className="size-3.5" />
            <span className="flex-1 truncate text-left whitespace-nowrap">Search…</span>
            <Kbd>{MOD_KEY}</Kbd><Kbd>K</Kbd>
          </button>
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
        <div className="hidden flex-1 md:block" />
        <Preferences />
      </aside>
      <main className="min-w-0">
        <Outlet />
      </main>
      <CommandPalette />
    </div>
  );
}
