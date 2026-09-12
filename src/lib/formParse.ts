/**
 * Reading the questionnaire forms.
 *
 * Kept apart from the components so the parsing rules are testable on their own
 * and so a blank optional field means "use the sensible default" in exactly one
 * place rather than in each form.
 */

import { defaultConstraints } from "./clientStore";
import { DEFAULT_CALIBRATION, type Field, type Language, type Weekday } from "./types";

export function str(form: FormData, key: string, fallback = ""): string {
  const value = form.get(key);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

export function num(form: FormData, key: string): number | null {
  const value = form.get(key);
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface FarmInput {
  name: string;
  farmerName: string;
  language: Language;
  stationId: string;
}

export function parseFarmForm(form: FormData): FarmInput {
  return {
    name: str(form, "name", "Untitled farm"),
    farmerName: str(form, "farmerName", "—"),
    language: str(form, "language", "en") as Language,
    stationId: str(form, "stationId", "KFAT"),
  };
}

export function parseFieldForm(form: FormData): Omit<Field, "id"> & { id?: string } {
  const systemId = str(form, "systemId", "micro-sprinkler");
  const fieldId = str(form, "fieldId") || undefined;

  const allowedWeekdays = ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).filter(
    (d) => form.get(`weekday-${d}`) === "on"
  );

  const fallback = defaultConstraints(systemId);
  const limitAmount = num(form, "waterLimitAmount");

  const emitterGph = num(form, "emitterGph");
  const emitterSpacingFt = num(form, "emitterSpacingFt");
  const lateralSpacingFt = num(form, "lateralSpacingFt");
  const distributionUniformityPct = num(form, "distributionUniformityPct");

  return {
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
    distributionUniformity:
      distributionUniformityPct == null
        ? null
        : Math.min(0.98, Math.max(0.4, distributionUniformityPct / 100)),
    emitter:
      emitterGph && emitterSpacingFt && lateralSpacingFt
        ? { emitterGph, emitterSpacingFt, lateralSpacingFt }
        : null,
    waterLimit:
      limitAmount && limitAmount > 0
        ? {
            amount: limitAmount,
            unit: str(form, "waterLimitUnit", "acre-feet") as
              | "acre-feet"
              | "acre-inches"
              | "gallons",
            period: str(form, "waterLimitPeriod", "season") as "season" | "year" | "month",
            note: str(form, "waterLimitNote") || undefined,
          }
        : null,
    constraints: {
      // An empty selection means the grower unticked everything, which would
      // produce a plan with no irrigation at all. Fall back to the system's
      // usual days rather than silently returning a useless schedule.
      allowedWeekdays: allowedWeekdays.length > 0 ? allowedWeekdays : fallback.allowedWeekdays,
      earliestStartHour: num(form, "earliestStartHour") ?? fallback.earliestStartHour,
      latestEndHour: num(form, "latestEndHour") ?? fallback.latestEndHour,
      maxHoursPerDay: num(form, "maxHoursPerDay") ?? fallback.maxHoursPerDay,
      systemCapacityGpm: num(form, "systemCapacityGpm"),
    },
    calibration: { ...DEFAULT_CALIBRATION },
    notes: str(form, "notes") || undefined,
  };
}
