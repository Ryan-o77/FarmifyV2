"use client";

import Link from "next/link";
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useStore, useToday } from "@/lib/useStore";
import { buildFieldPlan, weekStartOf } from "@/lib/plan/engine";
import { simplifyWeek } from "@/lib/plan/simplify";
import { toIsoDate } from "@/lib/climate/station";
import { t } from "@/lib/plan/i18n";
import { PrintButton } from "@/components/PrintButton";
import { Loading, NotFoundCard } from "@/components/Loading";

/**
 * The printable weekly plan.
 *
 * This is the artefact that leaves the screen: taped inside a pump house, handed
 * to an irrigator at the start of a shift, or filed as the record of what was
 * applied. It is one page where possible, uses the farm's language for the
 * instructions, and repeats the technical detail underneath in English so an
 * agronomist or a district can check the numbers.
 *
 * "Save as PDF" in the browser's print dialog is what produces the PDF. That is a
 * deliberate choice over generating one in code: it needs no dependency, it
 * prints exactly what is on screen, and it works with no network at all.
 */
export default function PrintPlanPage() {
  return (
    <Suspense fallback={<Loading />}>
      <PrintPlan />
    </Suspense>
  );
}

function PrintPlan() {
  const params = useSearchParams();
  const farmId = params.get("farm") ?? "";
  const fieldId = params.get("id") ?? "";
  const weekParam = params.get("week");

  const { store, ready } = useStore();
  const today = useToday();

  const farm = store?.farms.find((f) => f.id === farmId) ?? null;
  const field = farm?.fields.find((f) => f.id === fieldId) ?? null;

  const plan = useMemo(() => {
    if (!farm || !field || !today) return null;
    return buildFieldPlan(farm, field, { referenceDate: today });
  }, [farm, field, today]);

  if (!ready || !today) return <Loading label="Building the plan…" />;
  if (!farm) return <NotFoundCard what="farm" />;
  if (!field || !plan) {
    return <NotFoundCard what="field" backHref={`/farm/?id=${farmId}`} backLabel="Back to farm" />;
  }

  const defaultWeek = toIsoDate(weekStartOf(today));
  const weeksWithWater = plan.weeks.filter((w) => w.events.length > 0);
  const activeWeekStart =
    weekParam ??
    (plan.weeks.some((w) => w.weekStart === defaultWeek)
      ? defaultWeek
      : (weeksWithWater[0]?.weekStart ?? plan.weeks[0]?.weekStart));
  const week = plan.weeks.find((w) => w.weekStart === activeWeekStart) ?? plan.weeks[0];

  if (!week) {
    return <NotFoundCard what="week" backHref={`/farm/?id=${farmId}`} backLabel="Back to farm" />;
  }

  const simple = simplifyWeek(plan, week, farm.language);
  const tr = (key: string) => t(farm.language, key as never);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/field/?farm=${farm.id}&id=${field.id}&week=${week.weekStart}`}
          className="text-sm text-soil-600 hover:text-leaf-700"
        >
          ← Back to the plan
        </Link>
        <div className="flex items-center gap-2">
          <PrintButton />
          <span className="text-xs text-soil-600">
            Choose &ldquo;Save as PDF&rdquo; in the print dialog to keep a copy.
          </span>
        </div>
      </div>

      <article className="card p-8 print:border-0 print:p-0 print:shadow-none">
        {/* ---- Masthead ---- */}
        <header className="border-b-2 border-soil-900 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div lang={farm.language}>
              <h1 className="text-2xl font-bold">{tr("plan.printTitle")}</h1>
              <p className="text-sm text-soil-600">
                {tr("plan.preparedFor")}: <strong>{farm.farmerName}</strong> — {farm.name}
              </p>
            </div>
            <div className="text-right text-sm">
              <p className="font-semibold">
                {week.weekStart} → {week.weekEnd}
              </p>
              <p className="text-soil-600">
                {tr("plan.field")}: {field.name}
              </p>
              <p className="text-soil-600">
                {tr("plan.crop")}: {plan.cropName} · {field.acres} ac
              </p>
            </div>
          </div>
        </header>

        {/* ---- The instructions, in the farm's language ---- */}
        <section className="mt-6" lang={farm.language}>
          <h2 className="text-xl font-bold">{simple.headline}</h2>

          {simple.limitLine ? (
            <p className="mt-2 border-l-4 border-alert-500 bg-alert-50 px-3 py-2 text-base font-semibold">
              {simple.limitLine}
            </p>
          ) : null}

          {simple.steps.length > 0 ? (
            <table className="mt-4 w-full border-collapse text-left">
              <thead>
                <tr className="border-b-2 border-soil-900">
                  <th className="py-2 pr-2 text-sm font-bold">{tr("plan.day")}</th>
                  <th className="py-2 pr-2 text-sm font-bold">{tr("plan.startAt")}</th>
                  <th className="py-2 pr-2 text-sm font-bold">{tr("plan.duration")}</th>
                  <th className="py-2 text-sm font-bold">{tr("plan.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {simple.steps.map((step) => (
                  <tr key={step.date} className="print-step border-b border-soil-100 align-top">
                    <td className="py-3 pr-2">
                      <span className="block text-lg font-bold">{step.weekdayName}</span>
                      <span className="text-xs text-soil-600">{step.date}</span>
                    </td>
                    <td className="py-3 pr-2 text-lg font-bold">{step.startTimeLabel}</td>
                    <td className="py-3 pr-2 text-lg font-bold">{step.durationLabel}</td>
                    <td className="py-3">
                      <span className="block text-lg font-bold">{step.gallonsLabel}</span>
                      {step.cycleNote ? (
                        <span className="mt-1 block text-xs font-semibold text-alert-700">
                          {step.cycleNote}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          <div className="mt-4 space-y-1 text-base">
            <p className="font-semibold">{simple.totalLine}</p>
            <p>{simple.weatherLine}</p>
            <p>{simple.rainLine}</p>
          </div>

          <div className="mt-4 border-2 border-soil-900 p-3 text-base">
            <p className="font-bold">{tr("plan.checkSoil")}</p>
            {simple.watchLines.map((line) => (
              <p key={line} className="mt-1">
                {line}
              </p>
            ))}
          </div>

          {/* A place to write on the printed page: the plan becomes the record. */}
          <div className="mt-4">
            <p className="text-sm font-semibold">{tr("plan.feedbackAsk")}</p>
            <table className="mt-2 w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border border-soil-600 bg-soil-50 p-1 text-left">
                    {tr("plan.day")}
                  </th>
                  <th className="border border-soil-600 bg-soil-50 p-1 text-left">
                    {tr("plan.time")}
                  </th>
                  <th className="border border-soil-600 bg-soil-50 p-1 text-left">
                    {tr("feedback.tooWet")} / {tr("feedback.justRight")} / {tr("feedback.tooDry")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {(simple.steps.length > 0 ? simple.steps : [null, null, null]).map((step, i) => (
                  <tr key={step?.date ?? `blank-${i}`}>
                    <td className="border border-soil-600 p-2">{step?.weekdayName ?? ""}</td>
                    <td className="border border-soil-600 p-2">{step?.startTimeLabel ?? ""}</td>
                    <td className="border border-soil-600 p-2">&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ---- Technical detail, always in English ---- */}
        <section className="mt-8 border-t-2 border-soil-900 pt-4 text-sm">
          <h2 className="text-base font-bold">Technical detail</h2>
          <p className="text-xs text-soil-600">
            For the farm office, the agronomist or the water district.
          </p>

          <table className="mt-3 w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-soil-900">
                <th className="py-1 pr-2 font-semibold">Date</th>
                <th className="py-1 pr-2 font-semibold">Start–End</th>
                <th className="py-1 pr-2 font-semibold">Hours</th>
                <th className="py-1 pr-2 font-semibold">Gross in</th>
                <th className="py-1 pr-2 font-semibold">Net in</th>
                <th className="py-1 pr-2 font-semibold">Gallons</th>
                <th className="py-1 font-semibold">Depletion at start</th>
              </tr>
            </thead>
            <tbody>
              {week.events.map((e) => (
                <tr key={e.date} className="border-b border-soil-100">
                  <td className="py-1 pr-2">{e.date}</td>
                  <td className="py-1 pr-2">
                    {e.startTime}–{e.endTime}
                  </td>
                  <td className="py-1 pr-2">{e.durationHours.toFixed(2)}</td>
                  <td className="py-1 pr-2">{e.grossDepthIn.toFixed(3)}</td>
                  <td className="py-1 pr-2">{e.netDepthIn.toFixed(3)}</td>
                  <td className="py-1 pr-2">{Math.round(e.gallons).toLocaleString("en-US")}</td>
                  <td className="py-1">{Math.round(e.depletionAtStartPct)}% of RAW</td>
                </tr>
              ))}
            </tbody>
          </table>

          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
            <Row label="Soil" value={plan.soilName} />
            <Row label="System" value={plan.systemName} />
            <Row
              label="Application rate"
              value={`${plan.applicationRateInPerHr.toFixed(3)} in/hr`}
            />
            <Row label="Week ETc" value={`${week.etcInches.toFixed(2)} in`} />
            <Row label="Week rain" value={`${week.rainInches.toFixed(2)} in`} />
            <Row label="Peak temperature" value={`${Math.round(week.peakTempF)} °F`} />
            <Row label="Season ETc" value={`${plan.season.etcIn.toFixed(1)} in`} />
            <Row
              label="Season applied"
              value={`${plan.season.grossIrrigationIn.toFixed(1)} in (${plan.season.acreFeetPerAcre.toFixed(2)} AF/ac)`}
            />
            <Row
              label="Rationing"
              value={
                plan.deficit.applied
                  ? `${Math.round(plan.deficit.deliveryRatio * 100)}% of full demand; est. ${Math.round(
                      plan.deficit.estimatedRelativeYield * 100
                    )}% yield`
                  : "None — full demand met"
              }
            />
          </dl>

          <p className="mt-4 text-[10px] leading-relaxed text-soil-600">
            Reference evapotranspiration by FAO-56 Penman-Monteith from the {plan.stationId} (
            {plan.stationName}) record published by Weather Underground, bias-corrected to the
            CIMIS reference network. Crop coefficients follow FAO-56 with California extension
            values for San Joaquin Valley plantings. Printed{" "}
            {new Date().toISOString().slice(0, 10)}.
          </p>
        </section>
      </article>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-soil-100 py-0.5">
      <dt className="text-soil-600">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  );
}
