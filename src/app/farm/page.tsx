"use client";

import Link from "next/link";
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useStore, useToday } from "@/lib/useStore";
import { buildFieldPlan, selectWeek, weekStartOf } from "@/lib/plan/engine";
import { forecastEnsemble } from "@/lib/climate/forecast";
import { getStation, toIsoDate, addDays } from "@/lib/climate/station";
import { getCrop } from "@/lib/agronomy/crops";
import { EtoChart } from "@/components/Charts";
import { roundGallons } from "@/lib/plan/simplify";
import { Loading, NotFoundCard } from "@/components/Loading";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayName(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export default function FarmDashboardPage() {
  return (
    <Suspense fallback={<Loading />}>
      <FarmDashboard />
    </Suspense>
  );
}

function FarmDashboard() {
  const params = useSearchParams();
  const farmId = params.get("id") ?? "";
  const { store, ready } = useStore();
  const today = useToday();

  const farm = store?.farms.find((f) => f.id === farmId) ?? null;

  const weekStart = useMemo(() => (today ? weekStartOf(today) : null), [today]);

  const week = useMemo(() => {
    if (!farm || !weekStart) return [];
    return forecastEnsemble(getStation(farm.stationId), weekStart, 7, {
      members: 200,
      seed: farm.id,
    });
  }, [farm, weekStart]);

  const plans = useMemo(() => {
    if (!farm || !today || !weekStart) return [];
    return farm.fields.map((field) => {
      const plan = buildFieldPlan(farm, field, { referenceDate: today });
      return { field, plan, week: selectWeek(plan, weekStart) };
    });
  }, [farm, today, weekStart]);

  if (!ready || !today || !weekStart) return <Loading />;
  if (!farm) return <NotFoundCard what="farm" />;

  const station = getStation(farm.stationId);
  const weekEtoIn = week.reduce((s, d) => s + d.etoIn, 0);
  const weekRainIn = week.reduce((s, d) => s + d.rainIn, 0);
  const normalEtoIn = week.reduce((s, d) => s + d.normal.etoIn, 0);
  const peakTemp = week.length ? Math.max(...week.map((d) => d.tmaxF)) : 0;
  const anyHeatRisk = week.length ? Math.max(...week.map((d) => d.heatRisk)) : 0;
  const etoDelta = normalEtoIn > 0 ? (weekEtoIn / normalEtoIn - 1) * 100 : 0;
  const farmWeekGallons = plans.reduce((s, p) => s + (p.week?.totalGallons ?? 0), 0);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/" className="text-sm text-soil-600 hover:text-leaf-700">
            ← Farms
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">{farm.name}</h1>
          <p className="text-sm text-soil-600">
            {farm.farmerName} · {station.name} ({station.id}) · {farm.fields.length} field
            {farm.fields.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/field/settings/?farm=${farm.id}`} className="btn-primary">
            Add field
          </Link>
          <Link href={`/farm/settings/?id=${farm.id}`} className="btn-secondary">
            Settings
          </Link>
        </div>
      </header>

      {/* ---------------- Weather week ---------------- */}
      <section className="card p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">This week&apos;s weather</h2>
            <p className="text-sm text-soil-600">
              {toIsoDate(weekStart)} to {toIsoDate(addDays(weekStart, 6))} · from the{" "}
              {station.id} record on Weather Underground
            </p>
          </div>
          <Link href="/climate/" className="text-sm font-semibold text-leaf-700 underline">
            See the full climate record
          </Link>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-4">
          <Stat
            label="Water demand this week"
            value={`${weekEtoIn.toFixed(2)} in`}
            detail={`${etoDelta >= 0 ? "+" : ""}${etoDelta.toFixed(0)}% vs normal`}
            tone={etoDelta > 8 ? "alert" : "neutral"}
          />
          <Stat
            label="Hottest day"
            value={`${Math.round(peakTemp)}°F`}
            detail={
              anyHeatRisk > 0.25
                ? `${Math.round(anyHeatRisk * 100)}% chance of 100°F+`
                : "No extreme heat expected"
            }
            tone={anyHeatRisk > 0.25 ? "alert" : "neutral"}
          />
          <Stat
            label="Expected rain"
            value={`${weekRainIn.toFixed(2)} in`}
            detail={weekRainIn >= 0.1 ? "Enough to affect the schedule" : "Not enough to count on"}
          />
          <Stat
            label="Planned water, whole farm"
            value={`${roundGallons(farmWeekGallons).toLocaleString("en-US")} gal`}
            detail={`${plans.reduce((s, p) => s + (p.week?.events.length ?? 0), 0)} irrigation sets`}
            tone="water"
          />
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-soil-100 text-left text-xs uppercase tracking-wide text-soil-600">
                <th className="py-2 pr-3 font-semibold">Day</th>
                <th className="py-2 pr-3 font-semibold">High</th>
                <th className="py-2 pr-3 font-semibold">Low</th>
                <th className="py-2 pr-3 font-semibold">Humidity</th>
                <th className="py-2 pr-3 font-semibold">Wind</th>
                <th className="py-2 pr-3 font-semibold">Rain chance</th>
                <th className="py-2 pr-3 font-semibold">Water demand</th>
                <th className="py-2 font-semibold">vs normal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-soil-100">
              {week.map((d) => {
                const delta = d.normal.etoIn > 0 ? (d.etoIn / d.normal.etoIn - 1) * 100 : 0;
                return (
                  <tr key={d.date}>
                    <td className="py-2 pr-3 font-medium">
                      {dayName(d.date)} <span className="text-soil-600">{d.date.slice(5)}</span>
                    </td>
                    <td className="py-2 pr-3">
                      {Math.round(d.tmaxF)}°
                      {d.heatRisk > 0.2 ? (
                        <span className="ml-1 text-xs text-alert-600">
                          ({Math.round(d.heatRisk * 100)}% ≥100°)
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">{Math.round(d.tminF)}°</td>
                    <td className="py-2 pr-3">{Math.round(d.humidityPct)}%</td>
                    <td className="py-2 pr-3">{d.windMph.toFixed(1)} mph</td>
                    <td className="py-2 pr-3">
                      {Math.round(d.rainProbability * 100)}%
                      {d.rainIn >= 0.02 ? (
                        <span className="ml-1 text-xs text-water-700">
                          {d.rainIn.toFixed(2)}&quot;
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 font-medium">{d.etoIn.toFixed(3)} in</td>
                    <td
                      className={`py-2 text-xs font-semibold ${
                        delta > 5
                          ? "text-alert-600"
                          : delta < -5
                            ? "text-water-700"
                            : "text-soil-600"
                      }`}
                    >
                      {delta >= 0 ? "+" : ""}
                      {delta.toFixed(0)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-semibold">Daily water demand, with forecast uncertainty</h3>
          <p className="text-xs text-soil-600">
            The line is the most likely value; the band covers the middle 80% of the forecast.
          </p>
          <div className="mt-2">
            <EtoChart days={week} />
          </div>
        </div>
      </section>

      {/* ---------------- Fields ---------------- */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Fields</h2>
        {plans.length === 0 ? (
          <div className="card p-8 text-center text-sm text-soil-600">
            No fields yet.{" "}
            <Link
              href={`/field/settings/?farm=${farm.id}`}
              className="font-semibold text-leaf-700 underline"
            >
              Add one
            </Link>
            .
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {plans.map(({ field, plan, week: fieldWeek }) => {
              const crop = getCrop(field.cropId);
              const events = fieldWeek?.events ?? [];
              return (
                <article key={field.id} className="card flex flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">
                        <Link
                          href={`/field/?farm=${farm.id}&id=${field.id}`}
                          className="hover:text-leaf-700"
                        >
                          {field.name}
                        </Link>
                      </h3>
                      <p className="text-xs text-soil-600">
                        {crop.name} · {field.acres} ac · {plan.soilName} · {plan.systemName}
                      </p>
                    </div>
                    {plan.deficit.applied ? (
                      <span className="pill bg-alert-100 text-alert-700">Rationed</span>
                    ) : null}
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                    <MiniStat label="Sets this week" value={String(events.length)} />
                    <MiniStat
                      label="Water this week"
                      value={`${roundGallons(fieldWeek?.totalGallons ?? 0).toLocaleString("en-US")}`}
                      suffix="gal"
                    />
                    <MiniStat
                      label="Season total"
                      value={plan.season.acreFeetPerAcre.toFixed(2)}
                      suffix="AF/ac"
                    />
                  </div>

                  {events.length > 0 ? (
                    <ul className="mt-4 space-y-1 text-sm">
                      {events.slice(0, 4).map((e) => (
                        <li key={e.date} className="flex justify-between gap-2">
                          <span className="font-medium">
                            {dayName(e.date)} {e.date.slice(5)}
                          </span>
                          <span className="text-soil-600">
                            {e.startTime} for {e.durationHours.toFixed(1)} h
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-4 text-sm text-soil-600">No irrigation scheduled this week.</p>
                  )}

                  <div className="mt-4 flex gap-2 pt-2">
                    <Link
                      href={`/field/?farm=${farm.id}&id=${field.id}`}
                      className="btn-secondary flex-1"
                    >
                      Full plan
                    </Link>
                    <Link
                      href={`/field/print/?farm=${farm.id}&id=${field.id}`}
                      className="btn-water flex-1"
                    >
                      Print week
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "neutral" | "alert" | "water";
}) {
  const toneClass =
    tone === "alert"
      ? "bg-alert-50 border-alert-100"
      : tone === "water"
        ? "bg-water-50 border-water-100"
        : "bg-soil-50 border-soil-100";
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-soil-600">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
      {detail ? <p className="text-xs text-soil-600">{detail}</p> : null}
    </div>
  );
}

function MiniStat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="rounded-lg bg-soil-50 p-2">
      <p className="text-lg font-bold leading-tight">
        {value}
        {suffix ? <span className="text-xs font-medium text-soil-600"> {suffix}</span> : null}
      </p>
      <p className="text-[11px] leading-tight text-soil-600">{label}</p>
    </div>
  );
}
