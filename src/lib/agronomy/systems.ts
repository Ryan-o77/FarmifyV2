/**
 * Irrigation systems: how fast water goes on, and how much of it the crop gets.
 *
 * Two numbers do the work here.
 *
 *   Application rate  -- inches of water applied per hour of run time. This is
 *                        what turns a required depth into a set time on the clock.
 *   Application efficiency -- the share of pumped water that ends up as stored
 *                        soil moisture in the root zone. Everything else is
 *                        evaporation, wind drift, runoff and deep percolation.
 *
 * Efficiency and distribution uniformity figures follow the ASABE / USDA-NRCS
 * irrigation guide ranges as used in California mobile lab evaluations.
 */

import { GALLONS_PER_ACRE_INCH } from "../units";

export type SystemCategory = "drip" | "micro" | "sprinkler" | "surface";

export interface IrrigationSystem {
  id: string;
  name: string;
  category: SystemCategory;
  /** Fraction of applied water stored in the root zone under good management. */
  applicationEfficiency: number;
  /**
   * Distribution uniformity of the low quarter (DUlq). Because the driest quarter
   * of the field sets the yield, a plan must apply enough to satisfy *it*, not the average.
   */
  distributionUniformity: number;
  /** Typical application rate, inches per hour, when the grower does not know theirs. */
  typicalRateInPerHr: number;
  /** True when the system wets only a strip or basin rather than the whole surface. */
  partialWetting: boolean;
  /** Fraction of the surface wetted, for partial-wetting systems. */
  wettedFraction: number;
  /** Smallest practical set, hours. Very short drip sets never reach steady state. */
  minSetHours: number;
  /** Largest sensible single set, hours, before deep percolation dominates. */
  maxSetHours: number;
  description: string;
}

export const SYSTEMS: IrrigationSystem[] = [
  {
    id: "drip-surface",
    name: "Surface drip line",
    category: "drip",
    applicationEfficiency: 0.9,
    distributionUniformity: 0.87,
    typicalRateInPerHr: 0.08,
    partialWetting: true,
    wettedFraction: 0.4,
    minSetHours: 1,
    maxSetHours: 24,
    description: "Emitters on a hose along the row. Slow, precise, and the least wasteful option.",
  },
  {
    id: "drip-buried",
    name: "Buried drip (SDI)",
    category: "drip",
    applicationEfficiency: 0.93,
    distributionUniformity: 0.9,
    typicalRateInPerHr: 0.08,
    partialWetting: true,
    wettedFraction: 0.45,
    minSetHours: 1,
    maxSetHours: 24,
    description: "Drip line buried below the surface. No surface evaporation at all.",
  },
  {
    id: "micro-sprinkler",
    name: "Micro-sprinkler / fanjet",
    category: "micro",
    applicationEfficiency: 0.85,
    distributionUniformity: 0.83,
    typicalRateInPerHr: 0.12,
    partialWetting: true,
    wettedFraction: 0.6,
    minSetHours: 1,
    maxSetHours: 24,
    description: "Small sprinklers under the trees. Standard in valley orchards; wets more soil than drip.",
  },
  {
    id: "solid-set-sprinkler",
    name: "Solid-set sprinkler",
    category: "sprinkler",
    applicationEfficiency: 0.75,
    distributionUniformity: 0.75,
    typicalRateInPerHr: 0.2,
    partialWetting: false,
    wettedFraction: 1,
    minSetHours: 0.5,
    maxSetHours: 12,
    description: "Overhead sprinklers across the whole field. Loses water to wind and evaporation.",
  },
  {
    id: "hand-move-sprinkler",
    name: "Hand-move / wheel line",
    category: "sprinkler",
    applicationEfficiency: 0.7,
    distributionUniformity: 0.7,
    typicalRateInPerHr: 0.22,
    partialWetting: false,
    wettedFraction: 1,
    minSetHours: 4,
    maxSetHours: 12,
    description: "Pipe moved between sets by hand. Cheap to install, more water and labour per acre.",
  },
  {
    id: "linear-pivot",
    name: "Centre pivot / linear move",
    category: "sprinkler",
    applicationEfficiency: 0.85,
    distributionUniformity: 0.85,
    typicalRateInPerHr: 0.35,
    partialWetting: false,
    wettedFraction: 1,
    minSetHours: 0.5,
    maxSetHours: 24,
    description: "Self-propelled overhead boom. Efficient, but rare on small valley parcels.",
  },
  {
    id: "furrow",
    name: "Furrow irrigation",
    category: "surface",
    applicationEfficiency: 0.65,
    distributionUniformity: 0.7,
    typicalRateInPerHr: 0.5,
    partialWetting: true,
    wettedFraction: 0.5,
    minSetHours: 4,
    maxSetHours: 24,
    description: "Water run down furrows between rows. The top of the run always gets more than the tail.",
  },
  {
    id: "border-flood",
    name: "Border check / flood",
    category: "surface",
    applicationEfficiency: 0.7,
    distributionUniformity: 0.75,
    typicalRateInPerHr: 0.75,
    partialWetting: false,
    wettedFraction: 1,
    minSetHours: 4,
    maxSetHours: 24,
    description: "The field is flooded between borders. Common on alfalfa and pasture.",
  },
];

export function getSystem(systemId: string): IrrigationSystem {
  const system = SYSTEMS.find((s) => s.id === systemId);
  if (!system) throw new Error(`Unknown irrigation system: ${systemId}`);
  return system;
}

export interface EmitterLayout {
  /** Nominal emitter discharge, gallons per hour. */
  emitterGph: number;
  /** Spacing between emitters along the line, feet. */
  emitterSpacingFt: number;
  /** Spacing between lines (or tree rows), feet. */
  lateralSpacingFt: number;
  /** Emitters per tree, for orchards plumbed per tree rather than per foot of row. */
  emittersPerTree?: number;
  /** Tree or vine spacing, feet, when emitters are counted per tree. */
  treeSpacingFt?: number;
  rowSpacingFt?: number;
}

/**
 * Application rate in inches per hour from an emitter layout.
 *
 * One acre-inch is 27,154 gallons, so the rate over the whole field is simply
 * total gallons per hour per acre divided by that constant. Note this is the rate
 * *averaged over the field*, which is the correct basis for a water balance even
 * though a drip system concentrates that water into a wetted strip.
 */
export function applicationRateFromEmitters(layout: EmitterLayout): number {
  let emittersPerAcre: number;

  if (layout.emittersPerTree && layout.treeSpacingFt && layout.rowSpacingFt) {
    const treesPerAcre = 43560 / (layout.treeSpacingFt * layout.rowSpacingFt);
    emittersPerAcre = treesPerAcre * layout.emittersPerTree;
  } else {
    const emittersPerLinearFt = 1 / Math.max(0.1, layout.emitterSpacingFt);
    const linearFtPerAcre = 43560 / Math.max(0.1, layout.lateralSpacingFt);
    emittersPerAcre = emittersPerLinearFt * linearFtPerAcre;
  }

  const gphPerAcre = emittersPerAcre * layout.emitterGph;
  return gphPerAcre / GALLONS_PER_ACRE_INCH;
}

/** Application rate, inches per hour, from a measured flow onto a known area. */
export function applicationRateFromFlow(gpm: number, acres: number): number {
  if (acres <= 0) return 0;
  return (gpm * 60) / (acres * GALLONS_PER_ACRE_INCH);
}

/**
 * The share of a net requirement that must actually be pumped.
 *
 * Two separate losses stack. Application efficiency covers water that never
 * becomes stored soil moisture. Distribution uniformity covers the fact that the
 * driest quarter of the field receives less than the average, so watering to the
 * average leaves that quarter short. Irrigating to the low quarter is what keeps
 * the weak end of the field in production.
 */
export function grossApplicationFactor(
  system: IrrigationSystem,
  overrides?: { applicationEfficiency?: number; distributionUniformity?: number }
): number {
  const ae = overrides?.applicationEfficiency ?? system.applicationEfficiency;
  const du = overrides?.distributionUniformity ?? system.distributionUniformity;
  const efficiency = Math.min(0.98, Math.max(0.3, ae));
  const uniformity = Math.min(0.98, Math.max(0.4, du));
  // Published application efficiencies already absorb typical non-uniformity, so
  // dividing by DU outright would charge for the same loss twice. What is added
  // here is only the extra water needed to bring the *driest quarter* up to the
  // target when uniformity is worse than typical for the system type.
  const uniformityPenalty = 1 / (0.75 + 0.25 * uniformity);
  return uniformityPenalty / efficiency;
}

/**
 * Whether an application rate outruns the soil's ability to take water in.
 * When it does, the fix is cycle-and-soak: split the set into shorter pulses
 * with rest between them so the water has time to move down instead of off.
 */
export function checkRunoffRisk(
  applicationRateInPerHr: number,
  infiltrationInPerHr: number
): { atRisk: boolean; ratio: number; suggestedCycles: number } {
  const ratio = applicationRateInPerHr / Math.max(0.01, infiltrationInPerHr);
  if (ratio <= 1) return { atRisk: false, ratio, suggestedCycles: 1 };
  return {
    atRisk: true,
    ratio,
    suggestedCycles: Math.min(4, Math.ceil(ratio)),
  };
}
