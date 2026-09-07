/**
 * Regulated deficit irrigation: deciding where to take the water away.
 *
 * When a grower's allocation is smaller than what the crop wants -- an SGMA
 * pumping cap, a short district delivery, a dry year -- the question is not
 * whether to cut but where. Cutting evenly across the season is the worst option:
 * it spends the same water while taking the loss during the weeks the crop can
 * least afford it.
 *
 * This module spreads the shortfall onto the growth stages that tolerate it,
 * protecting the sensitive ones, and estimates what the resulting yield looks
 * like using the FAO-33 stage-wise yield response relation.
 */

import type { Crop, GrowthStage } from "./crops";
import type { DeficitPlan } from "../types";
import { clamp } from "../units";

const STAGES: GrowthStage[] = ["initial", "development", "mid", "late"];

export interface StageDemand {
  stage: GrowthStage;
  /** Full (unstressed) crop water requirement accumulated in this stage, inches. */
  etcIn: number;
}

/**
 * A baseline "no restriction" allocation, used whenever the grower has water enough.
 */
export const FULL_ALLOCATION: Record<GrowthStage, number> = {
  dormant: 1,
  initial: 1,
  development: 1,
  mid: 1,
  late: 1,
};

/**
 * Work out the share of full demand to deliver in each growth stage so that the
 * season fits inside `availableNetIn`.
 *
 * Each stage gets a cut weight of (1 - sensitivity), plus a small floor so that a
 * crop whose stages are all rated highly sensitive still yields a solvable
 * allocation rather than dividing by zero. The result is clamped to a minimum
 * delivery per stage -- taking a stage below about 45% of demand stops being
 * regulated deficit irrigation and starts being crop failure.
 */
export function allocateDeficit(
  crop: Crop,
  stageDemands: StageDemand[],
  availableNetIn: number,
  minStageDelivery = 0.45
): { allocation: Record<GrowthStage, number>; strategy: string[] } {
  const allocation: Record<GrowthStage, number> = { ...FULL_ALLOCATION };
  const strategy: string[] = [];

  const totalDemand = stageDemands.reduce((sum, s) => sum + s.etcIn, 0);
  if (totalDemand <= 0 || availableNetIn >= totalDemand) {
    return { allocation, strategy };
  }

  const shortfall = totalDemand - availableNetIn;
  const weights = new Map<GrowthStage, number>();
  for (const stage of STAGES) {
    const sensitivity = crop.stageSensitivity[stage as keyof typeof crop.stageSensitivity] ?? 1;
    // A floor of 0.12 guarantees every stage can absorb at least a little of the cut.
    weights.set(stage, 1 - sensitivity + 0.12);
  }

  // Solve iteratively: stages that hit the delivery floor stop absorbing more of
  // the shortfall, so the remainder is redistributed over the stages still free.
  const locked = new Set<GrowthStage>();
  let remainingShortfall = shortfall;

  for (let iteration = 0; iteration < 6; iteration++) {
    const free = stageDemands.filter((s) => !locked.has(s.stage) && s.etcIn > 0);
    const weightedDemand = free.reduce(
      (sum, s) => sum + (weights.get(s.stage) ?? 0) * s.etcIn,
      0
    );
    if (weightedDemand <= 0 || remainingShortfall <= 1e-6) break;

    const k = remainingShortfall / weightedDemand;
    let newlyLocked = false;

    for (const s of free) {
      const raw = 1 - k * (weights.get(s.stage) ?? 0);
      if (raw < minStageDelivery) {
        allocation[s.stage] = minStageDelivery;
        locked.add(s.stage);
        remainingShortfall -= (1 - minStageDelivery) * s.etcIn;
        newlyLocked = true;
      } else {
        allocation[s.stage] = clamp(raw, minStageDelivery, 1);
      }
    }
    if (!newlyLocked) break;
  }

  // Describe the plan in the terms an agronomist would use.
  const ordered = [...STAGES].sort((a, b) => allocation[a] - allocation[b]);
  const hardest = ordered[0];
  const gentlest = ordered[ordered.length - 1];

  strategy.push(
    `Water available covers ${Math.round((availableNetIn / totalDemand) * 100)}% of what the crop would use with no restriction.`
  );
  strategy.push(
    `The largest cut falls on the ${stageLabel(hardest)} stage (${Math.round(allocation[hardest] * 100)}% of full water), which tolerates stress best for this crop.`
  );
  strategy.push(
    `The ${stageLabel(gentlest)} stage is protected at ${Math.round(allocation[gentlest] * 100)}% of full water.`
  );
  if (crop.notes) strategy.push(crop.notes);

  return { allocation, strategy };
}

function stageLabel(stage: GrowthStage): string {
  switch (stage) {
    case "initial":
      return "early season";
    case "development":
      return "canopy development";
    case "mid":
      return "peak growth";
    case "late":
      return "late season";
    default:
      return "dormant";
  }
}

/**
 * Estimated relative yield under a deficit, using the FAO-33 relation applied
 * stage by stage:
 *
 *   Ya/Ym = product over stages of [1 - Ky_stage * (1 - ETa/ETc)]
 *
 * Ky is scaled by each stage's sensitivity, so a deficit taken during a tolerant
 * stage costs far less yield than the same deficit taken at flowering.
 */
export function estimateRelativeYield(
  crop: Crop,
  stageActual: { stage: GrowthStage; etcIn: number; etActualIn: number }[]
): number {
  let relative = 1;
  for (const s of stageActual) {
    if (s.etcIn <= 0) continue;
    const deficitRatio = clamp(1 - s.etActualIn / s.etcIn, 0, 1);
    if (deficitRatio <= 0) continue;
    const sensitivity =
      crop.stageSensitivity[s.stage as keyof typeof crop.stageSensitivity] ?? 1;
    const ky = crop.yieldResponseKy * sensitivity;
    relative *= Math.max(0, 1 - ky * deficitRatio);
  }
  return clamp(relative, 0, 1);
}

export function buildDeficitPlan(params: {
  applied: boolean;
  availableIn: number;
  requiredIn: number;
  relativeYield: number;
  strategy: string[];
}): DeficitPlan {
  const { applied, availableIn, requiredIn, relativeYield, strategy } = params;
  return {
    applied,
    availableIn,
    requiredIn,
    deliveryRatio: requiredIn > 0 ? clamp(availableIn / requiredIn, 0, 1) : 1,
    estimatedRelativeYield: relativeYield,
    strategy,
  };
}
