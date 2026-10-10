"use client";

import { useEffect, useRef, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Chip } from "@/components/app/chip";
import { MicroLabel } from "@/components/app/micro-label";
import { Surface } from "@/components/app/surface";
import { formatNumber, formatPercent } from "@/lib/format";
import { monthOverMonth, type MemberTrend as Trend, type MonthPoint } from "@/lib/kpi/members";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const monthLong = new Intl.DateTimeFormat("sv-SE", { month: "long", year: "numeric", timeZone: "UTC" });
const monthShort = new Intl.DateTimeFormat("sv-SE", { month: "short", timeZone: "UTC" });
const monthName = new Intl.DateTimeFormat("sv-SE", { month: "long", timeZone: "UTC" });
const asDate = (month: string) => new Date(`${month}-15T12:00:00Z`);

/** A round top for the y scale (268 becomes 300), so ticks are clean numbers and the scale starts at 0. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const step = 10 ** Math.floor(Math.log10(value));
  return [1, 2, 3, 4, 5, 6, 8, 10].map((f) => f * step).find((v) => v >= value) ?? 10 * step;
}

/**
 * A smooth path through the points that never bends past them (monotone cubic,
 * Fritsch-Carlson): flat stretches stay flat and the curve never dips below 0
 * or overshoots a month, so the shape cannot misstate the counts.
 */
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : "";
  const n = pts.length;
  const slope = pts.slice(1).map(([x1, y1], i) => (y1 - pts[i][1]) / (x1 - pts[i][0]));
  const tangent = pts.map((_, i) => {
    if (i === 0) return slope[0];
    if (i === n - 1) return slope[n - 2];
    const a = slope[i - 1];
    const b = slope[i];
    // Months are evenly spaced, so the tangent is the harmonic mean of the two slopes.
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  });
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const h = (x1 - x0) / 3;
    d += ` C${x0 + h},${y0 + tangent[i] * h} ${x1 - h},${y1 - tangent[i + 1] * h} ${x1},${y1}`;
  }
  return d;
}

const height = 120;
const pad = { top: 8, right: 8, bottom: 20, left: 36 };

/** Twelve months as a small line chart, with a crosshair and readout on hover or arrow keys. */
function Chart({ points }: { points: MonthPoint[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(480);
  const [active, setActive] = useState<number | null>(null);
  // Only keyboard use is announced; a mouse sweeping the chart would make a screen reader read every month.
  const [spoken, setSpoken] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(200, entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const top = niceMax(Math.max(...points.map((p) => p.count)));
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const step = innerW / Math.max(1, points.length - 1);
  const x = (i: number) => pad.left + i * step;
  const y = (v: number) => pad.top + innerH - (v / top) * innerH;
  const line = smoothPath(points.map((p, i) => [x(i), y(p.count)]));
  const area = `${line} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const last = points.length - 1;
  const shown = active ?? null;

  const pick = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    setActive(Math.min(last, Math.max(0, Math.round((clientX - rect.left - pad.left) / step))));
  };

  return (
    <div
      ref={box}
      tabIndex={0}
      role="group"
      aria-label={t("kpi.chartLabel")}
      className="focus-ring relative w-full min-w-0 overflow-hidden rounded-sm"
      onPointerMove={(e) => {
        setSpoken(false);
        pick(e.clientX);
      }}
      onPointerLeave={() => setActive(null)}
      onFocus={() => {
        setSpoken(true);
        setActive((a) => a ?? last);
      }}
      onBlur={() => {
        setSpoken(false);
        setActive(null);
      }}
      onKeyDown={(e) => {
        setSpoken(true);
        if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? last) - 1));
        else if (e.key === "ArrowRight") setActive((a) => Math.min(last, (a ?? last) + 1));
        else return;
        e.preventDefault();
      }}
    >
      <svg width={width} height={height} aria-hidden="true" className="block overflow-visible">
        {(Number.isInteger(top / 2) ? [0, top / 2, top] : [0, top]).map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className="stroke-border" strokeWidth={1} />
            <text x={pad.left - 6} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-3xs tabular-nums">
              {formatNumber(tick)}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          (last - i) % 3 === 0 ? (
            <text key={p.month} x={x(i)} y={height - 4} textAnchor={i === last ? "end" : "middle"} className="fill-muted-foreground text-3xs">
              {monthShort.format(asDate(p.month)).replace(".", "")}
            </text>
          ) : null,
        )}
        <path d={area} className="fill-chart-1" fillOpacity={0.1} />
        <path d={line} fill="none" className="stroke-chart-1" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {shown !== null && <line x1={x(shown)} x2={x(shown)} y1={pad.top} y2={y(0)} className="stroke-muted-foreground" strokeWidth={1} />}
        <circle cx={x(shown ?? last)} cy={y(points[shown ?? last].count)} r={4} className="fill-chart-1 stroke-card" strokeWidth={2} />
      </svg>
      {shown !== null && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 flex flex-col rounded-md bg-popover px-2.5 py-1.5 whitespace-nowrap text-popover-foreground elevation-3"
          // Beside the crosshair, never over the point it describes: right of it, or left near the right edge.
          style={x(shown) < width / 2 ? { left: x(shown) + 10 } : { left: x(shown) - 10, transform: "translateX(-100%)" }}
        >
          <span className="text-sm font-semibold tabular-nums">{formatNumber(points[shown].count)}</span>
          <span className="text-2xs text-muted-foreground first-letter:uppercase">{monthLong.format(asDate(points[shown].month))}</span>
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {spoken && shown !== null ? `${monthLong.format(asDate(points[shown].month))}: ${formatNumber(points[shown].count)}` : ""}
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
          {points.map((p) => (
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
        </div>
        <Chart points={points} />
      </div>
    </Surface>
  );
}
