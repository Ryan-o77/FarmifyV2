import Link from "next/link";
import { notFound } from "next/navigation";
import { getField, listFeedback } from "@/lib/store";
import { buildFieldPlan, weekStartOf } from "@/lib/plan/engine";
import { simplifyWeek } from "@/lib/plan/simplify";
import { describeCalibration } from "@/lib/feedback";
import { getCrop } from "@/lib/agronomy/crops";
import { getSoil, totalAvailableWater, readilyAvailableWater } from "@/lib/agronomy/soils";
import { toIsoDate, parseIsoDate } from "@/lib/climate/station";
import { SoilWaterChart, EtoChart, SoilGauge } from "@/components/Charts";
import { SimplePlanCard } from "@/components/SimplePlanCard";
import { FeedbackForm } from "@/components/FeedbackForm";
import { t } from "@/lib/plan/i18n";

export const dynamic = "force-dynamic";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const STAGE_LABELS: Record<string, string> = {
  dormant: "Dormant",
  initial: "Early season",
  development: "Canopy development",
  mid: "Peak growth",
  late: "Late season",
};

export default async function FieldPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ farmId: string; fieldId: string }>;
  searchParams: Promise<{ week?: string; saved?: string }>;
}) {
  const { farmId, fieldId } = await params;
  const { week: weekParam, saved } = await searchParams;

  const found = await getField(farmId, fieldId);
  if (!found) notFound();
  const { farm, field } = found;

  const today = new Date();
  const plan = buildFieldPlan(farm, field, { referenceDate: today });
  const feedback = await listFeedback(farmId, fieldId);
  const crop = getCrop(field.cropId);
  const soil = getSoil(field.soilId);

  // Which week are we looking at? Default to the current one, falling back to
  // the first week of the season when the season has not started yet.
  const defaultWeek = toIsoDate(
    weekStartOf(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())))
  );
  const weeksWithWater = plan.weeks.filter((w) => w.events.length > 0);
  const activeWeekStart =
    weekParam ??
    (plan.weeks.some((w) => w.weekStart === defaultWeek)
      ? defaultWeek
      : (weeksWithWater[0]?.weekStart ?? plan.weeks[0]?.weekStart));
  const activeWeek =
    plan.weeks.find((w) => w.weekStart === activeWeekStart) ?? plan.weeks[0] ?? null;

  const weekIndex = activeWeek ? plan.weeks.indexOf(activeWeek) : -1;
  const prevWeek = weekIndex > 0 ? plan.weeks[weekIndex - 1] : null;
  const nextWeek = weekIndex >= 0 && weekIndex < plan.weeks.length - 1 ? plan.weeks[weekIndex + 1] : null;

  const simple = activeWeek ? simplifyWeek(plan, activeWeek, farm.language) : null;

  // Soil state today, for the gauge.
  const todayIso = toIsoDate(today);
  const todayBalance =
    plan.balance.find((b) => b.date === todayIso) ?? plan.balance[plan.balance.length - 1];

  const tawNow = totalAvailableWater(soil, crop.rootDepthM, field.restrictiveLayerDepthFt);
  const rawNow = readilyAvailableWater(
    soil,
    crop.rootDepthM,
    crop.depletionFraction,
    field.restrictiveLayerDepthFt
  );

  const weekEnsemble = activeWeek
    ? plan.ensemble.filter(
        (d) => d.date >= activeWeek.weekStart && d.date <= activeWeek.weekEnd
      )
    : [];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/farms/${farmId}`} className="text-sm text-soil-600 hover:text-leaf-700">
            ← {farm.name}
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">{field.name}</h1>
          <p className="text-sm text-soil-600">
            {plan.cropName} · {field.acres} acres · {plan.soilName} · {plan.systemName} ·{" "}
            {plan.stationName}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/farms/${farmId}/fields/${fieldId}/print${
              activeWeek ? `?week=${activeWeek.weekStart}` : ""
            }`}
            className="btn-water"
          >
            Print / save PDF
          </Link>
          <Link href={`/farms/${farmId}/fields/${fieldId}/edit`} className="btn-secondary">
            Edit field
          </Link>
        </div>
      </header>

      {saved ? (
        <div className="rounded-lg border border-leaf-200 bg-leaf-50 px-4 py-3 text-sm text-leaf-900">
          Thank you — your report was recorded and the plan below has already been adjusted.
        </div>
      ) : null}

      {plan.warnings.length > 0 ? (
        <section className="card border-alert-100 bg-alert-50 p-5">
          <h2 className="text-sm font-semibold text-alert-700">Worth knowing</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-soil-900">
            {plan.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ---------------- Week navigation ---------------- */}
      {activeWeek ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Week of {activeWeek.weekStart} to {activeWeek.weekEnd}
          </h2>
          <div className="flex gap-2">
            {prevWeek ? (
              <Link
                href={`/farms/${farmId}/fields/${fieldId}?week=${prevWeek.weekStart}`}
                className="btn-secondary"
              >
                ← Previous week
              </Link>
            ) : null}
            {nextWeek ? (
              <Link
                href={`/farms/${farmId}/fields/${fieldId}?week=${nextWeek.weekStart}`}
                className="btn-secondary"
              >
                Next week →
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ---------------- Simple summary ---------------- */}
      {simple ? <SimplePlanCard summary={simple} /> : null}

      {/* ---------------- Detailed schedule ---------------- */}
      {activeWeek && activeWeek.events.length > 0 ? (
        <section className="card p-6">
          <h2 className="text-lg font-semibold">The detailed schedule</h2>
          <p className="mt-1 text-sm text-soil-600">
            Times are local. Amounts are what the pump delivers over the whole field, including
            the water lost to evaporation, drift and uneven coverage.
          </p>

          <div className="mt-5 space-y-4">
            {activeWeek.events.map((event) => (
              <article
                key={event.date}
                className="rounded-lg border border-soil-100 bg-soil-50/50 p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold">
                    {DAY_NAMES[event.weekday]}, {event.date}
                  </h3>
                  <span className="pill bg-water-100 text-water-700">
                    {event.startTime} – {event.endTime}
                  </span>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <Detail label="Run time" value={`${event.durationHours.toFixed(1)} hours`} />
                  <Detail
                    label="Applied depth"
                    value={`${event.grossDepthIn.toFixed(2)} in`}
                    detail={`${event.netDepthIn.toFixed(2)} in reaches the roots`}
                  />
                  <Detail
                    label="Volume"
                    value={`${Math.round(event.gallons).toLocaleString("en-US")} gal`}
                    detail={`${Math.round(event.gallonsPerAcre).toLocaleString("en-US")} gal/acre`}
                  />
                  <Detail
                    label="Soil at start"
                    value={`${Math.round(event.depletionAtStartPct)}% depleted`}
                  />
                </dl>

                {event.cycles.length > 1 ? (
                  <div className="mt-3 rounded border border-alert-100 bg-alert-50 p-3 text-sm">
                    <p className="font-semibold text-alert-700">
                      Run in {event.cycles.length} cycles with {event.soakMinutesBetweenCycles}{" "}
                      minutes of soak between them
                    </p>
                    <ul className="mt-1 space-y-0.5 text-soil-900">
                      {event.cycles.map((c, i) => (
                        <li key={c.startTime}>
                          Cycle {i + 1}: {c.startTime} – {c.endTime} (
                          {(c.durationHours * 60).toFixed(0)} min)
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <p className="mt-3 text-sm text-soil-600">{event.reason}</p>
              </article>
            ))}
          </div>

          <div className="mt-5 grid gap-3 border-t border-soil-100 pt-4 text-sm sm:grid-cols-4">
            <Detail
              label="Water this week"
              value={`${Math.round(activeWeek.totalGallons).toLocaleString("en-US")} gal`}
            />
            <Detail label="Applied depth" value={`${activeWeek.totalGrossInches.toFixed(2)} in`} />
            <Detail label="Crop will use" value={`${activeWeek.etcInches.toFixed(2)} in`} />
            <Detail
              label="Rain expected"
              value={`${activeWeek.rainInches.toFixed(2)} in`}
              detail={`${Math.round(activeWeek.rainChance * 100)}% chance of a wet day`}
            />
          </div>
        </section>
      ) : activeWeek ? (
        <section className="card p-6">
          <h2 className="text-lg font-semibold">No irrigation this week</h2>
          <p className="mt-1 text-sm text-soil-600">
            {crop.perennial && plan.balance.find((b) => b.date === activeWeek.weekStart)?.stage === "dormant"
              ? "The crop is dormant. Water use is close to zero until leaf-out."
              : "The soil still holds enough water to carry the crop through this week."}
          </p>
        </section>
      ) : null}

      {/* ---------------- Weather behind the plan ---------------- */}
      {weekEnsemble.length > 0 ? (
        <section className="card p-6">
          <h2 className="text-lg font-semibold">The weather this plan assumes</h2>
          <p className="mt-1 text-sm text-soil-600">
            Built from the {plan.stationId} record. The band is the range the forecast could
            plausibly land in; a hot week near the top of it means an extra set may be needed.
          </p>
          <div className="mt-3">
            <EtoChart days={weekEnsemble} />
          </div>
        </section>
      ) : null}

      {/* ---------------- Soil water through the season ---------------- */}
      <section className="card p-6">
        <h2 className="text-lg font-semibold">Soil water through the season</h2>
        <p className="mt-1 text-sm text-soil-600">
          Green is the water available to the crop. The dashed orange line is the point below
          which the crop starts to feel short. Blue ticks along the bottom are irrigations.
        </p>
        <div className="mt-3">
          <SoilWaterChart balance={plan.balance} />
        </div>

        {todayBalance ? (
          <div className="mt-5 max-w-md">
            <h3 className="text-sm font-semibold">Where the soil is now</h3>
            <div className="mt-2">
              <SoilGauge
                fraction={todayBalance.soilWaterFraction}
                threshold={todayBalance.tawIn > 0 ? 1 - todayBalance.rawIn / todayBalance.tawIn : 0}
              />
            </div>
          </div>
        ) : null}
      </section>

      {/* ---------------- Season summary ---------------- */}
      <section className="card p-6">
        <h2 className="text-lg font-semibold">The season</h2>
        <p className="mt-1 text-sm text-soil-600">
          {plan.season.startDate} to {plan.season.endDate} · {STAGE_LABELS[todayBalance?.stage ?? "mid"]}{" "}
          right now
        </p>

        <dl className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Detail label="Reference ET" value={`${plan.season.etoIn.toFixed(1)} in`} detail="Grass reference" />
          <Detail
            label="Crop will use"
            value={`${plan.season.etcIn.toFixed(1)} in`}
            detail="Full demand, no shortage"
          />
          <Detail
            label="Rain"
            value={`${plan.season.rainIn.toFixed(1)} in`}
            detail={`${plan.season.effectiveRainIn.toFixed(1)} in reaches the roots`}
          />
          <Detail
            label="Irrigation needed"
            value={`${plan.season.grossIrrigationIn.toFixed(1)} in`}
            detail={`${plan.season.acreFeetPerAcre.toFixed(2)} acre-feet per acre`}
          />
          <Detail
            label="Total volume"
            value={`${plan.season.acreFeet.toFixed(1)} AF`}
            detail={`${Math.round(plan.season.totalGallons).toLocaleString("en-US")} gal`}
          />
          <Detail label="Irrigations" value={String(plan.season.irrigationCount)} />
          <Detail
            label="Average interval"
            value={`${plan.season.averageIntervalDays.toFixed(1)} days`}
          />
          <Detail
            label="Application rate"
            value={`${plan.applicationRateInPerHr.toFixed(3)} in/hr`}
            detail={
              field.applicationRateInPerHr
                ? "Measured"
                : field.emitter
                  ? "From emitter layout"
                  : "Typical for this system"
            }
          />
        </dl>

        {plan.deficit.applied ? (
          <div className="mt-5 rounded-lg border border-alert-100 bg-alert-50 p-4">
            <h3 className="text-sm font-semibold text-alert-700">
              Rationing plan — {Math.round(plan.deficit.deliveryRatio * 100)}% of full water
            </h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {plan.deficit.strategy.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <p className="mt-3 text-sm font-semibold">
              Estimated yield: about {Math.round(plan.deficit.estimatedRelativeYield * 100)}% of a
              fully watered crop.
            </p>
            <p className="mt-1 text-xs text-soil-600">
              Estimated with the FAO-33 yield response relation, applied stage by stage. Treat it
              as a comparison between options, not a forecast of your cheque.
            </p>
          </div>
        ) : null}

        <div className="mt-5 rounded-lg bg-soil-50 p-4 text-sm">
          <h3 className="font-semibold">About this crop</h3>
          <p className="mt-1 text-soil-600">{crop.notes}</p>
          <p className="mt-2 text-soil-600">
            Root zone holds about {tawNow.toFixed(1)} in of usable water, of which{" "}
            {rawNow.toFixed(1)} in can be spent before the crop feels it. {soil.description}
          </p>
        </div>
      </section>

      {/* ---------------- Feedback ---------------- */}
      <section className="card p-6">
        <h2 className="text-lg font-semibold">Tell Farmify how it went</h2>
        <p className="mt-1 max-w-2xl text-sm text-soil-600">
          {t(farm.language, "plan.feedbackAsk")}
        </p>
        <p className="mt-2 max-w-2xl text-sm font-medium text-leaf-700">
          {describeCalibration(field.calibration)}
        </p>

        <div className="mt-5">
          <FeedbackForm farmId={farmId} fieldId={fieldId} language={farm.language} />
        </div>

        {feedback.length > 0 ? (
          <div className="mt-6 border-t border-soil-100 pt-4">
            <h3 className="text-sm font-semibold">Past reports</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {feedback.slice(0, 8).map((f) => (
                <li key={f.id} className="flex flex-wrap items-baseline gap-2">
                  <span className="font-medium">{f.date}</span>
                  <span className="pill bg-soil-100 text-soil-600">
                    {t(farm.language, `feedback.${feedbackKeySuffix(f.kind)}` as never)}
                  </span>
                  {f.applied ? (
                    <span className="text-xs text-soil-600">
                      water use {formatDelta(f.applied.demandFactorBefore, f.applied.demandFactorAfter)}, run
                      time {formatDelta(f.applied.applicationFactorAfter, f.applied.applicationFactorBefore)}
                    </span>
                  ) : null}
                  {f.comment ? <span className="text-soil-600">“{f.comment}”</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function feedbackKeySuffix(kind: string): string {
  switch (kind) {
    case "too-wet":
      return "tooWet";
    case "too-dry":
      return "tooDry";
    case "just-right":
      return "justRight";
    case "runoff":
      return "runoff";
    case "cannot-run-schedule":
      return "cannotRun";
    default:
      return "systemProblem";
  }
}

function formatDelta(before: number, after: number): string {
  const pct = ((after - before) / before) * 100;
  if (Math.abs(pct) < 0.5) return "unchanged";
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function Detail({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-soil-600">{label}</dt>
      <dd className="text-base font-bold">{value}</dd>
      {detail ? <dd className="text-xs text-soil-600">{detail}</dd> : null}
    </div>
  );
}
