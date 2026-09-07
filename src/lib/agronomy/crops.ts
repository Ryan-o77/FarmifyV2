/**
 * Crop coefficients for San Joaquin Valley cropping systems.
 *
 * Structure follows the FAO-56 single-crop-coefficient method: a crop's water use
 * is ETc = Kc * ETo, where Kc traces a four-stage curve (initial, development,
 * mid-season, late season). Tabulated Kc values come from FAO-56 Tables 11, 12 and
 * 17, adjusted toward the values California's cooperative extension publishes for
 * these crops where the two differ -- FAO's generic orchard entries assume smaller,
 * less densely planted trees than a modern Central Valley block.
 *
 * Kc_mid and Kc_end are further adjusted for local wind and humidity at run time
 * (FAO-56 eq. 62), which matters here: the valley is windier and much drier than
 * the sub-humid reference conditions the tables are published for.
 *
 * Sources:
 *   FAO-56 (Allen et al. 1998), Tables 11, 12, 17, 22 and eq. 62, 65, 66.
 *   FAO-33 (Doorenbos & Kassam 1979) for the yield response factor Ky.
 *   UC ANR / UC Drought Management crop ET references for California Kc curves.
 */

export type CropCategory = "orchard" | "vine" | "row" | "field" | "vegetable" | "forage";

export interface CropStageLengths {
  /** Planting or leaf-out to ~10% ground cover. */
  initialDays: number;
  /** Rapid canopy expansion up to effective full cover. */
  developmentDays: number;
  /** Full cover through the start of maturity -- the peak water use period. */
  midDays: number;
  /** Maturity to harvest or leaf drop. */
  lateDays: number;
}

export interface Crop {
  id: string;
  name: string;
  category: CropCategory;
  /** True for trees, vines and alfalfa: the season is anchored to the calendar, not a planting date. */
  perennial: boolean;
  stages: CropStageLengths;
  /** Tabulated FAO-56 crop coefficients before the climate adjustment. */
  kcInitial: number;
  kcMid: number;
  kcEnd: number;
  /** Mean crop height at mid-season, m. Drives the eq. 62 climate adjustment. */
  heightM: number;
  /** Maximum effective rooting depth, m. */
  rootDepthM: number;
  /** Rooting depth at the start of the season, m. */
  initialRootDepthM: number;
  /**
   * Soil water depletion fraction for no stress (FAO-56 p). The share of plant
   * available water that may be used before the crop begins to close stomata.
   */
  depletionFraction: number;
  /** Yield response factor Ky (FAO-33): fractional yield loss per fractional ET deficit. */
  yieldResponseKy: number;
  /**
   * Relative sensitivity of each growth stage to water stress, 0-1.
   * Used to steer regulated deficit irrigation toward the stages that tolerate it.
   */
  stageSensitivity: { initial: number; development: number; mid: number; late: number };
  /** For perennials: the calendar day leaf-out/green-up usually begins in the SJV. */
  seasonStart?: { month: number; day: number };
  /** Typical planting window for annuals, shown as a hint in the UI. */
  typicalPlanting?: string;
  /** Alfalfa and other repeatedly harvested forages reset their canopy on this cycle. */
  cuttingCycleDays?: number;
  notes: string;
}

export const CROPS: Crop[] = [
  {
    id: "almond",
    name: "Almonds",
    category: "orchard",
    perennial: true,
    stages: { initialDays: 30, developmentDays: 50, midDays: 130, lateDays: 40 },
    kcInitial: 0.4,
    kcMid: 1.05,
    kcEnd: 0.65,
    heightM: 5,
    rootDepthM: 1.8,
    initialRootDepthM: 1.2,
    depletionFraction: 0.4,
    yieldResponseKy: 0.9,
    stageSensitivity: { initial: 0.6, development: 0.9, mid: 1.0, late: 0.4 },
    seasonStart: { month: 2, day: 20 },
    notes:
      "Hull split (mid-July to early August) is the one window where controlled stress is beneficial: it tightens hull split and suppresses hull rot. Full water is critical from leaf-out through kernel fill.",
  },
  {
    id: "pistachio",
    name: "Pistachios",
    category: "orchard",
    perennial: true,
    stages: { initialDays: 20, developmentDays: 50, midDays: 130, lateDays: 40 },
    kcInitial: 0.4,
    kcMid: 1.1,
    kcEnd: 0.45,
    heightM: 4,
    rootDepthM: 1.5,
    initialRootDepthM: 1.0,
    depletionFraction: 0.4,
    yieldResponseKy: 0.85,
    stageSensitivity: { initial: 0.5, development: 0.7, mid: 1.0, late: 0.4 },
    seasonStart: { month: 4, day: 1 },
    notes:
      "Tolerates moderate deficit during Stage II (shell hardening, roughly late May to early July) better than most tree crops. Stress during nut fill costs yield directly.",
  },
  {
    id: "walnut",
    name: "Walnuts",
    category: "orchard",
    perennial: true,
    stages: { initialDays: 20, developmentDays: 40, midDays: 130, lateDays: 30 },
    kcInitial: 0.4,
    kcMid: 1.1,
    kcEnd: 0.65,
    heightM: 6,
    rootDepthM: 2.0,
    initialRootDepthM: 1.2,
    depletionFraction: 0.5,
    yieldResponseKy: 0.9,
    stageSensitivity: { initial: 0.6, development: 0.9, mid: 1.0, late: 0.5 },
    seasonStart: { month: 4, day: 1 },
    notes:
      "Deep rooted and sensitive to both drought and waterlogging. Walnuts are among the least deficit-tolerant orchard crops in the valley.",
  },
  {
    id: "grape-wine",
    name: "Wine grapes",
    category: "vine",
    perennial: true,
    stages: { initialDays: 20, developmentDays: 50, midDays: 75, lateDays: 60 },
    kcInitial: 0.3,
    kcMid: 0.7,
    kcEnd: 0.45,
    heightM: 2,
    rootDepthM: 1.8,
    initialRootDepthM: 1.0,
    depletionFraction: 0.45,
    yieldResponseKy: 0.85,
    stageSensitivity: { initial: 0.5, development: 0.8, mid: 0.9, late: 0.5 },
    seasonStart: { month: 3, day: 15 },
    notes:
      "Deliberate deficit between fruit set and veraison concentrates flavour and is standard practice. This crop absorbs a water cut more gracefully than any other perennial here.",
  },
  {
    id: "grape-table",
    name: "Table grapes",
    category: "vine",
    perennial: true,
    stages: { initialDays: 20, developmentDays: 50, midDays: 90, lateDays: 40 },
    kcInitial: 0.3,
    kcMid: 0.85,
    kcEnd: 0.6,
    heightM: 2,
    rootDepthM: 1.6,
    initialRootDepthM: 1.0,
    depletionFraction: 0.4,
    yieldResponseKy: 0.95,
    stageSensitivity: { initial: 0.6, development: 0.9, mid: 1.0, late: 0.6 },
    seasonStart: { month: 3, day: 10 },
    notes:
      "Berry size is the product, so unlike wine grapes table grapes should not be deficit irrigated during sizing.",
  },
  {
    id: "citrus",
    name: "Citrus (oranges, mandarins)",
    category: "orchard",
    perennial: true,
    stages: { initialDays: 60, developmentDays: 90, midDays: 120, lateDays: 95 },
    kcInitial: 0.65,
    kcMid: 0.7,
    kcEnd: 0.7,
    heightM: 3,
    rootDepthM: 1.4,
    initialRootDepthM: 1.2,
    depletionFraction: 0.5,
    yieldResponseKy: 1.1,
    stageSensitivity: { initial: 0.8, development: 1.0, mid: 1.0, late: 0.8 },
    seasonStart: { month: 1, day: 1 },
    notes:
      "Evergreen: it transpires all twelve months, so irrigation does not stop in winter. Bloom and fruit set in spring are the least forgiving weeks.",
  },
  {
    id: "olive",
    name: "Olives",
    category: "orchard",
    perennial: true,
    stages: { initialDays: 30, developmentDays: 90, midDays: 60, lateDays: 90 },
    kcInitial: 0.65,
    kcMid: 0.7,
    kcEnd: 0.7,
    heightM: 4,
    rootDepthM: 1.5,
    initialRootDepthM: 1.2,
    depletionFraction: 0.65,
    yieldResponseKy: 0.8,
    stageSensitivity: { initial: 0.6, development: 0.9, mid: 0.9, late: 0.5 },
    seasonStart: { month: 3, day: 1 },
    notes: "The most drought-tolerant tree crop grown here; it will survive deficits that would kill an almond block.",
  },
  {
    id: "stone-fruit",
    name: "Peaches, plums & nectarines",
    category: "orchard",
    perennial: true,
    stages: { initialDays: 20, developmentDays: 45, midDays: 105, lateDays: 50 },
    kcInitial: 0.45,
    kcMid: 1.0,
    kcEnd: 0.7,
    heightM: 4,
    rootDepthM: 1.5,
    initialRootDepthM: 1.0,
    depletionFraction: 0.5,
    yieldResponseKy: 0.9,
    stageSensitivity: { initial: 0.6, development: 0.9, mid: 1.0, late: 0.5 },
    seasonStart: { month: 3, day: 1 },
    notes:
      "Post-harvest is the safe window for a deficit on early varieties. Final swell before harvest is not.",
  },
  {
    id: "pomegranate",
    name: "Pomegranates",
    category: "orchard",
    perennial: true,
    stages: { initialDays: 25, developmentDays: 50, midDays: 105, lateDays: 40 },
    kcInitial: 0.4,
    kcMid: 0.85,
    kcEnd: 0.55,
    heightM: 3,
    rootDepthM: 1.3,
    initialRootDepthM: 0.9,
    depletionFraction: 0.5,
    yieldResponseKy: 0.85,
    stageSensitivity: { initial: 0.5, development: 0.8, mid: 1.0, late: 0.6 },
    seasonStart: { month: 3, day: 15 },
    notes: "Swings in soil moisture late in the season split fruit; steadiness matters more than total amount.",
  },
  {
    id: "blueberry",
    name: "Blueberries",
    category: "orchard",
    perennial: true,
    stages: { initialDays: 25, developmentDays: 45, midDays: 100, lateDays: 40 },
    kcInitial: 0.3,
    kcMid: 1.05,
    kcEnd: 0.5,
    heightM: 1.5,
    rootDepthM: 0.9,
    initialRootDepthM: 0.6,
    depletionFraction: 0.35,
    yieldResponseKy: 1.0,
    stageSensitivity: { initial: 0.7, development: 0.9, mid: 1.0, late: 0.6 },
    seasonStart: { month: 3, day: 1 },
    notes:
      "Shallow, fibrous roots with almost no buffer. Blueberries need small, frequent irrigations rather than large infrequent ones.",
  },
  {
    id: "alfalfa",
    name: "Alfalfa",
    category: "forage",
    perennial: true,
    stages: { initialDays: 10, developmentDays: 20, midDays: 250, lateDays: 30 },
    kcInitial: 0.4,
    kcMid: 1.2,
    kcEnd: 1.15,
    heightM: 0.7,
    rootDepthM: 2.0,
    initialRootDepthM: 1.2,
    depletionFraction: 0.55,
    yieldResponseKy: 1.1,
    stageSensitivity: { initial: 0.7, development: 0.9, mid: 1.0, late: 0.7 },
    seasonStart: { month: 3, day: 1 },
    cuttingCycleDays: 28,
    notes:
      "The thirstiest crop in the valley, and the most forgiving of a deficit: it goes dormant under stress and recovers at the next irrigation. Water use drops sharply for a few days after each cutting.",
  },
  {
    id: "cotton",
    name: "Cotton (Pima / Upland)",
    category: "field",
    perennial: false,
    stages: { initialDays: 30, developmentDays: 50, midDays: 60, lateDays: 55 },
    kcInitial: 0.35,
    kcMid: 1.18,
    kcEnd: 0.6,
    heightM: 1.35,
    rootDepthM: 1.5,
    initialRootDepthM: 0.3,
    depletionFraction: 0.65,
    yieldResponseKy: 0.85,
    stageSensitivity: { initial: 0.5, development: 0.8, mid: 1.0, late: 0.4 },
    typicalPlanting: "Late March to late April",
    notes: "Cutting water off late promotes cut-out and an even harvest; early-season stress causes rank growth.",
  },
  {
    id: "corn-grain",
    name: "Corn (grain)",
    category: "field",
    perennial: false,
    stages: { initialDays: 30, developmentDays: 40, midDays: 50, lateDays: 30 },
    kcInitial: 0.3,
    kcMid: 1.2,
    kcEnd: 0.35,
    heightM: 2,
    rootDepthM: 1.4,
    initialRootDepthM: 0.3,
    depletionFraction: 0.55,
    yieldResponseKy: 1.25,
    stageSensitivity: { initial: 0.4, development: 0.8, mid: 1.0, late: 0.5 },
    typicalPlanting: "Late April to early June",
    notes: "Tasseling and silking are the single most stress-sensitive two weeks of any crop grown here.",
  },
  {
    id: "corn-silage",
    name: "Corn (silage)",
    category: "field",
    perennial: false,
    stages: { initialDays: 25, developmentDays: 35, midDays: 45, lateDays: 20 },
    kcInitial: 0.3,
    kcMid: 1.2,
    kcEnd: 1.05,
    heightM: 2,
    rootDepthM: 1.4,
    initialRootDepthM: 0.3,
    depletionFraction: 0.55,
    yieldResponseKy: 1.2,
    stageSensitivity: { initial: 0.4, development: 0.8, mid: 1.0, late: 0.7 },
    typicalPlanting: "Late April to July (double crop)",
    notes: "Harvested green, so water is not cut off before harvest the way it is for grain corn.",
  },
  {
    id: "tomato-processing",
    name: "Processing tomatoes",
    category: "row",
    perennial: false,
    stages: { initialDays: 30, developmentDays: 40, midDays: 45, lateDays: 30 },
    kcInitial: 0.3,
    kcMid: 1.15,
    kcEnd: 0.6,
    heightM: 0.6,
    rootDepthM: 1.2,
    initialRootDepthM: 0.25,
    depletionFraction: 0.4,
    yieldResponseKy: 1.05,
    stageSensitivity: { initial: 0.6, development: 0.9, mid: 1.0, late: 0.3 },
    typicalPlanting: "March to May (transplant)",
    notes:
      "Water is deliberately cut off two to three weeks before harvest to raise soluble solids and firm the fruit for machine picking.",
  },
  {
    id: "melon",
    name: "Melons & cantaloupe",
    category: "row",
    perennial: false,
    stages: { initialDays: 25, developmentDays: 35, midDays: 40, lateDays: 20 },
    kcInitial: 0.5,
    kcMid: 0.85,
    kcEnd: 0.6,
    heightM: 0.4,
    rootDepthM: 1.0,
    initialRootDepthM: 0.25,
    depletionFraction: 0.4,
    yieldResponseKy: 1.05,
    stageSensitivity: { initial: 0.6, development: 0.9, mid: 1.0, late: 0.4 },
    typicalPlanting: "March to June",
    notes: "Easing off during ripening raises sugar; irrigating hard right before harvest dilutes it and splits fruit.",
  },
  {
    id: "garlic",
    name: "Garlic",
    category: "vegetable",
    perennial: false,
    stages: { initialDays: 20, developmentDays: 40, midDays: 110, lateDays: 40 },
    kcInitial: 0.7,
    kcMid: 1.0,
    kcEnd: 0.7,
    heightM: 0.3,
    rootDepthM: 0.45,
    initialRootDepthM: 0.15,
    depletionFraction: 0.3,
    yieldResponseKy: 1.05,
    stageSensitivity: { initial: 0.7, development: 0.9, mid: 1.0, late: 0.4 },
    typicalPlanting: "October to November",
    notes: "Shallow rooted: it needs frequent light irrigations. Dry it down before harvest so the bulbs cure.",
  },
  {
    id: "onion",
    name: "Onions (dry bulb)",
    category: "vegetable",
    perennial: false,
    stages: { initialDays: 20, developmentDays: 35, midDays: 110, lateDays: 45 },
    kcInitial: 0.7,
    kcMid: 1.05,
    kcEnd: 0.75,
    heightM: 0.4,
    rootDepthM: 0.5,
    initialRootDepthM: 0.15,
    depletionFraction: 0.3,
    yieldResponseKy: 1.1,
    stageSensitivity: { initial: 0.7, development: 0.9, mid: 1.0, late: 0.4 },
    typicalPlanting: "October (overwinter) or January to February",
    notes: "Very shallow rooted and unusually sensitive to any depletion; bulbing is the critical stage.",
  },
  {
    id: "lettuce",
    name: "Lettuce & leafy greens",
    category: "vegetable",
    perennial: false,
    stages: { initialDays: 20, developmentDays: 30, midDays: 15, lateDays: 10 },
    kcInitial: 0.7,
    kcMid: 1.0,
    kcEnd: 0.95,
    heightM: 0.3,
    rootDepthM: 0.4,
    initialRootDepthM: 0.15,
    depletionFraction: 0.3,
    yieldResponseKy: 0.9,
    stageSensitivity: { initial: 0.8, development: 1.0, mid: 1.0, late: 0.9 },
    typicalPlanting: "September to October, or January to February",
    notes: "Short season, shallow roots, and the whole plant is the product: it is never deficit irrigated.",
  },
];

export function getCrop(cropId: string): Crop {
  const crop = CROPS.find((c) => c.id === cropId);
  if (!crop) throw new Error(`Unknown crop: ${cropId}`);
  return crop;
}

export function totalSeasonDays(crop: Crop): number {
  const s = crop.stages;
  return s.initialDays + s.developmentDays + s.midDays + s.lateDays;
}

export type GrowthStage = "dormant" | "initial" | "development" | "mid" | "late";

export interface StagePosition {
  stage: GrowthStage;
  /** Days since the season began; negative before it starts. */
  dayInSeason: number;
  /** Progress through the current stage, 0-1. */
  fractionThroughStage: number;
  /** Sensitivity to water stress at this point, 0-1. */
  sensitivity: number;
}

/**
 * Where in its season a crop is on a given day.
 *
 * `seasonStartDoy` is the planting date for annuals and leaf-out for perennials.
 * Days outside the season are dormant: a deciduous orchard in December uses
 * effectively no water and should not be on an irrigation schedule.
 */
export function stagePosition(crop: Crop, dayInSeason: number): StagePosition {
  const { initialDays, developmentDays, midDays, lateDays } = crop.stages;
  const total = initialDays + developmentDays + midDays + lateDays;

  if (dayInSeason < 0 || dayInSeason > total) {
    return { stage: "dormant", dayInSeason, fractionThroughStage: 0, sensitivity: 0 };
  }
  if (dayInSeason <= initialDays) {
    return {
      stage: "initial",
      dayInSeason,
      fractionThroughStage: initialDays > 0 ? dayInSeason / initialDays : 1,
      sensitivity: crop.stageSensitivity.initial,
    };
  }
  if (dayInSeason <= initialDays + developmentDays) {
    return {
      stage: "development",
      dayInSeason,
      fractionThroughStage: (dayInSeason - initialDays) / developmentDays,
      sensitivity: crop.stageSensitivity.development,
    };
  }
  if (dayInSeason <= initialDays + developmentDays + midDays) {
    return {
      stage: "mid",
      dayInSeason,
      fractionThroughStage: (dayInSeason - initialDays - developmentDays) / midDays,
      sensitivity: crop.stageSensitivity.mid,
    };
  }
  return {
    stage: "late",
    dayInSeason,
    fractionThroughStage:
      (dayInSeason - initialDays - developmentDays - midDays) / Math.max(1, lateDays),
    sensitivity: crop.stageSensitivity.late,
  };
}

/**
 * Reference conditions the Kc values in this file are quoted for.
 *
 * FAO-56 eq. 62 is written against the sub-humid conditions its tables assume
 * (u2 = 2 m/s, RHmin = 45%). The coefficients here are *already* the values
 * California extension publishes for San Joaquin Valley conditions, so correcting
 * them from FAO's reference would apply the valley's aridity twice and inflate
 * water use by roughly 10%. The adjustment is therefore taken relative to a
 * typical valley mid-season instead, leaving a Fresno block unchanged and giving
 * a hotter, windier Bakersfield block the modest increase it genuinely warrants.
 */
export const SJV_REFERENCE_U2_MS = 2.4;
export const SJV_REFERENCE_RHMIN_PCT = 25;

/**
 * FAO-56 eq. 62: adjust a crop coefficient for local wind and humidity.
 *
 * A tall canopy couples to the atmosphere far more strongly than a short one --
 * a 5 m almond tree feels dry wind in a way a 0.3 m lettuce bed does not -- so
 * the correction is scaled by (h/3)^0.3.
 */
export function adjustKcForClimate(
  kcTabulated: number,
  heightM: number,
  u2Ms: number,
  rhMinPct: number
): number {
  // The adjustment is only defined -- and only meaningful -- for Kc >= 0.45.
  if (kcTabulated < 0.45) return kcTabulated;
  const u2 = Math.min(6, Math.max(1, u2Ms));
  const rhMin = Math.min(80, Math.max(20, rhMinPct));
  const h = Math.min(10, Math.max(0.1, heightM));
  const adjustment =
    (0.04 * (u2 - SJV_REFERENCE_U2_MS) - 0.004 * (rhMin - SJV_REFERENCE_RHMIN_PCT)) *
    (h / 3) ** 0.3;
  return kcTabulated + adjustment;
}

export interface KcOptions {
  /** Mean 2 m wind speed over the mid-season, m/s. */
  u2Ms?: number;
  /** Mean daily minimum relative humidity over the mid-season, percent. */
  rhMinPct?: number;
  /**
   * Fraction of the ground shaded by the canopy at midday, 0-1. Young orchards
   * and vines intercept less light and use proportionally less water.
   */
  canopyCoverFraction?: number;
}

/**
 * The crop coefficient on a given day of the season.
 *
 * Kc is flat through the initial stage, ramps linearly across development,
 * is flat again through mid-season, then ramps to Kc_end during late season --
 * the classic FAO-56 trapezoid.
 */
export function cropCoefficient(
  crop: Crop,
  dayInSeason: number,
  options: KcOptions = {}
): { kc: number; stage: GrowthStage; position: StagePosition } {
  const { u2Ms = SJV_REFERENCE_U2_MS, rhMinPct = SJV_REFERENCE_RHMIN_PCT, canopyCoverFraction } = options;
  const position = stagePosition(crop, dayInSeason);

  const kcMid = adjustKcForClimate(crop.kcMid, crop.heightM, u2Ms, rhMinPct);
  const kcEnd = adjustKcForClimate(crop.kcEnd, crop.heightM, u2Ms, rhMinPct);
  const kcIni = crop.kcInitial;

  let kc: number;
  switch (position.stage) {
    case "dormant":
      // Deciduous orchards and vines still lose a little water from the soil
      // surface and any winter cover; evergreens never truly stop.
      kc = crop.category === "orchard" && crop.kcInitial >= 0.6 ? crop.kcInitial : 0.15;
      break;
    case "initial":
      kc = kcIni;
      break;
    case "development":
      kc = kcIni + (kcMid - kcIni) * position.fractionThroughStage;
      break;
    case "mid":
      kc = kcMid;
      break;
    case "late":
      kc = kcMid + (kcEnd - kcMid) * position.fractionThroughStage;
      break;
  }

  // A young or partially filled orchard cannot use as much water as a mature one.
  // FAO-56 eq. 97 scales Kc down with the fraction of ground the canopy covers,
  // with a floor because the wetted soil surface still evaporates.
  if (canopyCoverFraction != null && canopyCoverFraction < 1 && position.stage !== "dormant") {
    const cover = Math.min(1, Math.max(0.05, canopyCoverFraction));
    const density = Math.min(1, cover / 0.7);
    kc = kc * (0.3 + 0.7 * density);
  }

  return { kc: Math.max(0, kc), stage: position.stage, position };
}

/**
 * Rooting depth on a given day, m.
 *
 * Annual crops start with almost nothing and reach full depth by the end of the
 * development stage; that expanding root zone is why a young crop must be
 * irrigated little and often while a mature one can go days between sets.
 */
export function rootingDepth(crop: Crop, dayInSeason: number): number {
  const { initialDays, developmentDays } = crop.stages;
  const fullDepthDay = initialDays + developmentDays;
  if (dayInSeason <= 0) return crop.initialRootDepthM;
  if (dayInSeason >= fullDepthDay) return crop.rootDepthM;
  const t = dayInSeason / Math.max(1, fullDepthDay);
  return crop.initialRootDepthM + (crop.rootDepthM - crop.initialRootDepthM) * t;
}
