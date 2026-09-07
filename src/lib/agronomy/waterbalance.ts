/**
 * The daily soil water balance and the irrigation scheduler.
 *
 * This is the centre of the application. It walks the season one day at a time,
 * tracking how much water the root zone is short of full (the "depletion"), and
 * decides on each day the grower is able to irrigate whether the block will make
 * it to the next opportunity without going into stress. If it will not, it
 * schedules a set and works out exactly how long the valve must be open.
 *
 * The balance follows FAO-56 Chapter 8:
 *
 *   D(i) = D(i-1) - P_eff(i) - I(i) + ETc_adj(i) + DP(i)
 *
 * where D is depletion below field capacity, P_eff is rain that reached the root
 * zone, I is net irrigation stored, ETc_adj is actual crop water use after any
 * stress, and DP is water that drained past the roots.
 */

import {
  type Crop,
  cropCoefficient,
  rootingDepth,
  stagePosition,
  totalSeasonDays,
  SJV_REFERENCE_U2_MS,
  SJV_REFERENCE_RHMIN_PCT,
  type GrowthStage,
} from "./crops";
import {
  type Soil,
  totalAvailableWater,
  readilyAvailableWater,
  adjustDepletionForEt,
} from "./soils";
import {
  type IrrigationSystem,
  grossApplicationFactor,
  checkRunoffRisk,
} from "./systems";
import type { DayBalance, IrrigationEvent, Weekday } from "../types";
import { depthToGallons, inToMm, clamp } from "../units";

/** One day of weather driving the balance. */
export interface WeatherDay {
  date: string;
  dayOfYear: number;
  etoIn: number;
  rainIn: number;
  /** Probability of measurable rain, 0-1. Used for rain-skip decisions. */
  rainProbability: number;
  tmaxF: number;
  tminF: number;
  windMph: number;
  humidityPct: number;
}

export interface SimulationInputs {
  crop: Crop;
  soil: Soil;
  system: IrrigationSystem;
  weather: WeatherDay[];
  acres: number;
  /** Day-of-season index of `weather[0]`. Negative when the season has not begun. */
  startDayInSeason: number;
  /** Application rate over the whole field, in/hr. */
  applicationRateInPerHr: number;
  /** Root-restricting layer depth, ft. */
  restrictiveLayerDepthFt?: number | null;
  /** Measured distribution uniformity, 0-1. */
  distributionUniformity?: number | null;
  /** Canopy cover fraction for young perennial plantings, 0-1. */
  canopyCoverFraction?: number;
  /** Learned corrections from grower feedback. */
  demandFactor: number;
  applicationFactor: number;
  constraints: {
    allowedWeekdays: Weekday[];
    earliestStartHour: number;
    latestEndHour: number;
    maxHoursPerDay: number;
  };
  /** Depletion at the start of the simulation, inches. Defaults to a full profile. */
  initialDepletionIn?: number;
  /**
   * Per-stage share of the full requirement to deliver, 0-1. Values below 1 put
   * the crop into deliberate, managed deficit for that stage: the soil is allowed
   * to dry further between sets.
   */
  stageAllocation?: Record<GrowthStage, number>;
  /**
   * Hard ceiling on net irrigation, inches, for each growth stage.
   *
   * This is what actually enforces a water limit. Applying a smaller depth at
   * each set does not save water -- the soil simply crosses the trigger again
   * sooner, and total delivery still tracks crop demand. Water is only saved by
   * spending less of it, so the ration is carried as a budget that the scheduler
   * draws down and cannot exceed.
   */
  stageBudgetIn?: Record<GrowthStage, number>;
  /** Mean 2 m wind speed for the Kc climate adjustment, m/s. */
  u2Ms?: number;
  /** Mean minimum relative humidity for the Kc climate adjustment, percent. */
  rhMinPct?: number;
}

export interface SimulationResult {
  balance: DayBalance[];
  events: IrrigationEvent[];
  warnings: string[];
  totals: {
    etoIn: number;
    etcIn: number;
    etActualIn: number;
    rainIn: number;
    effectiveRainIn: number;
    netIrrigationIn: number;
    grossIrrigationIn: number;
    deepPercolationIn: number;
    totalGallons: number;
    irrigationCount: number;
  };
}

/**
 * Rain that actually reaches the root zone.
 *
 * A light shower on a hot valley day never gets past the surface, so the first
 * increment is written off to interception and surface evaporation. What remains
 * is reduced by a runoff share that depends on how readily the soil takes water.
 */
function effectiveRainfall(rainIn: number, soil: Soil): number {
  if (rainIn <= 0.08) return 0;
  const runoffFraction = clamp(0.35 - soil.infiltrationInPerHr * 0.25, 0.05, 0.3);
  return Math.max(0, (rainIn - 0.08) * (1 - runoffFraction));
}

/** Alfalfa and other cut forages lose their canopy at each harvest. */
function cuttingCycleFactor(crop: Crop, dayInSeason: number): number {
  if (!crop.cuttingCycleDays || dayInSeason < 0) return 1;
  const dayInCycle = dayInSeason % crop.cuttingCycleDays;
  const regrowthDays = 8;
  if (dayInCycle >= regrowthDays) return 1;
  // Water use drops to roughly half immediately after a cutting and recovers as
  // the stand regrows.
  return 0.5 + 0.5 * (dayInCycle / regrowthDays);
}

function windowLengthHours(earliestStartHour: number, latestEndHour: number): number {
  return latestEndHour > earliestStartHour
    ? latestEndHour - earliestStartHour
    : 24 - earliestStartHour + latestEndHour;
}

function formatHour(hourFloat: number): string {
  const wrapped = ((hourFloat % 24) + 24) % 24;
  const h = Math.floor(wrapped);
  const m = Math.round((wrapped - h) * 60);
  const hh = m === 60 ? (h + 1) % 24 : h;
  const mm = m === 60 ? 0 : m;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * Place a set inside the grower's allowed window.
 *
 * Water goes on as close to sunrise as the window allows: an overnight set has
 * the lowest evaporation and wind-drift losses, and finishing near dawn leaves
 * the profile full at the start of the day's demand rather than hours earlier,
 * when some of it would have drained past the roots overnight.
 */
function placeSet(
  totalElapsedHours: number,
  earliestStartHour: number,
  latestEndHour: number
): { startHour: number; endHour: number } {
  const window = windowLengthHours(earliestStartHour, latestEndHour);
  if (totalElapsedHours >= window) {
    return { startHour: earliestStartHour, endHour: earliestStartHour + window };
  }
  // Back the start off from the end of the window so the set finishes on time,
  // then round down to a quarter hour -- nobody sets a valve for 18:17, and
  // rounding down rather than up keeps the set inside the window.
  const endHour = latestEndHour;
  const exactStart = endHour - totalElapsedHours;
  const startHour = Math.floor(exactStart * 4) / 4;
  return { startHour, endHour };
}

const WEEKDAY_OF = (isoDate: string): Weekday => {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() as Weekday;
};

const DEFAULT_ALLOCATION: Record<GrowthStage, number> = {
  dormant: 1,
  initial: 1,
  development: 1,
  mid: 1,
  late: 1,
};

export function simulate(input: SimulationInputs): SimulationResult {
  const {
    crop,
    soil,
    system,
    weather,
    acres,
    startDayInSeason,
    applicationRateInPerHr,
    restrictiveLayerDepthFt,
    distributionUniformity,
    canopyCoverFraction,
    demandFactor,
    applicationFactor,
    constraints,
    stageAllocation = DEFAULT_ALLOCATION,
    stageBudgetIn,
    u2Ms = SJV_REFERENCE_U2_MS,
    rhMinPct = SJV_REFERENCE_RHMIN_PCT,
  } = input;

  const balance: DayBalance[] = [];
  const events: IrrigationEvent[] = [];
  const warnings = new Set<string>();

  const grossFactor = grossApplicationFactor(system, {
    distributionUniformity: distributionUniformity ?? undefined,
  });
  // A calibration below 1 means the system delivers less than its rating, so the
  // same depth takes proportionally longer to apply.
  const effectiveRate = Math.max(0.005, applicationRateInPerHr * applicationFactor);
  const window = windowLengthHours(constraints.earliestStartHour, constraints.latestEndHour);
  const usableHours = Math.min(constraints.maxHoursPerDay, window);

  const runoff = checkRunoffRisk(effectiveRate, soil.infiltrationInPerHr);
  if (runoff.atRisk) {
    warnings.add(
      `The system applies water about ${runoff.ratio.toFixed(1)}x faster than ${soil.name.toLowerCase()} can absorb it. ` +
        `Sets are split into ${runoff.suggestedCycles} cycles with a soak between them to stop runoff.`
    );
  }

  const allowed = new Set(constraints.allowedWeekdays);
  if (allowed.size === 0) {
    warnings.add("No irrigation days are selected, so no schedule could be built.");
  }

  // Precompute the crop demand for every day so the scheduler can look ahead.
  const days = weather.map((w, i) => {
    const dayInSeason = startDayInSeason + i;
    const { kc, stage, position } = cropCoefficient(crop, dayInSeason, {
      u2Ms,
      rhMinPct,
      canopyCoverFraction,
    });
    const kcAdjusted = kc * cuttingCycleFactor(crop, dayInSeason);
    const etcIn = Math.max(0, w.etoIn * kcAdjusted * demandFactor);
    const rootDepthM = rootingDepth(crop, Math.max(0, dayInSeason));
    const tawIn = totalAvailableWater(soil, rootDepthM, restrictiveLayerDepthFt);
    const pAdjusted = adjustDepletionForEt(
      crop.depletionFraction * soil.depletionAdjustment,
      inToMm(etcIn)
    );
    const rawIn = tawIn * clamp(pAdjusted, 0.1, 0.8);
    return { w, dayInSeason, kc: kcAdjusted, stage, position, etcIn, tawIn, rawIn };
  });

  let depletion = input.initialDepletionIn ?? 0;
  // Aggregated capacity diagnostics: one summary warning beats one per event.
  let shortfallDays = 0;
  let worstShortfallIn = 0;
  // Water already spent in each growth stage, inches net.
  const spentByStage: Record<string, number> = {};
  let budgetExhaustedDays = 0;

  const totals = {
    etoIn: 0,
    etcIn: 0,
    etActualIn: 0,
    rainIn: 0,
    effectiveRainIn: 0,
    netIrrigationIn: 0,
    grossIrrigationIn: 0,
    deepPercolationIn: 0,
    totalGallons: 0,
    irrigationCount: 0,
  };

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const { w, tawIn, rawIn, stage } = day;
    const weekday = WEEKDAY_OF(w.date);
    const allocation = clamp(stageAllocation[stage] ?? 1, 0.2, 1);

    // Depletion never exceeds the size of the reservoir itself.
    depletion = clamp(depletion, 0, tawIn);

    let irrigationIn = 0;
    let grossIn = 0;
    let irrigated = false;

    const canIrrigateToday = allowed.has(weekday) && stage !== "dormant" && allowed.size > 0;

    if (canIrrigateToday) {
      // How long until the next chance to put water on this block?
      let nextOpportunity = days.length;
      for (let j = i + 1; j < days.length; j++) {
        if (allowed.has(WEEKDAY_OF(days[j].w.date)) && days[j].stage !== "dormant") {
          nextOpportunity = j;
          break;
        }
      }

      // Demand between now and then, net of rain we can count on.
      let projected = depletion;
      for (let j = i; j < Math.min(nextOpportunity, days.length); j++) {
        projected += days[j].etcIn;
        // Only rain that is more likely than not is allowed to defer an irrigation;
        // skipping a set on a 20% chance of rain is how a block gets burned.
        if (days[j].w.rainProbability >= 0.5) {
          projected -= effectiveRainfall(days[j].w.rainIn, soil);
        }
      }

      // Two separate limits decide when a set is called.
      //
      // The agronomic limit is readily available water: past it the crop starts
      // closing stomata. Under a deficit allocation the soil is deliberately
      // allowed to run further down before water goes on -- that extra drying is
      // the mechanism by which a rationed block uses less water, because a
      // stressed crop transpires less.
      const stressTrigger = rawIn / Math.max(0.6, allocation);
      // The operational limit is what the system can physically replace in the
      // hours available. A block whose reservoir holds 3 in but whose sprinklers
      // can only put on 1.3 in a night must be irrigated more often and lighter --
      // waiting for the soil to hit the stress threshold would leave a deficit
      // that can never be made up. This only applies when watering to full
      // demand; under a ration the drying is intentional.
      const maxNet = (usableHours * effectiveRate) / grossFactor;
      const trigger = allocation >= 0.99 ? Math.min(stressTrigger, maxNet) : stressTrigger;

      // What is left of this stage's water ration.
      //
      // The ration is paced against progress through the stage rather than spent
      // as fast as the crop will take it. Watering to full demand until the
      // budget runs out and then stopping dead is the worst way to spend a short
      // allocation: it puts the whole deficit at the end of the stage. Pacing
      // spreads the same water evenly, which is what regulated deficit irrigation
      // is supposed to do. A small lead lets a set start before its share has
      // strictly accrued, so the first irrigation of a stage is not delayed.
      const budget = stageBudgetIn?.[stage];
      const spent = spentByStage[stage] ?? 0;
      const pacedShare = Math.min(1, day.position.fractionThroughStage + 0.2);
      const budgetRemaining =
        budget == null ? Infinity : Math.max(0, Math.min(budget, budget * pacedShare) - spent);

      if (budget != null && budgetRemaining <= 0.02 && projected >= trigger) {
        budgetExhaustedDays += 1;
      }

      if (projected >= trigger && depletion > 0.05 && budgetRemaining > 0.02) {
        // Refill the profile, within the system's capacity and the ration.
        const desiredNet = depletion;
        const netApplied = Math.min(desiredNet, maxNet, tawIn, budgetRemaining);

        if (netApplied > 0.01) {
          irrigationIn = netApplied;
          grossIn = netApplied * grossFactor;
          irrigated = true;

          const runHours = grossIn / effectiveRate;
          const cycleCount = runoff.suggestedCycles;
          const soakMinutes = runoff.atRisk ? 45 : 0;
          const perCycleHours = runHours / cycleCount;
          const totalElapsed = runHours + ((cycleCount - 1) * soakMinutes) / 60;

          const { startHour } = placeSet(
            totalElapsed,
            constraints.earliestStartHour,
            constraints.latestEndHour
          );

          const cycles: IrrigationEvent["cycles"] = [];
          let cursor = startHour;
          for (let c = 0; c < cycleCount; c++) {
            const cycleEnd = cursor + perCycleHours;
            cycles.push({
              startTime: formatHour(cursor),
              endTime: formatHour(cycleEnd),
              durationHours: perCycleHours,
            });
            cursor = cycleEnd + soakMinutes / 60;
          }

          const depletionPct = rawIn > 0 ? (depletion / rawIn) * 100 : 0;
          const gallons = depthToGallons(grossIn, acres);

          events.push({
            date: w.date,
            weekday,
            startTime: formatHour(startHour),
            endTime: formatHour(startHour + totalElapsed),
            durationHours: runHours,
            netDepthIn: netApplied,
            grossDepthIn: grossIn,
            gallons,
            gallonsPerAcre: acres > 0 ? gallons / acres : 0,
            cycles,
            soakMinutesBetweenCycles: soakMinutes,
            depletionAtStartPct: depletionPct,
            reason: buildReason(day, depletion, rawIn, nextOpportunity - i, allocation),
          });

          totals.irrigationCount += 1;
          totals.totalGallons += gallons;
          spentByStage[stage] = spent + netApplied;

          // Being capped at the system's capacity is normal and harmless as long
          // as the profile still comes back to full. It only matters when the set
          // leaves the block meaningfully short, so that is what gets counted.
          if (budget == null && depletion - netApplied > rawIn * 0.5) {
            shortfallDays += 1;
            worstShortfallIn = Math.max(worstShortfallIn, depletion - netApplied);
          }
        }
      }
    }

    // --- Apply the balance for the day --------------------------------------
    depletion -= irrigationIn;
    const effRain = effectiveRainfall(w.rainIn, soil);
    depletion -= effRain;

    // Water that arrives when the profile is already full drains past the roots.
    let deepPercolation = 0;
    if (depletion < 0) {
      deepPercolation = -depletion;
      depletion = 0;
    }

    // Stress reduces actual water use once depletion passes the readily
    // available threshold (FAO-56 eq. 84).
    const ks =
      depletion <= rawIn
        ? 1
        : clamp((tawIn - depletion) / Math.max(0.01, tawIn - rawIn), 0, 1);
    const etActual = day.etcIn * ks;
    depletion += etActual;
    depletion = clamp(depletion, 0, tawIn);

    totals.etoIn += w.etoIn;
    totals.etcIn += day.etcIn;
    totals.etActualIn += etActual;
    totals.rainIn += w.rainIn;
    totals.effectiveRainIn += effRain;
    totals.netIrrigationIn += irrigationIn;
    totals.grossIrrigationIn += grossIn;
    totals.deepPercolationIn += deepPercolation;

    balance.push({
      date: w.date,
      dayOfYear: w.dayOfYear,
      dayInSeason: day.dayInSeason,
      stage,
      kc: day.kc,
      etoIn: w.etoIn,
      etcIn: day.etcIn,
      etActualIn: etActual,
      rainIn: w.rainIn,
      effectiveRainIn: effRain,
      irrigationIn,
      grossIrrigationIn: grossIn,
      depletionIn: depletion,
      tawIn,
      rawIn,
      soilWaterFraction: tawIn > 0 ? clamp(1 - depletion / tawIn, 0, 1) : 1,
      stressCoefficient: ks,
      irrigated,
      deepPercolationIn: deepPercolation,
    });
  }

  if (budgetExhaustedDays > 0) {
    warnings.add(
      `The water ration for this field runs out on ${budgetExhaustedDays} day${budgetExhaustedDays === 1 ? "" : "s"} ` +
        `when the crop was asking to be watered. Those days are left dry on purpose so that the season fits ` +
        `inside the allocation.`
    );
  }

  if (shortfallDays > 0) {
    warnings.add(
      `On ${shortfallDays} day${shortfallDays === 1 ? "" : "s"} the system could not refill the root zone ` +
        `in the ${usableHours.toFixed(0)} hours available -- the worst set left the block ` +
        `${worstShortfallIn.toFixed(2)} in short. Add an irrigation day, widen the watering window, ` +
        `or increase the system's flow rate.`
    );
  }

  // Flag any sustained stress the grower did not ask for.
  const stressDays = balance.filter((b) => b.stressCoefficient < 0.95 && b.stage !== "dormant");
  if (stressDays.length > balance.length * 0.15) {
    warnings.add(
      `The crop is short of water on ${stressDays.length} days of this plan. ` +
        `Either more irrigation days, longer sets, or a higher water allocation is needed to avoid yield loss.`
    );
  }

  return { balance, events, warnings: [...warnings], totals };
}

function buildReason(
  day: { etcIn: number; stage: GrowthStage; position: { sensitivity: number } },
  depletion: number,
  rawIn: number,
  daysToNext: number,
  allocation: number
): string {
  const pct = rawIn > 0 ? Math.round((depletion / rawIn) * 100) : 0;
  const parts: string[] = [];
  parts.push(`Soil has used ${pct}% of the water the crop can comfortably draw on.`);
  parts.push(
    daysToNext <= 1
      ? `The crop is using about ${day.etcIn.toFixed(2)} in/day, so waiting another day would take the block past the point where it starts to feel short.`
      : `The crop is using about ${day.etcIn.toFixed(2)} in/day and the next day you can run water is ${daysToNext} days away, so the profile is filled now to cover the gap.`
  );
  if (allocation < 0.98) {
    parts.push(
      `Water is being rationed to ${Math.round(allocation * 100)}% of full demand during the ${day.stage} stage.`
    );
  }
  return parts.join(" ");
}

export { effectiveRainfall, totalSeasonDays, stagePosition };
