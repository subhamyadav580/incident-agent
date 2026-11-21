import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { cn } from "./cn";

type Tone = "ok" | "err" | "info";
interface Toast { id: number; tone: Tone; title: string; description?: string }
interface ToastApi { toast: (tone: Tone, title: string, description?: string) => void }

const ToastContext = createContext<ToastApi>({ toast: () => undefined });
let nextId = 1;

/** Non-blocking feedback (saved, copied, failed) in the bottom-right corner. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((t) => t.id !== id)), []);
  const toast = useCallback((tone: Tone, title: string, description?: string) => {
    const id = nextId++;
    setToasts((current) => [...current.slice(-3), { id, tone, title, description }]);
    setTimeout(() => dismiss(id), tone === "err" ? 7000 : 3500);
  }, [dismiss]);
  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => {
          const Icon = t.tone === "ok" ? CheckCircle2 : t.tone === "err" ? AlertTriangle : Info;
          return (
            <div key={t.id} role={t.tone === "err" ? "alert" : "status"}
              className="pointer-events-auto flex animate-pop-in items-start gap-2.5 rounded-xl border border-line bg-surface p-3 shadow-drawer">
              <Icon className={cn("mt-0.5 size-4 shrink-0", t.tone === "ok" ? "text-ok" : t.tone === "err" ? "text-err" : "text-accent")} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-fg">{t.title}</div>
                {t.description && <div className="mt-0.5 text-[12.5px] break-words text-muted">{t.description}</div>}
              </div>
              <button type="button" onClick={() => dismiss(t.id)} className="text-muted hover:text-fg" aria-label="Dismiss">
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext).toast;
