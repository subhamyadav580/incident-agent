import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./Button";

/**
 * Centered dialog with a fixed size, so switching tabs inside it never
 * resizes or moves it. The body scrolls; header and footer stay in place.
 */
export function Modal({ title, subtitle, icon, onClose, footer, toolbar, children }: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  /** Pinned under the header, e.g. tabs. */
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 grid place-items-center p-3 sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex h-[min(860px,calc(100vh-2rem))] w-full max-w-5xl animate-pop-in flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-drawer">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          {icon}
          <div className="min-w-0">
            <div className="font-semibold text-fg">{title}</div>
            {subtitle && <div className="truncate text-[12.5px] text-muted">{subtitle}</div>}
          </div>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </div>
        {toolbar && <div className="px-5 pt-1">{toolbar}</div>}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex items-center gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}
