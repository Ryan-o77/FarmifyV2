"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useStore, useToday } from "@/lib/useStore";
import { buildFieldPlan } from "@/lib/plan/engine";
import { todayLine } from "@/lib/plan/simplify";
import { getStation, toIsoDate } from "@/lib/climate/station";
import { getCrop } from "@/lib/agronomy/crops";
import { Loading } from "@/components/Loading";
import { BackupControls } from "@/components/BackupControls";

export default function HomePage() {
  const { store, ready, refresh } = useStore();
  const today = useToday();

  const farms = store?.farms ?? [];
  const todayIso = today ? toIsoDate(today) : null;

  // Building a plan per field is real work, so it is done once per store change
  // rather than on every render.
  const plans = useMemo(() => {
    if (!today) return new Map<string, ReturnType<typeof buildFieldPlan>>();
    const out = new Map<string, ReturnType<typeof buildFieldPlan>>();
    for (const farm of farms) {
      for (const field of farm.fields) {
        try {
          out.set(`${farm.id}:${field.id}`, buildFieldPlan(farm, field, { referenceDate: today }));
        } catch {
          // A field saved by an older version could reference a crop that no
          // longer exists. Skip it rather than taking the whole page down.
        }
      }
    }
    return out;
  }, [farms, today]);

  if (!ready || !today || !todayIso) {
    return (
      <div className="space-y-6">
        <Header />
        <Loading />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header />

      {farms.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-soil-600">No farms in this browser yet.</p>
          <Link href="/farm/settings/" className="btn-primary mt-4">
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
                      <Link href={`/farm/?id=${farm.id}`} className="hover:text-leaf-700">
                        {farm.name}
                      </Link>
                    </h2>
                    <p className="text-xs text-soil-600">
                      {farm.farmerName} · {station.name}
                    </p>
                  </div>
                  <Link href={`/farm/?id=${farm.id}`} className="btn-secondary">
                    Open dashboard
                  </Link>
                </header>

                {farm.fields.length === 0 ? (
                  <div className="px-5 py-6 text-sm text-soil-600">
                    No fields yet.{" "}
                    <Link
                      href={`/field/settings/?farm=${farm.id}`}
                      className="font-semibold text-leaf-700 underline"
                    >
                      Add a field
                    </Link>{" "}
                    to get a plan.
                  </div>
                ) : (
                  <ul className="divide-y divide-soil-100">
                    {farm.fields.map((field) => {
                      const plan = plans.get(`${farm.id}:${field.id}`);
                      if (!plan) return null;
                      const line = todayLine(plan, todayIso, farm.language);
                      const crop = getCrop(field.cropId);
                      return (
                        <li
                          key={field.id}
                          className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                        >
                          <div className="min-w-0">
                            <Link
                              href={`/field/?farm=${farm.id}&id=${field.id}`}
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
                              href={`/field/print/?farm=${farm.id}&id=${field.id}`}
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

      <div className="flex flex-wrap gap-2">
        <Link href="/farm/settings/" className="btn-primary">
          Add a farm
        </Link>
      </div>

      <BackupControls onChanged={refresh} />
    </div>
  );
}

function Header() {
  return (
    <section>
      <h1 className="text-2xl font-bold tracking-tight">Farms</h1>
      <p className="mt-1 max-w-2xl text-sm text-soil-600">
        Every field gets its own irrigation plan, built from the crop, the soil, the
        irrigation system and the weather record at the nearest station. Open a farm to see
        this week&apos;s schedule.
      </p>
    </section>
  );
}
