import { cn } from "./cn";

/** Placeholder for content with a known layout while it loads (shimmers unless reduced motion). */
export const Skeleton = ({ className }: { className?: string }) => (
  <span aria-hidden className={cn("skeleton block rounded-md", className)} />
);

export function SkeletonRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3 p-pad", className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-8 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
