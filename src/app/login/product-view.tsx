/**
 * A dimmed, wordless view of the product for the login screen (docs/DESIGN.md
 * 3.3: no card on a void). Only shapes: no names, numbers or member data.
 */
const rows = [72, 58, 84, 64, 76, 52, 68];

export function ProductView() {
  return (
    <div aria-hidden="true" className="pointer-events-none flex h-full w-full overflow-hidden rounded-xl bg-rail elevation-3 select-none">
      <div className="hidden w-40 shrink-0 flex-col gap-3 p-4 sm:flex">
        <div className="h-6 w-20 rounded-xs bg-muted" />
        <div className="mt-2 h-8 rounded-md bg-primary/80" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-6 rounded-md bg-sidebar-accent" />
        ))}
      </div>
      <div className="m-2 flex flex-1 flex-col gap-4 rounded-lg bg-background p-5 elevation-1">
        <div className="h-5 w-40 rounded-xs bg-muted" />
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-2 rounded-lg bg-card p-3 elevation-1">
              <div className="h-5 w-10 rounded-xs bg-muted" />
              <div className="h-2.5 w-16 rounded-xs bg-well" />
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2 rounded-lg bg-card p-3 elevation-1">
          {rows.map((width, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-1">
              <div className="flex flex-col gap-1.5" style={{ width: `${width}%` }}>
                <div className="h-3 w-1/2 rounded-xs bg-muted" />
                <div className="h-2 w-3/4 rounded-xs bg-well" />
              </div>
              <div className="h-6 w-14 shrink-0 rounded-md bg-well" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
