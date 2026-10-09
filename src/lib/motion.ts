/** The only motion values in the app (docs/DESIGN.md, section 8). */
export const springs = {
  snappy: { type: "spring", stiffness: 520, damping: 34 }, // press, toggle, chip
  standard: { type: "spring", stiffness: 400, damping: 34 }, // panels, drawers, popovers, dialogs
  gentle: { type: "spring", stiffness: 280, damping: 32 }, // route entrance
} as const;

/** The press state every interactive element gets. */
export const press = { scale: 0.97 } as const;
