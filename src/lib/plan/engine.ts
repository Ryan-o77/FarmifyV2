/**
 * The plan engine: turns a field description into a dated irrigation schedule.
 *
 * Order of operations:
 *
 *   1. Work out where the crop is in its season on the planning date.
 *   2. Predict the weather across the whole remaining season.
 *   3. Simulate the soil water balance with no restriction, to learn what the
 *      crop actually wants.
 *   4. If the grower has a water limit smaller than that, decide which growth
 *      stages absorb the shortfall and simulate again under that allocation.
 *   5. Group the resulting irrigation events into weeks.
 */

import {
  getStation,
  addDays,
  parseIsoDate,
  toIsoDate,
  type Station,
} from "../climate/station";
import {
  forecastEnsemble,
  toWeatherDays,
  climateAdjustmentInputs,
  type EnsembleDay,
  type LiveObservation,
} from "../climate/forecast";
import { getCrop, totalSeasonDays, type Crop, type GrowthStage } from "../agronomy/crops";
import { getSoil } from "../agronomy/soils";
import {
  getSystem,
  applicationRateFromEmitters,
  grossApplicationFactor,
} from "../agronomy/systems";
import { simulate, type WeatherDay } from "../agronomy/waterbalance";
import {
  allocateDeficit,
  estimateRelativeYield,
  buildDeficitPlan,
  FULL_ALLOCATION,
  type StageDemand,
} from "../agronomy/deficit";
import type {
  Field,
  Farm,
  FieldPlan,
  WeekPlan,
  IrrigationEvent,
  DayBalance,
  WaterLimit,
} from "../types";
import { clamp, gallonsToAcreFeet, GALLONS_PER_ACRE_INCH } from "../units";

const MAX_HORIZON_DAYS = 400;

/**
 * The date this crop's current season began.
 *
 * Perennials are anchored to the calendar (almonds leaf out in late February
 * whatever the grower does), so we look for the season window that contains the
 * planning date; annuals use the planting date the grower entered.
 */
export function resolveSeasonStart(crop: Crop, field: Field, reference: Date): Date {
  if (!crop.perennial) {
    if (field.seasonStartDate) return parseIsoDate(field.seasonStartDate);
    // No planting date recorded: assume the crop went in on the planning date.
    return new Date(reference.getTime());
  }

  if (field.seasonStartDate) return parseIsoDate(field.seasonStartDate);

  const anchor = crop.seasonStart ?? { month: 3, day: 1 };
  const total = totalSeasonDays(crop);
  const year = reference.getUTCFullYear();

  for (const candidateYear of [year - 1, year, year + 1]) {
    const start = new Date(Date.UTC(candidateYear, anchor.month - 1, anchor.day));
    const end = addDays(start, total);
    if (reference >= start && reference <= end) return start;
  }
  // Between seasons: plan for the season that is coming next.
  const thisYear = new Date(Date.UTC(year, anchor.month - 1, anchor.day));
  return reference <= thisYear
    ? thisYear
    : new Date(Date.UTC(year + 1, anchor.month - 1, anchor.day));
}

/** Canopy cover for a perennial, from planting age. Young blocks use less water. */
function canopyCover(crop: Crop, plantingAgeYears?: number | null): number | undefined {
  if (!crop.perennial || plantingAgeYears == null) return undefined;
  const matureAge = crop.category === "vine" ? 4 : crop.category === "forage" ? 1 : 6;
  return clamp(plantingAgeYears / matureAge, 0.15, 1);
}

/** The field's application rate, in/hr: measured, else from emitters, else the system default. */
export function resolveApplicationRate(field: Field): number {
  if (field.applicationRateInPerHr && field.applicationRateInPerHr > 0) {
    return field.applicationRateInPerHr;
  }
  if (field.emitter) {
    const rate = applicationRateFromEmitters(field.emitter);
    if (rate > 0) return rate;
  }
  return getSystem(field.systemId).typicalRateInPerHr;
}

/** A water limit expressed as inches of water pumped over this field. */
export function waterLimitToInches(
  limit: WaterLimit,
  acres: number,
  seasonDays: number
): number {
  if (acres <= 0) return Infinity;
  let inches: number;
  switch (limit.unit) {
    case "acre-feet":
      inches = (limit.amount * 12) / acres;
      break;
    case "acre-inches":
      inches = limit.amount / acres;
      break;
    case "gallons":
      inches = limit.amount / (acres * GALLONS_PER_ACRE_INCH);
      break;
  }
  if (limit.period === "month") {
    inches *= seasonDays / 30.44;
  }
  return inches;
}

export interface PlanOptions {
  /** The date the plan is being made. Defaults to today. */
  referenceDate?: Date;
  /** Real forecast or observations to use in place of generated weather. */
  live?: LiveObservation[];
  /** Number of ensemble members; lowered automatically for long horizons. */
  members?: number;
}

export interface BuiltPlan extends FieldPlan {
  /** The ensemble behind the plan, for the dashboard. */
  ensemble: EnsembleDay[];
}

export function buildFieldPlan(
  farm: Farm,
  field: Field,
  options: PlanOptions = {}
): BuiltPlan {
  const reference = options.referenceDate ?? new Date();
  const referenceUtc = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate())
  );

  const crop = getCrop(field.cropId);
  const soil = getSoil(field.soilId);
  const system = getSystem(field.systemId);
  const station: Station = getStation(farm.stationId);

  const seasonStart = resolveSeasonStart(crop, field, referenceUtc);
  const seasonLength = totalSeasonDays(crop);
  const horizonDays = Math.min(MAX_HORIZON_DAYS, seasonLength + 1);
  const seasonEnd = addDays(seasonStart, horizonDays - 1);

  // Enough members for stable percentiles without making a long season slow.
  const members = options.members ?? clamp(Math.round(9000 / horizonDays), 40, 150);

  const ensemble = forecastEnsemble(station, seasonStart, horizonDays, {
    members,
    seed: `${farm.id}:${field.id}`,
    live: options.live,
  });
  const weather: WeatherDay[] = toWeatherDays(ensemble);

  // Wind and humidity over the peak of the season drive the Kc climate adjustment.
  const midOffset = crop.stages.initialDays + crop.stages.developmentDays;
  const { u2Ms, rhMinPct } = climateAdjustmentInputs(
    station,
    addDays(seasonStart, midOffset),
    Math.max(1, Math.min(crop.stages.midDays, horizonDays - midOffset))
  );

  const applicationRate = resolveApplicationRate(field);
  const cover = canopyCover(crop, field.plantingAgeYears);

  const baseInputs = {
    crop,
    soil,
    system,
    weather,
    acres: field.acres,
    startDayInSeason: 0,
    applicationRateInPerHr: applicationRate,
    restrictiveLayerDepthFt: field.restrictiveLayerDepthFt,
    distributionUniformity: field.distributionUniformity,
    canopyCoverFraction: cover,
    demandFactor: field.calibration?.demandFactor ?? 1,
    applicationFactor: field.calibration?.applicationFactor ?? 1,
    constraints: field.constraints,
    u2Ms,
    rhMinPct,
  };

  // --- Pass 1: what the crop wants with no restriction --------------------
  const unconstrained = simulate({ ...baseInputs, stageAllocation: FULL_ALLOCATION });

  // --- Decide whether a deficit is required --------------------------------
  const grossFactor = grossApplicationFactor(system, {
    distributionUniformity: field.distributionUniformity ?? undefined,
  });

  let result = unconstrained;
  let deficitStrategy: string[] = [];
  let deficitApplied = false;
  let availableEtcIn = unconstrained.totals.etcIn;

  if (field.waterLimit && field.waterLimit.amount > 0) {
    const limitGrossIn = waterLimitToInches(field.waterLimit, field.acres, horizonDays);
    if (Number.isFinite(limitGrossIn) && limitGrossIn < unconstrained.totals.grossIrrigationIn) {
      // Convert the pumped-water cap into the crop water it can actually supply,
      // then add the rain the crop gets for free.
      const availableNetIrrigation = limitGrossIn / grossFactor;
      availableEtcIn = availableNetIrrigation + unconstrained.totals.effectiveRainIn;

      const stageDemands = summariseStageDemand(unconstrained.balance);
      const { allocation, strategy } = allocateDeficit(crop, stageDemands, availableEtcIn);
      deficitStrategy = strategy;
      deficitApplied = true;

      // Turn the per-stage allocation into an actual water budget, in inches of
      // net irrigation, that the scheduler draws down. The shares set *where* the
      // cut falls; the budget is what guarantees the season fits inside the cap.
      const netByStage = summariseStageNetIrrigation(unconstrained.balance);
      const rawBudget: Record<string, number> = {};
      let budgetTotal = 0;
      for (const [stage, netIn] of Object.entries(netByStage)) {
        const share = allocation[stage as GrowthStage] ?? 1;
        rawBudget[stage] = netIn * share;
        budgetTotal += rawBudget[stage];
      }
      // Scale so the budget sums exactly to the water the limit can supply.
      const scale = budgetTotal > 0 ? Math.min(1, availableNetIrrigation / budgetTotal) : 1;
      const stageBudgetIn = Object.fromEntries(
        Object.entries(rawBudget).map(([stage, value]) => [stage, value * scale])
      ) as Record<GrowthStage, number>;

      result = simulate({ ...baseInputs, stageAllocation: allocation, stageBudgetIn });
    }
  }

  // --- Yield estimate under whatever was actually delivered ----------------
  const stageActual = summariseStageActual(result.balance);
  const relativeYield = estimateRelativeYield(crop, stageActual);

  const deficit = buildDeficitPlan({
    applied: deficitApplied,
    availableIn: availableEtcIn,
    requiredIn: unconstrained.totals.etcIn,
    relativeYield,
    strategy: deficitStrategy,
  });

  const weeks = groupIntoWeeks(result.events, result.balance, ensemble);

  const warnings = [...result.warnings];
  if (deficitApplied) {
    warnings.push(
      `The water limit on this field is smaller than the crop's full requirement. ` +
        `The plan rations water across the season and estimates about ` +
        `${Math.round(relativeYield * 100)}% of full yield.`
    );
  }
  if (field.waterLimit && field.waterLimit.amount > 0) {
    const limitGrossIn = waterLimitToInches(field.waterLimit, field.acres, horizonDays);
    if (result.totals.grossIrrigationIn > limitGrossIn * 1.02) {
      warnings.push(
        `This plan pumps ${result.totals.grossIrrigationIn.toFixed(1)} in but the limit is ` +
          `${limitGrossIn.toFixed(1)} in. Reduce irrigated acreage or raise the allocation.`
      );
    }
  }

  const intervals = computeIntervals(result.events);

  return {
    field,
    cropName: crop.name,
    soilName: soil.name,
    systemName: system.name,
    stationId: station.id,
    stationName: station.name,
    balance: result.balance,
    events: result.events,
    weeks,
    season: {
      startDate: toIsoDate(seasonStart),
      endDate: toIsoDate(seasonEnd),
      etoIn: result.totals.etoIn,
      etcIn: result.totals.etcIn,
      rainIn: result.totals.rainIn,
      effectiveRainIn: result.totals.effectiveRainIn,
      netIrrigationIn: result.totals.netIrrigationIn,
      grossIrrigationIn: result.totals.grossIrrigationIn,
      totalGallons: result.totals.totalGallons,
      acreFeet: gallonsToAcreFeet(result.totals.totalGallons),
      acreFeetPerAcre:
        field.acres > 0 ? gallonsToAcreFeet(result.totals.totalGallons) / field.acres : 0,
      irrigationCount: result.totals.irrigationCount,
      averageIntervalDays: intervals,
    },
    deficit,
    applicationRateInPerHr: applicationRate,
    warnings,
    ensemble,
  };
}

function summariseStageNetIrrigation(balance: DayBalance[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of balance) {
    out[d.stage] = (out[d.stage] ?? 0) + d.irrigationIn;
  }
  return out;
}

function summariseStageDemand(balance: DayBalance[]): StageDemand[] {
  const map = new Map<GrowthStage, number>();
  for (const d of balance) {
    map.set(d.stage, (map.get(d.stage) ?? 0) + d.etcIn);
  }
  return [...map.entries()].map(([stage, etcIn]) => ({ stage, etcIn }));
}

function summariseStageActual(
  balance: DayBalance[]
): { stage: GrowthStage; etcIn: number; etActualIn: number }[] {
  const map = new Map<GrowthStage, { etcIn: number; etActualIn: number }>();
  for (const d of balance) {
    const entry = map.get(d.stage) ?? { etcIn: 0, etActualIn: 0 };
    entry.etcIn += d.etcIn;
    entry.etActualIn += d.etActualIn;
    map.set(d.stage, entry);
  }
  return [...map.entries()].map(([stage, v]) => ({ stage, ...v }));
}

function computeIntervals(events: IrrigationEvent[]): number {
  if (events.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < events.length; i++) {
    const a = parseIsoDate(events[i - 1].date).getTime();
    const b = parseIsoDate(events[i].date).getTime();
    total += (b - a) / 86_400_000;
  }
  return total / (events.length - 1);
}

/** Monday-anchored week containing `date`. */
export function weekStartOf(date: Date): Date {
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day; // Monday = start of week
  return addDays(date, offset);
}

function groupIntoWeeks(
  events: IrrigationEvent[],
  balance: DayBalance[],
  ensemble: EnsembleDay[]
): WeekPlan[] {
  if (balance.length === 0) return [];
  const ensembleByDate = new Map(ensemble.map((e) => [e.date, e]));
  const balanceByDate = new Map(balance.map((b) => [b.date, b]));

  const weeks = new Map<string, WeekPlan>();
  const ensureWeek = (isoDate: string): WeekPlan => {
    const start = weekStartOf(parseIsoDate(isoDate));
    const key = toIsoDate(start);
    let week = weeks.get(key);
    if (!week) {
      week = {
        weekStart: key,
        weekEnd: toIsoDate(addDays(start, 6)),
        events: [],
        totalGallons: 0,
        totalGrossInches: 0,
        totalNetInches: 0,
        etcInches: 0,
        rainInches: 0,
        restDays: [],
        peakEtoDay: { date: key, etoIn: 0 },
        peakTempF: 0,
        rainChance: 0,
      };
      weeks.set(key, week);
    }
    return week;
  };

  // Seed a week for every day in the balance so quiet weeks still appear.
  for (const day of balance) ensureWeek(day.date);

  for (const event of events) {
    const week = ensureWeek(event.date);
    week.events.push(event);
    week.totalGallons += event.gallons;
    week.totalGrossInches += event.grossDepthIn;
    week.totalNetInches += event.netDepthIn;
  }

  for (const week of weeks.values()) {
    const start = parseIsoDate(week.weekStart);
    let noRainChance = 1;
    for (let i = 0; i < 7; i++) {
      const iso = toIsoDate(addDays(start, i));
      const day = balanceByDate.get(iso);
      const ens = ensembleByDate.get(iso);
      if (day) {
        week.etcInches += day.etcIn;
        week.rainInches += day.rainIn;
        if (day.etoIn > week.peakEtoDay.etoIn) {
          week.peakEtoDay = { date: iso, etoIn: day.etoIn };
        }
        if (!day.irrigated) week.restDays.push(iso);
      }
      if (ens) {
        week.peakTempF = Math.max(week.peakTempF, ens.tmaxF);
        noRainChance *= 1 - clamp(ens.wetRisk, 0, 1);
      }
    }
    week.rainChance = 1 - noRainChance;
    week.events.sort((a, b) => a.date.localeCompare(b.date));
  }

  return [...weeks.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

/** The week plan covering `date`, or the next one with irrigation in it. */
export function selectWeek(plan: FieldPlan, date: Date): WeekPlan | null {
  const target = toIsoDate(weekStartOf(date));
  return (
    plan.weeks.find((w) => w.weekStart === target) ??
    plan.weeks.find((w) => w.weekStart >= target) ??
    plan.weeks[plan.weeks.length - 1] ??
    null
  );
}
