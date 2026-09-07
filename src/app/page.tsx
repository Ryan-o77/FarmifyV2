import Link from "next/link";
import { listFarms } from "@/lib/store";
import { buildFieldPlan } from "@/lib/plan/engine";
import { todayLine } from "@/lib/plan/simplify";
import { getStation, toIsoDate } from "@/lib/climate/station";
import { getCrop } from "@/lib/agronomy/crops";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const farms = await listFarms();
  const today = new Date();
  const todayIso = toIsoDate(today);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold tracking-tight">Farms</h1>
        <p className="mt-1 max-w-2xl text-sm text-soil-600">
          Every field gets its own irrigation plan, built from the crop, the soil, the
          irrigation system and the weather record at the nearest station. Open a farm to see
          this week&apos;s schedule.
        </p>
      </section>

      {farms.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-soil-600">No farms yet.</p>
          <Link href="/farms/new" className="btn-primary mt-4">
            Add the first farm
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          {farms.map((farm) => {
            const station = getStation(farm.stationId);
            return (
              <section key={farm.id} className="card overflow-hidden">
                <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-soil-100 bg-soil-50/60 px-5 py-3">
                  <div>
                    <h2 className="text-lg font-semibold">
                      <Link href={`/farms/${farm.id}`} className="hover:text-leaf-700">
                        {farm.name}
                      </Link>
                    </h2>
                    <p className="text-xs text-soil-600">
                      {farm.farmerName} · {station.name}
                    </p>
                  </div>
                  <Link href={`/farms/${farm.id}`} className="btn-secondary">
                    Open dashboard
                  </Link>
                </header>

                {farm.fields.length === 0 ? (
                  <div className="px-5 py-6 text-sm text-soil-600">
                    No fields yet.{" "}
                    <Link
                      href={`/farms/${farm.id}/fields/new`}
                      className="font-semibold text-leaf-700 underline"
                    >
                      Add a field
                    </Link>{" "}
                    to get a plan.
                  </div>
                ) : (
                  <ul className="divide-y divide-soil-100">
                    {farm.fields.map((field) => {
                      const plan = buildFieldPlan(farm, field, { referenceDate: today });
                      const line = todayLine(plan, todayIso, farm.language);
                      const crop = getCrop(field.cropId);
                      return (
                        <li
                          key={field.id}
                          className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                        >
                          <div className="min-w-0">
                            <Link
                              href={`/farms/${farm.id}/fields/${field.id}`}
                              className="font-semibold hover:text-leaf-700"
                            >
                              {field.name}
                            </Link>
                            <p className="text-xs text-soil-600">
                              {crop.name} · {field.acres} acres · {plan.systemName}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span
                              className={`pill ${
                                line.water
                                  ? "bg-water-100 text-water-700"
                                  : "bg-soil-100 text-soil-600"
                              }`}
                            >
                              {line.text}
                            </span>
                            <Link
                              href={`/farms/${farm.id}/fields/${field.id}/print`}
                              className="text-xs font-semibold text-leaf-700 underline"
                            >
                              Print week
                            </Link>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      <div>
        <Link href="/farms/new" className="btn-primary">
          Add a farm
        </Link>
      </div>
    </div>
  );
}
