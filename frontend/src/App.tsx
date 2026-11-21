import { createBrowserRouter, RouterProvider } from "react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Spinner } from "@/components/ui/Feedback";

// Pages load on demand; the Markdown renderer only ships with Investigate.
const router = createBrowserRouter([
  {
    element: <AppShell />,
    HydrateFallback: () => <div className="grid h-full place-items-center"><Spinner /></div>,
    children: [
      { index: true, lazy: async () => ({ Component: (await import("@/features/home/HomePage")).HomePage }) },
      { path: "overview", lazy: async () => ({ Component: (await import("@/features/overview/OverviewPage")).OverviewPage }) },
      { path: "investigations/:id?", lazy: async () => ({ Component: (await import("@/features/investigations/InvestigationsPage")).InvestigationsPage }) },
      { path: "connectors", lazy: async () => ({ Component: (await import("@/features/connectors/ConnectorsPage")).ConnectorsPage }) },
      { path: "settings", lazy: async () => ({ Component: (await import("@/features/settings/SettingsPage")).SettingsPage }) },
      { path: "*", lazy: async () => ({ Component: (await import("@/features/home/HomePage")).HomePage }) },
    ],
  },
]);

export const App = () => <RouterProvider router={router} />;
