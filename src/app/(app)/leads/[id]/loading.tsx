import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/app/surface";

/** A lead while it loads: name, state, the call buttons and the first panels, in place. */
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Skeleton className="h-11 w-full rounded-md sm:w-48" />
          <Skeleton className="h-11 w-full rounded-md sm:w-36" />
        </div>
      </div>
      {[0, 1, 2].map((i) => (
        <Surface key={i} as="div" className="flex flex-col gap-4 p-4 sm:px-5">
          <Skeleton className="h-5 w-32" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[0, 1, 2, 3].map((j) => (
              <Skeleton key={j} className="h-11 rounded-md sm:h-9" />
            ))}
          </div>
        </Surface>
      ))}
    </div>
  );
}
