/** The member chart's y axis: where it starts and ends, its grid lines, and the first month with members to draw. */
export type TrendScale = { bottom: number; top: number; ticks: number[]; from: number };

/** Grid steps are 1, 2 or 5 times a power of ten, so labels are round whole numbers. */
function niceStep(raw: number): number {
  if (raw <= 1) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((f) => f * power).find((v) => v >= raw) ?? 10 * power;
}

/**
 * Fits the axis to the months that have members, so a change of a few members
 * is visible instead of a flat line far above 0. Months before the first one
 * with members (before the studio was in Mana, or before a membership existed)
 * are left out, not drawn as 0. The axis starts at least `headroom` (5 %)
 * below the lowest month, rounded down to a grid line; a month at 0 later on
 * is real and keeps the axis at 0.
 */
export function trendScale(counts: number[], headroom = 0.05): TrendScale {
  const from = counts.findIndex((c) => c > 0);
  if (from === -1) return { bottom: 0, top: 1, ticks: [0, 1], from: Math.max(0, counts.length - 1) };
  const shown = counts.slice(from);
  const low = Math.min(...shown) * (1 - headroom);
  const high = Math.max(...shown);
  // About three grid steps between the lowest and highest point: tight, with labels that stay readable.
  const step = niceStep((high - low) / 3);
  const bottom = Math.floor(low / step) * step;
  // A flat line gets a step above it too, rather than running along the top edge.
  const flat = high === Math.min(...shown);
  const top = Math.ceil(high / step) * step + (flat && high % step === 0 ? step : 0);
  const ticks = Array.from({ length: Math.round((top - bottom) / step) + 1 }, (_, i) => bottom + i * step);
  return { bottom, top, ticks, from };
}
