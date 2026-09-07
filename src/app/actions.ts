"use server";

/**
 * Server actions behind the forms.
 *
 * Forms post straight to these rather than to a JSON API, so every page works
 * without client-side JavaScript. That is not a purist's point: field offices run
 * old hardware and phones on poor rural connections, and a plan you cannot open
 * is worse than one that looks plainer.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createFarm,
  updateFarm,
  deleteFarm,
  upsertField,
  deleteField,
  getField,
  recordFeedback,
  defaultConstraints,
} from "@/lib/store";
import { applyFeedback } from "@/lib/feedback";
import { DEFAULT_CALIBRATION, type Field, type Language, type Weekday, type FeedbackKind } from "@/lib/types";

function str(form: FormData, key: string, fallback = ""): string {
  const value = form.get(key);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

function num(form: FormData, key: string): number | null {
  const value = form.get(key);
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function createFarmAction(form: FormData) {
  const name = str(form, "name", "Untitled farm");
  const farm = await createFarm({
    name,
    farmerName: str(form, "farmerName", "—"),
    language: (str(form, "language", "en") as Language) ?? "en",
    stationId: str(form, "stationId", "KFAT"),
  });
  revalidatePath("/");
  redirect(`/farms/${farm.id}`);
}

export async function updateFarmAction(farmId: string, form: FormData) {
  await updateFarm(farmId, {
    name: str(form, "name", "Untitled farm"),
    farmerName: str(form, "farmerName", "—"),
    language: str(form, "language", "en") as Language,
    stationId: str(form, "stationId", "KFAT"),
  });
  revalidatePath(`/farms/${farmId}`);
  revalidatePath("/");
  redirect(`/farms/${farmId}`);
}

export async function deleteFarmAction(farmId: string) {
  await deleteFarm(farmId);
  revalidatePath("/");
  redirect("/");
}

export async function saveFieldAction(farmId: string, form: FormData) {
  const systemId = str(form, "systemId", "micro-sprinkler");
  const fieldId = str(form, "fieldId") || undefined;

  const allowedWeekdays = ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).filter(
    (d) => form.get(`weekday-${d}`) === "on"
  );

  const fallbackConstraints = defaultConstraints(systemId);
  const limitAmount = num(form, "waterLimitAmount");

  const emitterGph = num(form, "emitterGph");
  const emitterSpacing = num(form, "emitterSpacingFt");
  const lateralSpacing = num(form, "lateralSpacingFt");

  const field: Omit<Field, "id"> & { id?: string } = {
    id: fieldId,
    name: str(form, "name", "Untitled field"),
    acres: Math.max(0.1, num(form, "acres") ?? 1),
    cropId: str(form, "cropId", "almond"),
    soilId: str(form, "soilId", "sandy-loam"),
    systemId,
    seasonStartDate: str(form, "seasonStartDate") || null,
    plantingAgeYears: num(form, "plantingAgeYears"),
    restrictiveLayerDepthFt: num(form, "restrictiveLayerDepthFt"),
    applicationRateInPerHr: num(form, "applicationRateInPerHr"),
    distributionUniformity: (() => {
      const du = num(form, "distributionUniformityPct");
      return du == null ? null : Math.min(0.98, Math.max(0.4, du / 100));
    })(),
    emitter:
      emitterGph && emitterSpacing && lateralSpacing
        ? {
            emitterGph,
            emitterSpacingFt: emitterSpacing,
            lateralSpacingFt: lateralSpacing,
          }
        : null,
    waterLimit:
      limitAmount && limitAmount > 0
        ? {
            amount: limitAmount,
            unit: str(form, "waterLimitUnit", "acre-feet") as "acre-feet" | "acre-inches" | "gallons",
            period: str(form, "waterLimitPeriod", "season") as "season" | "year" | "month",
            note: str(form, "waterLimitNote") || undefined,
          }
        : null,
    constraints: {
      allowedWeekdays:
        allowedWeekdays.length > 0 ? allowedWeekdays : fallbackConstraints.allowedWeekdays,
      earliestStartHour: num(form, "earliestStartHour") ?? fallbackConstraints.earliestStartHour,
      latestEndHour: num(form, "latestEndHour") ?? fallbackConstraints.latestEndHour,
      maxHoursPerDay: num(form, "maxHoursPerDay") ?? fallbackConstraints.maxHoursPerDay,
      systemCapacityGpm: num(form, "systemCapacityGpm"),
    },
    calibration: { ...DEFAULT_CALIBRATION },
    notes: str(form, "notes") || undefined,
  };

  const saved = await upsertField(farmId, field);
  revalidatePath(`/farms/${farmId}`);
  if (saved) redirect(`/farms/${farmId}/fields/${saved.id}`);
  redirect(`/farms/${farmId}`);
}

export async function deleteFieldAction(farmId: string, fieldId: string) {
  await deleteField(farmId, fieldId);
  revalidatePath(`/farms/${farmId}`);
  redirect(`/farms/${farmId}`);
}

/**
 * Record a grower's observation and move the field's calibration.
 *
 * The plan is regenerated on the next page load, so the effect of the report is
 * visible immediately -- which is the whole point of asking.
 */
export async function submitFeedbackAction(farmId: string, fieldId: string, form: FormData) {
  const found = await getField(farmId, fieldId);
  if (!found) redirect(`/farms/${farmId}`);

  const kind = str(form, "kind", "just-right") as FeedbackKind;
  const previous = found.field.calibration ?? DEFAULT_CALIBRATION;
  const { calibration } = applyFeedback(previous, kind);

  await recordFeedback(
    {
      farmId,
      fieldId,
      kind,
      date: str(form, "date", new Date().toISOString().slice(0, 10)),
      comment: str(form, "comment") || undefined,
    },
    calibration,
    previous
  );

  revalidatePath(`/farms/${farmId}/fields/${fieldId}`);
  revalidatePath(`/farms/${farmId}`);
  redirect(`/farms/${farmId}/fields/${fieldId}?saved=1`);
}
