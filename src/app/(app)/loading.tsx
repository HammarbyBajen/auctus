import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/app/surface";

/** Hem while it loads: the same frame, title, list and side numbers as the real page. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-11 w-36 rounded-md" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-40" />
          <Surface as="div" className="divide-y divide-border">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-56" />
                </div>
                <Skeleton className="hidden h-9 w-20 rounded-md sm:block" />
              </div>
            ))}
          </Surface>
        </div>
        <Surface as="div" className="grid grid-cols-3 gap-4 p-4 xl:grid-cols-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-6 w-10" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </Surface>
      </div>
    </div>
  );
}
