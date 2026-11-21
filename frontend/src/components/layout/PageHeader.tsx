import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { ButtonLink } from "../ui/Button";

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 flex min-h-14 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur md:px-6">
      <div className="min-w-0">
        <h1 className="truncate text-[15px] font-semibold tracking-tight text-fg">{title}</h1>
        {subtitle && <div className="truncate text-[12px] text-muted">{subtitle}</div>}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {actions ?? (
          <ButtonLink to="/investigations" variant="primary" aria-label="New investigation">
            <Plus /> <span className="hidden sm:inline">New investigation</span>
          </ButtonLink>
        )}
      </div>
    </header>
  );
}

export const PageBody = ({ children }: { children: ReactNode }) => (
  <div className="mx-auto w-full max-w-[1440px] space-y-4 px-4 py-5 md:px-6">{children}</div>
);
