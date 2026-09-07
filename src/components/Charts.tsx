/**
 * Small inline-SVG charts.
 *
 * Deliberately hand-drawn rather than pulled from a charting library: these are
 * server-rendered, need to print cleanly in black and white, and have to stay
 * legible on the phone a grower is actually holding in the field. A dependency
 * would add weight and take all three away.
 */

import type { DayBalance } from "@/lib/types";
import type { EnsembleDay } from "@/lib/climate/forecast";

const shortDate = (iso: string): string => {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}/${d}`;
};

/**
 * Reference and crop evapotranspiration over a period, with the ensemble's
 * 10th-to-90th percentile band behind the median so the uncertainty is visible
 * rather than implied.
 */
export function EtoChart({
  days,
  height = 160,
}: {
  days: EnsembleDay[];
  height?: number;
}) {
  if (days.length === 0) return null;
  const width = 720;
  const padding = { top: 12, right: 12, bottom: 26, left: 40 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const maxY = Math.max(0.05, ...days.map((d) => d.etoP90In)) * 1.1;
  const x = (i: number) => padding.left + (i / Math.max(1, days.length - 1)) * innerW;
  const y = (v: number) => padding.top + innerH - (v / maxY) * innerH;

  const medianPath = days.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.etoIn)}`).join(" ");
  const bandPath =
    days.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.etoP90In)}`).join(" ") +
    " " +
    days
      .map((d, i) => `L${x(days.length - 1 - i)},${y(days[days.length - 1 - i].etoP10In)}`)
      .join(" ") +
    " Z";

  const ticks = [0, maxY / 2, maxY];
  const labelEvery = Math.max(1, Math.ceil(days.length / 10));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label="Daily reference evapotranspiration with forecast uncertainty band"
    >
      {ticks.map((tv) => (
        <g key={tv}>
          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={y(tv)}
            y2={y(tv)}
            stroke="#ebe3d6"
            strokeWidth={1}
          />
          <text x={4} y={y(tv) + 4} fontSize={10} fill="#7a6a52">
            {tv.toFixed(2)}
          </text>
        </g>
      ))}

      <path d={bandPath} fill="#b3dbf5" opacity={0.45} />
      <path d={medianPath} fill="none" stroke="#1f74b3" strokeWidth={2} />

      {days.map((d, i) =>
        i % labelEvery === 0 ? (
          <text
            key={d.date}
            x={x(i)}
            y={height - 8}
            fontSize={10}
            fill="#7a6a52"
            textAnchor="middle"
          >
            {shortDate(d.date)}
          </text>
        ) : null
      )}
    </svg>
  );
}

/**
 * Soil water through the season: the share of the reservoir still available,
 * with the stress threshold drawn across it. Irrigations show as upward steps;
 * a line that dips below the threshold band is a day the crop was short.
 */
export function SoilWaterChart({
  balance,
  height = 190,
}: {
  balance: DayBalance[];
  height?: number;
}) {
  if (balance.length === 0) return null;
  const width = 720;
  const padding = { top: 12, right: 12, bottom: 26, left: 40 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const x = (i: number) => padding.left + (i / Math.max(1, balance.length - 1)) * innerW;
  const y = (fraction: number) => padding.top + innerH - fraction * innerH;

  const linePath = balance
    .map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.soilWaterFraction)}`)
    .join(" ");

  // The stress threshold moves with root growth and weather, so it is drawn as a
  // curve rather than a single line.
  const thresholdPath = balance
    .map((d, i) => {
      const fraction = d.tawIn > 0 ? 1 - d.rawIn / d.tawIn : 0;
      return `${i === 0 ? "M" : "L"}${x(i)},${y(fraction)}`;
    })
    .join(" ");

  const labelEvery = Math.max(1, Math.ceil(balance.length / 10));
  const irrigationDays = balance.filter((d) => d.irrigated);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label="Soil water available to the crop through the season"
    >
      <rect
        x={padding.left}
        y={padding.top}
        width={innerW}
        height={innerH}
        fill="#f7f4ef"
        rx={4}
      />
      {[0, 0.25, 0.5, 0.75, 1].map((tv) => (
        <g key={tv}>
          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={y(tv)}
            y2={y(tv)}
            stroke="#ebe3d6"
            strokeWidth={1}
          />
          <text x={4} y={y(tv) + 4} fontSize={10} fill="#7a6a52">
            {Math.round(tv * 100)}%
          </text>
        </g>
      ))}

      {irrigationDays.map((d) => {
        const i = balance.indexOf(d);
        return (
          <line
            key={d.date}
            x1={x(i)}
            x2={x(i)}
            y1={padding.top + innerH}
            y2={padding.top + innerH - 8}
            stroke="#2b8fd6"
            strokeWidth={1.5}
            opacity={0.7}
          />
        );
      })}

      <path
        d={thresholdPath}
        fill="none"
        stroke="#e07b2a"
        strokeWidth={1.5}
        strokeDasharray="5 4"
      />
      <path d={linePath} fill="none" stroke="#2f7d3e" strokeWidth={2} />

      {balance.map((d, i) =>
        i % labelEvery === 0 ? (
          <text
            key={d.date}
            x={x(i)}
            y={height - 8}
            fontSize={10}
            fill="#7a6a52"
            textAnchor="middle"
          >
            {shortDate(d.date)}
          </text>
        ) : null
      )}
    </svg>
  );
}

/** Monthly bars, used for the station's rainfall and reference ETo climatology. */
export function MonthlyBars({
  values,
  labels,
  color = "#2b8fd6",
  unit = "in",
  height = 150,
}: {
  values: number[];
  labels: string[];
  color?: string;
  unit?: string;
  height?: number;
}) {
  const width = 720;
  const padding = { top: 14, right: 8, bottom: 24, left: 34 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const maxY = Math.max(0.1, ...values) * 1.15;
  const barW = (innerW / values.length) * 0.68;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Monthly totals">
      <line
        x1={padding.left}
        x2={width - padding.right}
        y1={padding.top + innerH}
        y2={padding.top + innerH}
        stroke="#ebe3d6"
      />
      <text x={2} y={padding.top + 4} fontSize={10} fill="#7a6a52">
        {maxY.toFixed(1)}
      </text>
      {values.map((v, i) => {
        const h = (v / maxY) * innerH;
        const cx = padding.left + (i + 0.5) * (innerW / values.length);
        return (
          <g key={labels[i]}>
            <rect
              x={cx - barW / 2}
              y={padding.top + innerH - h}
              width={barW}
              height={Math.max(0, h)}
              fill={color}
              rx={2}
            />
            <text
              x={cx}
              y={padding.top + innerH - h - 4}
              fontSize={9}
              fill="#3a3125"
              textAnchor="middle"
            >
              {v >= 10 ? v.toFixed(0) : v.toFixed(2)}
            </text>
            <text x={cx} y={height - 8} fontSize={10} fill="#7a6a52" textAnchor="middle">
              {labels[i]}
            </text>
          </g>
        );
      })}
      <text x={width - padding.right} y={padding.top - 2} fontSize={9} fill="#7a6a52" textAnchor="end">
        {unit}
      </text>
    </svg>
  );
}

/** A horizontal gauge for soil moisture right now. */
export function SoilGauge({ fraction, threshold }: { fraction: number; threshold: number }) {
  const pct = Math.round(fraction * 100);
  const thresholdPct = Math.round(threshold * 100);
  const tone =
    fraction >= threshold ? "bg-leaf-500" : fraction >= threshold * 0.6 ? "bg-alert-500" : "bg-red-600";

  return (
    <div>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-soil-100">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
        <div
          className="absolute top-0 h-full w-0.5 bg-soil-900/60"
          style={{ left: `${thresholdPct}%` }}
          title="Stress threshold"
        />
      </div>
      <p className="mt-1 text-xs text-soil-600">
        {pct}% of the soil reservoir still available. Below {thresholdPct}% the crop starts to
        feel it.
      </p>
    </div>
  );
}
