import type { SimpleSummary } from "@/lib/plan/simplify";
import { LANGUAGES } from "@/lib/types";
import { t } from "@/lib/plan/i18n";

/**
 * The plain-language plan.
 *
 * Large type, one instruction per row, and the three numbers that matter --
 * which day, what time, how long -- given the most visual weight on the card.
 * Everything technical stays on the detailed schedule below it.
 */
export function SimplePlanCard({ summary }: { summary: SimpleSummary }) {
  const languageLabel =
    LANGUAGES.find((l) => l.code === summary.language)?.endonym ?? summary.language;

  return (
    <section className="card overflow-hidden" lang={summary.language}>
      <header className="flex flex-wrap items-baseline justify-between gap-2 bg-leaf-600 px-6 py-4 text-white">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-leaf-100">
            {t(summary.language, "plan.thisWeek")}
          </p>
          <h2 className="text-2xl font-bold">{summary.headline}</h2>
        </div>
        <span className="pill bg-white/20 text-white">{languageLabel}</span>
      </header>

      <div className="space-y-4 p-6">
        {summary.limitLine ? (
          <p className="rounded-lg bg-alert-50 px-4 py-3 text-base font-semibold text-alert-700">
            {summary.limitLine}
          </p>
        ) : null}

        {summary.steps.length === 0 ? (
          <p className="text-lg">{summary.headline}</p>
        ) : (
          <ol className="space-y-3">
            {summary.steps.map((step, idx) => (
              <li
                key={step.date}
                className="print-step rounded-lg border-2 border-water-200 bg-water-50 p-4"
              >
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-water-600 text-base font-bold text-white">
                    {idx + 1}
                  </span>
                  <span className="text-xl font-bold">{step.weekdayName}</span>
                  <span className="text-sm text-soil-600">{step.date}</span>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <Big
                    label={t(summary.language, "plan.startAt")}
                    value={step.startTimeLabel}
                  />
                  <Big
                    label={t(summary.language, "plan.runFor")}
                    value={step.durationLabel}
                  />
                  <Big
                    label={t(summary.language, "plan.amount")}
                    value={step.gallonsLabel}
                  />
                </div>

                {step.cycleNote ? (
                  <p className="mt-3 rounded bg-alert-50 px-3 py-2 text-base font-semibold text-alert-700">
                    {step.cycleNote}
                  </p>
                ) : null}

                <p className="mt-2 text-base text-soil-600">{step.why}</p>
              </li>
            ))}
          </ol>
        )}

        <div className="space-y-2 rounded-lg bg-soil-50 p-4 text-base">
          <p className="font-semibold">{t(summary.language, "plan.weather")}</p>
          <p>{summary.weatherLine}</p>
          <p>{summary.rainLine}</p>
          {summary.steps.length > 0 ? <p className="font-semibold">{summary.totalLine}</p> : null}
        </div>

        <div className="space-y-2 rounded-lg border border-leaf-200 bg-leaf-50 p-4 text-base">
          <p>{summary.checkLine}</p>
          {summary.watchLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </div>
    </section>
  );
}

function Big({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-soil-600">{label}</p>
      <p className="text-2xl font-bold leading-tight text-water-700">{value}</p>
    </div>
  );
}
