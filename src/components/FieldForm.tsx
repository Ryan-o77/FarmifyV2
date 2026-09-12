"use client";

import Link from "next/link";
import { CROPS } from "@/lib/agronomy/crops";
import { SOILS } from "@/lib/agronomy/soils";
import { SYSTEMS } from "@/lib/agronomy/systems";
import { parseFieldForm } from "@/lib/formParse";
import type { Field } from "@/lib/types";

const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

/**
 * The field questionnaire.
 *
 * Only the first section is required. Everything below it improves the plan but
 * has a defensible default, because a grower who does not know their measured
 * application rate should still get a usable schedule rather than a blocked form.
 */
export function FieldForm({
  farmId,
  field,
  onSave,
  submitLabel,
}: {
  farmId: string;
  field?: Field;
  onSave: (input: Omit<Field, "id"> & { id?: string }) => void;
  submitLabel: string;
}) {
  const allowed = new Set(field?.constraints.allowedWeekdays ?? [0, 1, 2, 3, 4, 5, 6]);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave(parseFieldForm(new FormData(event.currentTarget)));
      }}
      className="space-y-6"
    >
      {field ? <input type="hidden" name="fieldId" value={field.id} /> : null}

      <section className="card space-y-5 p-6">
        <div>
          <h2 className="text-lg font-semibold">The field</h2>
          <p className="mt-1 text-sm text-soil-600">
            These four answers are enough to produce a plan.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="name">
              Field name
            </label>
            <input
              id="name"
              name="name"
              className="input"
              defaultValue={field?.name}
              placeholder="North almond block"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="acres">
              Size (acres)
            </label>
            <input
              id="acres"
              name="acres"
              type="number"
              step="0.1"
              min="0.1"
              className="input"
              defaultValue={field?.acres ?? 40}
              required
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="cropId">
              Crop
            </label>
            <select id="cropId" name="cropId" className="select" defaultValue={field?.cropId ?? "almond"}>
              {CROPS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="soilId">
              Soil
            </label>
            <select id="soilId" name="soilId" className="select" defaultValue={field?.soilId ?? "sandy-loam"}>
              {SOILS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.fieldTest}
                </option>
              ))}
            </select>
            <p className="hint">
              Not sure? Wet a handful and squeeze it — the descriptions above are the field test.
            </p>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="systemId">
            Irrigation system
          </label>
          <select
            id="systemId"
            name="systemId"
            className="select"
            defaultValue={field?.systemId ?? "micro-sprinkler"}
          >
            {SYSTEMS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.description}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="card space-y-5 p-6">
        <div>
          <h2 className="text-lg font-semibold">Water limit</h2>
          <p className="mt-1 text-sm text-soil-600">
            If your pumping or delivery is capped, enter it. Farmify will ration the season
            deliberately, cutting water at the growth stages the crop tolerates best instead of
            running out in August.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <label className="label" htmlFor="waterLimitAmount">
              Amount
            </label>
            <input
              id="waterLimitAmount"
              name="waterLimitAmount"
              type="number"
              step="0.1"
              min="0"
              className="input"
              defaultValue={field?.waterLimit?.amount ?? ""}
              placeholder="150"
            />
          </div>
          <div>
            <label className="label" htmlFor="waterLimitUnit">
              Unit
            </label>
            <select
              id="waterLimitUnit"
              name="waterLimitUnit"
              className="select"
              defaultValue={field?.waterLimit?.unit ?? "acre-feet"}
            >
              <option value="acre-feet">acre-feet</option>
              <option value="acre-inches">acre-inches</option>
              <option value="gallons">gallons</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="waterLimitPeriod">
              Period
            </label>
            <select
              id="waterLimitPeriod"
              name="waterLimitPeriod"
              className="select"
              defaultValue={field?.waterLimit?.period ?? "season"}
            >
              <option value="season">per season</option>
              <option value="year">per year</option>
              <option value="month">per month</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="waterLimitNote">
              Note
            </label>
            <input
              id="waterLimitNote"
              name="waterLimitNote"
              className="input"
              defaultValue={field?.waterLimit?.note ?? ""}
              placeholder="SGMA allocation"
            />
          </div>
        </div>
      </section>

      <section className="card space-y-5 p-6">
        <div>
          <h2 className="text-lg font-semibold">When you can irrigate</h2>
          <p className="mt-1 text-sm text-soil-600">
            The schedule is built around these limits, not against them.
          </p>
        </div>

        <fieldset>
          <legend className="label">Days you can run water</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => (
              <label
                key={d.value}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-soil-100 bg-white px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  name={`weekday-${d.value}`}
                  defaultChecked={allowed.has(d.value as never)}
                  className="h-4 w-4 rounded border-soil-100 text-leaf-600 focus:ring-leaf-500"
                />
                {d.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="earliestStartHour">
              Earliest start (hour, 0–23)
            </label>
            <input
              id="earliestStartHour"
              name="earliestStartHour"
              type="number"
              min="0"
              max="23"
              className="input"
              defaultValue={field?.constraints.earliestStartHour ?? 18}
            />
          </div>
          <div>
            <label className="label" htmlFor="latestEndHour">
              Must finish by (hour, 0–23)
            </label>
            <input
              id="latestEndHour"
              name="latestEndHour"
              type="number"
              min="0"
              max="23"
              className="input"
              defaultValue={field?.constraints.latestEndHour ?? 12}
            />
            <p className="hint">
              A window ending earlier than it starts runs overnight, which is usually what you
              want.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="maxHoursPerDay">
              Most hours in one day
            </label>
            <input
              id="maxHoursPerDay"
              name="maxHoursPerDay"
              type="number"
              step="0.5"
              min="0.5"
              max="24"
              className="input"
              defaultValue={field?.constraints.maxHoursPerDay ?? 18}
            />
          </div>
        </div>
      </section>

      <details className="card p-6">
        <summary className="cursor-pointer text-lg font-semibold">
          Details that sharpen the plan (optional)
        </summary>
        <div className="mt-5 space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="applicationRateInPerHr">
                Application rate (in/hr)
              </label>
              <input
                id="applicationRateInPerHr"
                name="applicationRateInPerHr"
                type="number"
                step="0.01"
                min="0"
                className="input"
                defaultValue={field?.applicationRateInPerHr ?? ""}
                placeholder="0.12"
              />
              <p className="hint">
                From a system evaluation. Leave blank to use a typical rate for the system type.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="distributionUniformityPct">
                Distribution uniformity (%)
              </label>
              <input
                id="distributionUniformityPct"
                name="distributionUniformityPct"
                type="number"
                step="1"
                min="40"
                max="98"
                className="input"
                defaultValue={
                  field?.distributionUniformity != null
                    ? Math.round(field.distributionUniformity * 100)
                    : ""
                }
                placeholder="82"
              />
            </div>
            <div>
              <label className="label" htmlFor="restrictiveLayerDepthFt">
                Depth to hardpan (ft)
              </label>
              <input
                id="restrictiveLayerDepthFt"
                name="restrictiveLayerDepthFt"
                type="number"
                step="0.5"
                min="0.5"
                className="input"
                defaultValue={field?.restrictiveLayerDepthFt ?? ""}
                placeholder="3"
              />
              <p className="hint">Roots cannot use water below a cemented layer.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="emitterGph">
                Emitter output (gal/hr)
              </label>
              <input
                id="emitterGph"
                name="emitterGph"
                type="number"
                step="0.1"
                min="0"
                className="input"
                defaultValue={field?.emitter?.emitterGph ?? ""}
              />
            </div>
            <div>
              <label className="label" htmlFor="emitterSpacingFt">
                Emitter spacing (ft)
              </label>
              <input
                id="emitterSpacingFt"
                name="emitterSpacingFt"
                type="number"
                step="0.1"
                min="0"
                className="input"
                defaultValue={field?.emitter?.emitterSpacingFt ?? ""}
              />
            </div>
            <div>
              <label className="label" htmlFor="lateralSpacingFt">
                Row / lateral spacing (ft)
              </label>
              <input
                id="lateralSpacingFt"
                name="lateralSpacingFt"
                type="number"
                step="0.1"
                min="0"
                className="input"
                defaultValue={field?.emitter?.lateralSpacingFt ?? ""}
              />
              <p className="hint">
                Fill all three and Farmify computes your application rate from the hardware.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="seasonStartDate">
                Planting or leaf-out date
              </label>
              <input
                id="seasonStartDate"
                name="seasonStartDate"
                type="date"
                className="input"
                defaultValue={field?.seasonStartDate ?? ""}
              />
              <p className="hint">
                Required for annual crops. Trees and vines fall back to their usual valley
                leaf-out date.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="plantingAgeYears">
                Age of planting (years)
              </label>
              <input
                id="plantingAgeYears"
                name="plantingAgeYears"
                type="number"
                step="1"
                min="0"
                className="input"
                defaultValue={field?.plantingAgeYears ?? ""}
              />
              <p className="hint">
                A young orchard has less canopy and uses proportionally less water.
              </p>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="notes">
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              className="input"
              defaultValue={field?.notes ?? ""}
              placeholder="Varieties, spacing, anything worth remembering."
            />
          </div>
        </div>
      </details>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary">
          {submitLabel}
        </button>
        <Link href={`/farm/?id=${farmId}`} className="btn-secondary">
          Cancel
        </Link>
      </div>
    </form>
  );
}
