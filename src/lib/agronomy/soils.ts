/**
 * Soil water-holding properties.
 *
 * The soil is the reservoir. Its size sets how much water can be stored in one
 * irrigation, and therefore how long a grower can go between sets: a sandy field
 * holds under an inch of usable water per foot of root zone and must be watered
 * every two or three days in July, while a clay loam holds more than twice that.
 *
 * Available water capacity figures follow the USDA-NRCS textural class defaults,
 * consistent with the ranges in FAO-56 Table 19. Infiltration rates are the basic
 * (steady-state) rates used to check that an irrigation system is not applying
 * water faster than the ground can take it.
 */

export interface Soil {
  id: string;
  name: string;
  /**
   * Total available water: the depth of water held between field capacity and
   * permanent wilting point, expressed as inches of water per foot of soil.
   */
  availableWaterInPerFt: number;
  /** Steady-state infiltration rate, inches per hour. Runoff begins above this. */
  infiltrationInPerHr: number;
  /**
   * Multiplier on the crop's depletion fraction. Heavy soils release their last
   * increments of water reluctantly, so stress arrives a little earlier than the
   * textural water content alone suggests.
   */
  depletionAdjustment: number;
  description: string;
  /** Plain-language cue a grower can check by hand, without instruments. */
  fieldTest: string;
}

export const SOILS: Soil[] = [
  {
    id: "sand",
    name: "Sand",
    availableWaterInPerFt: 0.75,
    infiltrationInPerHr: 2.0,
    depletionAdjustment: 1.05,
    description: "Water moves through fast and is not held for long. Small, frequent irrigations.",
    fieldTest: "Will not hold a shape when you squeeze it, even when wet. Feels gritty.",
  },
  {
    id: "loamy-sand",
    name: "Loamy sand",
    availableWaterInPerFt: 1.05,
    infiltrationInPerHr: 1.4,
    depletionAdjustment: 1.05,
    description: "Still drains quickly but holds noticeably more than pure sand.",
    fieldTest: "Forms a weak ball when wet that falls apart as soon as you touch it.",
  },
  {
    id: "sandy-loam",
    name: "Sandy loam",
    availableWaterInPerFt: 1.35,
    infiltrationInPerHr: 1.0,
    depletionAdjustment: 1.0,
    description: "Common on the valley's east side. Good drainage with usable storage.",
    fieldTest: "Forms a ball that survives careful handling. Feels gritty with some smoothness.",
  },
  {
    id: "loam",
    name: "Loam",
    availableWaterInPerFt: 1.75,
    infiltrationInPerHr: 0.6,
    depletionAdjustment: 1.0,
    description: "The balanced case: good storage and good drainage.",
    fieldTest: "Forms a firm ball. Ribbons out to about an inch before breaking.",
  },
  {
    id: "silt-loam",
    name: "Silt loam",
    availableWaterInPerFt: 2.0,
    infiltrationInPerHr: 0.5,
    depletionAdjustment: 0.95,
    description: "Holds the most usable water of any common valley soil.",
    fieldTest: "Feels smooth, almost floury when dry. Ribbons about an inch.",
  },
  {
    id: "clay-loam",
    name: "Clay loam",
    availableWaterInPerFt: 1.9,
    infiltrationInPerHr: 0.3,
    depletionAdjustment: 0.9,
    description: "Large reservoir, but water enters slowly. Long, slow sets prevent runoff.",
    fieldTest: "Forms a strong ball and ribbons one to two inches. Feels sticky when wet.",
  },
  {
    id: "clay",
    name: "Clay",
    availableWaterInPerFt: 1.8,
    infiltrationInPerHr: 0.15,
    depletionAdjustment: 0.85,
    description: "Very slow to take water and slow to release it. Watch for standing water.",
    fieldTest: "Ribbons more than two inches without breaking. Very sticky and plastic when wet.",
  },
  {
    id: "hardpan",
    name: "Sandy loam over hardpan",
    availableWaterInPerFt: 1.2,
    infiltrationInPerHr: 0.8,
    depletionAdjustment: 1.1,
    description:
      "A cemented layer stops roots and water at shallow depth. The usable reservoir is much smaller than the texture suggests.",
    fieldTest: "A shovel or auger strikes a hard, cemented layer within two to three feet.",
  },
];

export function getSoil(soilId: string): Soil {
  const soil = SOILS.find((s) => s.id === soilId);
  if (!soil) throw new Error(`Unknown soil: ${soilId}`);
  return soil;
}

export const M_PER_FT = 0.3048;

/**
 * Total available water in the root zone, inches.
 *
 * `rootDepthM` is capped by any restrictive layer: roots cannot use water they
 * cannot reach, and planning against a two-metre root zone over a hardpan at
 * three feet is the single most common way to under-irrigate an orchard.
 */
export function totalAvailableWater(
  soil: Soil,
  rootDepthM: number,
  restrictiveLayerDepthFt?: number | null
): number {
  const rootDepthFt = rootDepthM / M_PER_FT;
  const effectiveFt =
    restrictiveLayerDepthFt && restrictiveLayerDepthFt > 0
      ? Math.min(rootDepthFt, restrictiveLayerDepthFt)
      : rootDepthFt;
  return soil.availableWaterInPerFt * Math.max(0.1, effectiveFt);
}

/**
 * Readily available water, inches: how much of the reservoir may be spent before
 * the crop starts closing stomata and losing yield. This is the number that sets
 * the interval between irrigations.
 */
export function readilyAvailableWater(
  soil: Soil,
  rootDepthM: number,
  cropDepletionFraction: number,
  restrictiveLayerDepthFt?: number | null
): number {
  const taw = totalAvailableWater(soil, rootDepthM, restrictiveLayerDepthFt);
  const p = Math.min(0.8, Math.max(0.1, cropDepletionFraction * soil.depletionAdjustment));
  return taw * p;
}

/**
 * FAO-56 eq. 84: the depletion fraction rises in cool weather and falls in hot
 * weather. A crop losing 8 mm a day wilts at a lower depletion than the same crop
 * losing 3 mm a day, because the roots cannot keep up with peak demand.
 */
export function adjustDepletionForEt(p: number, etcMmPerDay: number): number {
  const adjusted = p + 0.04 * (5 - etcMmPerDay);
  return Math.min(0.8, Math.max(0.1, adjusted));
}
