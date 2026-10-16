"use client";

import { useEffect, useId, useRef, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Chip } from "@/components/app/chip";
import { MicroLabel } from "@/components/app/micro-label";
import { Surface } from "@/components/app/surface";
import { formatNumber, formatPercent } from "@/lib/format";
import { monthOverMonth, type MemberTrend as Trend, type MonthPoint } from "@/lib/kpi/members";
import { trendScale } from "@/lib/kpi/scale";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const monthLong = new Intl.DateTimeFormat("sv-SE", { month: "long", year: "numeric", timeZone: "UTC" });
const monthShort = new Intl.DateTimeFormat("sv-SE", { month: "short", timeZone: "UTC" });
const monthName = new Intl.DateTimeFormat("sv-SE", { month: "long", timeZone: "UTC" });
const asDate = (month: string) => new Date(`${month}-15T12:00:00Z`);

type Pt = [number, number];
/** One curve piece between two months: start, two control points, end. */
type Segment = [Pt, Pt, Pt, Pt];

/**
 * A smooth curve through the points that never bends past them (monotone
 * cubic, Fritsch-Carlson): flat stretches stay flat and the curve never dips
 * below the lowest month or overshoots one, so the shape cannot misstate the
 * counts. The control points sit a third of the way along each piece, so a
 * piece's x moves evenly with its t, which lets the hover dot find the
 * curve's height under the mouse.
 */
function smoothSegments(pts: Pt[]): Segment[] {
  const n = pts.length;
  if (n < 2) return [];
  const slope = pts.slice(1).map(([x1, y1], i) => (y1 - pts[i][1]) / (x1 - pts[i][0]));
  const tangent = pts.map((_, i) => {
    if (i === 0) return slope[0];
    if (i === n - 1) return slope[n - 2];
    const a = slope[i - 1];
    const b = slope[i];
    // Months are evenly spaced, so the tangent is the harmonic mean of the two slopes.
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  });
  return pts.slice(1).map(([x1, y1], i) => {
    const [x0, y0] = pts[i];
    const h = (x1 - x0) / 3;
    return [[x0, y0], [x0 + h, y0 + tangent[i] * h], [x1 - h, y1 - tangent[i + 1] * h], [x1, y1]];
  });
}

const pathOf = (pts: Pt[], segments: Segment[]) =>
  pts.length === 0 ? "" : `M${pts[0][0]},${pts[0][1]}` + segments.map(([, c1, c2, end]) => ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${end[0]},${end[1]}`).join("");

/** The curve's height at t (0 to 1) along a piece. */
function heightAt([p0, c1, c2, p1]: Segment, t: number): number {
  const u = 1 - t;
  return u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1];
}

const height = 120;
const pad = { top: 8, right: 8, bottom: 20, left: 8 };
/** How close (px) the mouse must be to a month for its dot to grow and the hover dot to sit on it. */
const snapPx = 12;

/**
 * Twelve months as a small area chart in the shape of shadcn's "Area Chart -
 * Gradient": a gradient under a smooth line, a dot on each month, grid lines
 * without numbers. Months before the first one with members stay empty. A dot follows the mouse along the line;
 * near a month it rests on that month's dot, which grows. The readout always
 * shows the nearest month, since a count between two months means nothing.
 * Arrow keys step through the months.
 */
function Chart({ points: all }: { points: MonthPoint[] }) {
  const box = useRef<HTMLDivElement>(null);
  const gradient = `kpi-fill-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [width, setWidth] = useState(480);
  /** The mouse's x in the chart, while it is over it. */
  const [pointer, setPointer] = useState<number | null>(null);
  /** The month picked with the keyboard. */
  const [picked, setPicked] = useState<number | null>(null);
  // Only keyboard use is announced; a mouse sweeping the chart would make a screen reader read every month.
  const [spoken, setSpoken] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(200, entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The axis keeps all twelve months; the line starts at the first one with
  // members (before Mana there is nothing to draw, not 0).
  const { bottom, top, ticks, from } = trendScale(all.map((p) => p.count));
  const last = all.length - 1;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const step = last > 0 ? innerW / last : 0;
  const x = (i: number) => (last > 0 ? pad.left + i * step : pad.left + innerW / 2);
  const y = (v: number) => pad.top + innerH - ((v - bottom) / (top - bottom)) * innerH;
  const withData = all.slice(from);
  const pts: Pt[] = withData.map((p, j) => [x(from + j), y(p.count)]);
  const segments = smoothSegments(pts);
  const line = pathOf(pts, segments);
  const area = segments.length > 0 ? `${line} L${x(last)},${y(bottom)} L${x(from)},${y(bottom)} Z` : "";
  const labelEvery = Math.ceil(all.length / 6);

  // Where the hover dot is, and which month the readout shows.
  let shown: number | null = picked;
  let dot: Pt | null = picked !== null ? pts[picked - from] : null;
  let snapped = picked !== null;
  if (pointer !== null && picked === null) {
    // Only the months with members can be pointed at.
    const px = Math.min(x(last), Math.max(x(from), pointer));
    shown = last > 0 ? Math.round((px - pad.left) / step) : 0;
    snapped = Math.abs(px - x(shown)) <= snapPx;
    if (snapped || segments.length === 0) dot = pts[shown - from];
    else {
      const k = Math.min(segments.length - 1, Math.floor((px - x(from)) / step));
      dot = [px, heightAt(segments[k], (px - x(from + k)) / step)];
    }
  }

  return (
    <div
      ref={box}
      tabIndex={0}
      role="group"
      aria-label={t("kpi.chartLabel")}
      className="focus-ring relative w-full min-w-0 touch-pan-y overflow-hidden rounded-sm"
      onPointerMove={(e) => {
        setSpoken(false);
        setPicked(null);
        setPointer(e.clientX - (box.current?.getBoundingClientRect().left ?? 0));
      }}
      onPointerLeave={() => setPointer(null)}
      onFocus={() => {
        setSpoken(true);
        setPicked((p) => p ?? last);
      }}
      onBlur={() => {
        setSpoken(false);
        setPicked(null);
      }}
      onKeyDown={(e) => {
        setSpoken(true);
        if (e.key === "ArrowLeft") setPicked((p) => Math.max(from, (p ?? last) - 1));
        else if (e.key === "ArrowRight") setPicked((p) => Math.min(last, (p ?? last) + 1));
        else return;
        e.preventDefault();
      }}
    >
      <svg width={width} height={height} aria-hidden="true" className="block overflow-visible">
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.8} />
            <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.1} />
          </linearGradient>
        </defs>
        {ticks.map((tick) => (
          <line key={tick} x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className="stroke-border" strokeWidth={1} />
        ))}
        {all.map((p, i) =>
          (last - i) % labelEvery === 0 ? (
            <text
              key={p.month}
              x={x(i)}
              y={height - 4}
              textAnchor={last > 0 && i === last ? "end" : last > 0 && i === 0 ? "start" : "middle"}
              className="fill-muted-foreground text-3xs"
            >
              {monthShort.format(asDate(p.month)).replace(".", "")}
            </text>
          ) : null,
        )}
        {area && <path d={area} fill={`url(#${gradient})`} fillOpacity={0.4} />}
        <path d={line} fill="none" className="stroke-chart-1" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map(([cx, cy], i) => (
          <circle
            key={withData[i].month}
            cx={cx}
            cy={cy}
            r={3}
            className="fill-chart-1 stroke-card transition-[scale] duration-150 motion-reduce:transition-none"
            strokeWidth={1.5}
            style={{ transformBox: "fill-box", transformOrigin: "center", scale: snapped && shown === from + i ? 1.6 : 1 }}
          />
        ))}
        {dot && !snapped && <circle cx={dot[0]} cy={dot[1]} r={4} className="fill-chart-1 stroke-card" strokeWidth={2} />}
      </svg>
      {shown !== null && dot && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 flex min-w-32 flex-col gap-1 rounded-lg bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap text-popover-foreground elevation-3"
          // Beside the dot, never over it: right of it, or left near the right edge.
          style={dot[0] < width / 2 ? { left: dot[0] + 12 } : { left: dot[0] - 12, transform: "translateX(-100%)" }}
        >
          <span className="font-medium first-letter:uppercase">{monthLong.format(asDate(all[shown].month))}</span>
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="size-2.5 shrink-0 rounded-xs bg-chart-1" />
            <span className="text-muted-foreground">{t("kpi.tableCount")}</span>
            <span className="ml-auto font-medium tabular-nums">{formatNumber(all[shown].count)}</span>
          </span>
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {spoken && shown !== null ? `${monthLong.format(asDate(all[shown].month))}: ${formatNumber(all[shown].count)}` : ""}
      </p>
      <table className="sr-only">
        <caption>{t("kpi.chartLabel")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("kpi.tableMonth")}</th>
            <th scope="col">{t("kpi.tableCount")}</th>
          </tr>
        </thead>
        <tbody>
          {withData.map((p) => (
            <tr key={p.month}>
              <td>{monthLong.format(asDate(p.month))}</td>
              <td>{p.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The owners' hero: paying members today, the change since last month and a
 * twelve-month trend, filtered by membership. The filter scopes everything in
 * the card.
 */
export function MemberTrend({ trend }: { trend: Trend }) {
  const [name, setName] = useState("");
  const points = trend.series[name] ?? trend.series[""];
  const current = points.at(-1)?.count ?? 0;
  const change = monthOverMonth(points);
  const previousMonth = points.at(-2)?.month;
  const thisMonth = points.at(-1)?.month;
  const movement = trend.movement[name] ?? trend.movement[""];

  return (
    <Surface className="flex min-w-0 flex-col gap-4 p-4 sm:p-5" aria-labelledby="kpi-members">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MicroLabel as="h3">
          <span id="kpi-members">{t("kpi.members")}</span>
        </MicroLabel>
        <div role="group" aria-label={t("kpi.filterLabel")} className="flex flex-wrap gap-1 rounded-md bg-well p-1">
          {["", ...trend.names].map((value) => (
            <button
              key={value || "all"}
              type="button"
              aria-pressed={name === value}
              onClick={() => setName(value)}
              className={cn(
                "focus-ring inline-flex min-h-9 items-center rounded-sm px-2.5 text-xs whitespace-nowrap transition-[background-color] sm:min-h-7",
                name === value ? "bg-card font-medium elevation-1" : "text-muted-foreground hover:bg-accent",
              )}
            >
              {value || t("kpi.membersAll")}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] items-end gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-8">
        <div className="flex flex-col gap-2">
          <p className="text-5xl font-semibold tracking-tight">{formatNumber(current)}</p>
          {change !== null && previousMonth && (
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Chip
                tone={change > 0 ? "success" : change < 0 ? "destructive" : "neutral"}
                icon={change < 0 ? TrendingDown : TrendingUp}
              >
                {`${change > 0 ? "+" : ""}${formatPercent(change)}`}
              </Chip>
              {t("kpi.vsMonth", { month: monthName.format(asDate(previousMonth)) })}
            </p>
          )}
          {movement && thisMonth && (
            <p className="text-xs text-muted-foreground">
              {t("kpi.movement", {
                month: monthName.format(asDate(thisMonth)),
                joined: formatNumber(movement.joined),
                left: formatNumber(movement.left),
              })}
            </p>
          )}
        </div>
        <Chart points={points} />
      </div>
      {/* People, not memberships: the filters add up to more than Alla when people hold two (2026-10-15). */}
      <p className="text-xs text-muted-foreground">{t("kpi.peopleNote")}</p>
    </Surface>
  );
}
