import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/app/surface";

/**
 * A page while its data loads: the same frame and title as the real page, so a
 * click in the menu answers at once. `board` for the leads board, `table` for
 * month and report figures, `panels` for settings.
 */
export function PageSkeleton({ shape }: { shape: "board" | "table" | "panels" }) {
  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8" aria-busy="true">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-11 w-32 rounded-md sm:h-9" />
      </div>

      {shape === "board" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((col) => (
            <div key={col} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-24" />
              {[0, 1, 2].map((card) => (
                <Surface key={card} as="div" className="flex flex-col gap-2 p-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </Surface>
              ))}
            </div>
          ))}
        </div>
      )}

      {shape === "table" && (
        <Surface as="div" className="flex flex-col divide-y divide-border">
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="flex items-center justify-between gap-4 px-4 py-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </Surface>
      )}

      {shape === "panels" &&
        [0, 1, 2].map((panel) => (
          <Surface key={panel} as="div" className="flex flex-col gap-3 p-4 sm:px-5">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-full max-w-md" />
            <Skeleton className="h-4 w-2/3 max-w-sm" />
          </Surface>
        ))}
    </div>
  );
}
