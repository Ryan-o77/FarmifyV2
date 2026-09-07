import { stations, provenance, getBiasFactors, climateTotals } from "@/lib/climate/station";
import { MonthlyBars } from "@/components/Charts";

export const dynamic = "force-static";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function ClimatePage() {
  const year = new Date().getUTCFullYear();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">The climate record</h1>
        <p className="mt-1 max-w-3xl text-sm text-soil-600">
          Every irrigation number in Farmify traces back to these tables. They come from the
          Weather Underground monthly history pages for three first-order San Joaquin Valley
          stations, and are converted into daily reference evapotranspiration by the FAO-56
          Penman-Monteith method.
        </p>
      </header>

      <section className="card p-6">
        <h2 className="text-lg font-semibold">Where the data comes from</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex flex-wrap gap-2">
            <dt className="w-40 shrink-0 font-medium text-soil-600">Source</dt>
            <dd>
              <a
                className="underline hover:text-leaf-700"
                href={String(provenance.primarySourceUrl)}
                target="_blank"
                rel="noreferrer"
              >
                {String(provenance.primarySource)}
              </a>
            </dd>
          </div>
          <div className="flex flex-wrap gap-2">
            <dt className="w-40 shrink-0 font-medium text-soil-600">Underlying network</dt>
            <dd>{String(provenance.underlyingNetwork)}</dd>
          </div>
          <div className="flex flex-wrap gap-2">
            <dt className="w-40 shrink-0 font-medium text-soil-600">Normals period</dt>
            <dd>{String(provenance.normalsPeriod)}</dd>
          </div>
          <div className="flex flex-wrap gap-2">
            <dt className="w-40 shrink-0 font-medium text-soil-600">Last refreshed</dt>
            <dd>
              {provenance.lastRefreshed
                ? String(provenance.lastRefreshed).slice(0, 10)
                : `Not refreshed from the live API yet (transcribed ${String(provenance.lastTranscribed)})`}
            </dd>
          </div>
        </dl>
        <p className="mt-3 rounded-lg bg-soil-50 p-3 text-xs leading-relaxed text-soil-600">
          {String(provenance.note)}
        </p>
      </section>

      {stations.map((station) => {
        const totals = climateTotals(
          station,
          new Date(Date.UTC(year, 0, 1)),
          new Date(Date.UTC(year, 11, 31))
        );
        const bias = getBiasFactors(station);
        return (
          <section key={station.id} className="card p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">
                  {station.id} — {station.name}
                </h2>
                <p className="text-sm text-soil-600">
                  {station.region} · {station.latitude.toFixed(2)}°N,{" "}
                  {Math.abs(station.longitude).toFixed(2)}°W · {station.elevationM} m ·{" "}
                  {station.referenceEtoNormals.zoneName}
                </p>
              </div>
              <a
                className="text-sm font-semibold text-leaf-700 underline"
                href={`https://www.wunderground.com/history/monthly/${station.wundergroundPath}`}
                target="_blank"
                rel="noreferrer"
              >
                View on Weather Underground
              </a>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <Stat label="Annual rainfall" value={`${totals.rainIn.toFixed(2)} in`} />
              <Stat
                label="Annual reference ET"
                value={`${totals.etoIn.toFixed(1)} in`}
                detail={`CIMIS zone normal: ${station.referenceEtoNormals.annualIn.toFixed(1)} in`}
              />
              <Stat
                label="Water deficit"
                value={`${(totals.etoIn - totals.rainIn).toFixed(1)} in`}
                detail="What irrigation has to make up across a full year"
              />
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-soil-100 text-left text-xs uppercase tracking-wide text-soil-600">
                    <th className="py-2 pr-3 font-semibold">Month</th>
                    <th className="py-2 pr-3 font-semibold">Avg high</th>
                    <th className="py-2 pr-3 font-semibold">Avg low</th>
                    <th className="py-2 pr-3 font-semibold">Dew point</th>
                    <th className="py-2 pr-3 font-semibold">Humidity</th>
                    <th className="py-2 pr-3 font-semibold">Wind</th>
                    <th className="py-2 pr-3 font-semibold">Rain</th>
                    <th className="py-2 pr-3 font-semibold">Wet days</th>
                    <th className="py-2 pr-3 font-semibold">Reference ET</th>
                    <th className="py-2 font-semibold">Bias factor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-soil-100">
                  {station.monthly.map((m, i) => (
                    <tr key={m.month}>
                      <td className="py-1.5 pr-3 font-medium">{MONTHS[i]}</td>
                      <td className="py-1.5 pr-3">{m.tmaxF.toFixed(1)}°F</td>
                      <td className="py-1.5 pr-3">{m.tminF.toFixed(1)}°F</td>
                      <td className="py-1.5 pr-3">{m.dewpointF.toFixed(1)}°F</td>
                      <td className="py-1.5 pr-3">{m.humidityPct}%</td>
                      <td className="py-1.5 pr-3">{m.windMph.toFixed(1)} mph</td>
                      <td className="py-1.5 pr-3">{m.precipIn.toFixed(2)}″</td>
                      <td className="py-1.5 pr-3">{m.precipDays.toFixed(1)}</td>
                      <td className="py-1.5 pr-3 font-medium">
                        {station.referenceEtoNormals.monthlyIn[i].toFixed(2)}″
                      </td>
                      <td className="py-1.5 text-xs text-soil-600">{bias[i].toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold">Monthly rainfall (inches)</h3>
                <MonthlyBars
                  values={station.monthly.map((m) => m.precipIn)}
                  labels={MONTHS}
                  color="#2b8fd6"
                />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Monthly reference ET (inches)</h3>
                <MonthlyBars
                  values={station.referenceEtoNormals.monthlyIn}
                  labels={MONTHS}
                  color="#e07b2a"
                />
              </div>
            </div>

            <p className="mt-4 rounded-lg bg-soil-50 p-3 text-xs leading-relaxed text-soil-600">
              <strong>Bias factor</strong> is the multiplier applied to raw Penman-Monteith run on
              this station&apos;s observations so that seasonal totals agree with the CIMIS
              reference network. {station.referenceEtoNormals.note}
            </p>
          </section>
        );
      })}
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-soil-100 bg-soil-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-soil-600">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
      {detail ? <p className="text-xs text-soil-600">{detail}</p> : null}
    </div>
  );
}
