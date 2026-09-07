/**
 * Domain model shared by the engine, the API routes and the UI.
 */

import type { GrowthStage } from "./agronomy/crops";

export type Language = "en" | "es" | "pa" | "hmn";

export const LANGUAGES: { code: Language; label: string; endonym: string }[] = [
  { code: "en", label: "English", endonym: "English" },
  { code: "es", label: "Spanish", endonym: "Espanol" },
  { code: "pa", label: "Punjabi", endonym: "ਪੰਜਾਬੀ" },
  { code: "hmn", label: "Hmong", endonym: "Hmoob" },
];

export type WaterLimitUnit = "acre-feet" | "acre-inches" | "gallons";
export type WaterLimitPeriod = "season" | "year" | "month";

export interface WaterLimit {
  amount: number;
  unit: WaterLimitUnit;
  period: WaterLimitPeriod;
  /** Free-text note, e.g. "SGMA allocation" or "district delivery cap". */
  note?: string;
}

/** Days of the week the grower is able to irrigate, 0 = Sunday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface IrrigationConstraints {
  /** Days irrigation is possible at all (labour, district delivery schedule, power windows). */
  allowedWeekdays: Weekday[];
  /** Earliest hour a set may start, 0-23, local time. */
  earliestStartHour: number;
  /** Latest hour a set may still be running, 0-23. */
  latestEndHour: number;
  /** Maximum hours the system can run in one day across this field. */
  maxHoursPerDay: number;
  /** Total system capacity in gallons per minute, if the pump limits what can run at once. */
  systemCapacityGpm?: number | null;
}

export interface Field {
  id: string;
  name: string;
  acres: number;
  cropId: string;
  soilId: string;
  systemId: string;
  /** ISO date. Planting date for annuals; leaf-out for perennials (defaults from the crop). */
  seasonStartDate?: string | null;
  /** Age of a perennial planting, years. Drives the canopy cover adjustment. */
  plantingAgeYears?: number | null;
  /** Depth to hardpan or another root-restricting layer, feet. */
  restrictiveLayerDepthFt?: number | null;
  /** Measured application rate, in/hr. Falls back to the system default when absent. */
  applicationRateInPerHr?: number | null;
  /** Measured distribution uniformity, 0-1. */
  distributionUniformity?: number | null;
  /** Emitter layout, when the grower knows it but not their application rate. */
  emitter?: {
    emitterGph: number;
    emitterSpacingFt: number;
    lateralSpacingFt: number;
    emittersPerTree?: number;
    treeSpacingFt?: number;
    rowSpacingFt?: number;
  } | null;
  waterLimit?: WaterLimit | null;
  constraints: IrrigationConstraints;
  /** Learned corrections from grower feedback. */
  calibration: Calibration;
  notes?: string;
}

/**
 * Corrections learned from what the grower reports back.
 *
 * The model is never going to be exactly right about a particular block: soil
 * varies within a field, an emitter catalogue rating is not what the emitters
 * actually put out after ten years, and canopies differ. Rather than ask a grower
 * to calibrate anything numerically, we move these two multipliers when they tell
 * us the ground was too wet or the trees looked stressed.
 */
export interface Calibration {
  /** Multiplier on crop water demand. Above 1 means this block runs thirstier than the book. */
  demandFactor: number;
  /** Multiplier on the application rate. Below 1 means the system delivers less than rated. */
  applicationFactor: number;
  /** Number of feedback reports folded in so far. */
  observations: number;
  /** ISO timestamp of the last adjustment. */
  updatedAt?: string;
}

export const DEFAULT_CALIBRATION: Calibration = {
  demandFactor: 1,
  applicationFactor: 1,
  observations: 0,
};

export interface Farm {
  id: string;
  name: string;
  farmerName: string;
  language: Language;
  stationId: string;
  fields: Field[];
  createdAt: string;
  updatedAt: string;
}

export type FeedbackKind =
  | "too-wet"
  | "too-dry"
  | "just-right"
  | "runoff"
  | "cannot-run-schedule"
  | "system-problem";

export interface Feedback {
  id: string;
  farmId: string;
  fieldId: string;
  kind: FeedbackKind;
  /** ISO date the observation refers to. */
  date: string;
  comment?: string;
  createdAt: string;
  /** What the engine did with it, recorded so a grower can see their input mattered. */
  applied?: {
    demandFactorBefore: number;
    demandFactorAfter: number;
    applicationFactorBefore: number;
    applicationFactorAfter: number;
  };
}

/** One day of the soil water balance. */
export interface DayBalance {
  date: string;
  dayOfYear: number;
  dayInSeason: number;
  stage: GrowthStage;
  kc: number;
  /** Reference ET, inches. */
  etoIn: number;
  /** Crop ET, inches: what the crop would use with no water shortage. */
  etcIn: number;
  /** Crop ET actually achieved after any stress, inches. */
  etActualIn: number;
  /** Rainfall, inches. */
  rainIn: number;
  /** The share of rainfall that reached the root zone, inches. */
  effectiveRainIn: number;
  /** Net irrigation stored in the root zone, inches. */
  irrigationIn: number;
  /** Gross water pumped, inches over the field. */
  grossIrrigationIn: number;
  /** Root zone depletion at the end of the day, inches below field capacity. */
  depletionIn: number;
  /** Total available water in the current root zone, inches. */
  tawIn: number;
  /** Readily available water: depletion allowed before stress, inches. */
  rawIn: number;
  /** Soil water content as a share of capacity, 0-1. Drives the UI gauge. */
  soilWaterFraction: number;
  /** Water stress coefficient, 0-1. Below 1 means the crop was short. */
  stressCoefficient: number;
  /** True when an irrigation was scheduled on this day. */
  irrigated: boolean;
  /** True when the balance overflowed the root zone and water was lost below it. */
  deepPercolationIn: number;
}

export interface IrrigationEvent {
  date: string;
  /** Day of week, 0 = Sunday. */
  weekday: Weekday;
  /** Local clock time the set should start, "HH:MM". */
  startTime: string;
  /** Local clock time the set ends, "HH:MM". */
  endTime: string;
  /** Total run time, hours. */
  durationHours: number;
  /** Net depth stored in the root zone, inches. */
  netDepthIn: number;
  /** Gross depth pumped over the field, inches. */
  grossDepthIn: number;
  /** Total volume pumped, gallons. */
  gallons: number;
  /** Gallons per acre, useful for comparing blocks of different size. */
  gallonsPerAcre: number;
  /** Split into cycles when the soil cannot take water as fast as the system applies it. */
  cycles: { startTime: string; endTime: string; durationHours: number }[];
  soakMinutesBetweenCycles: number;
  /** Depletion at the moment of irrigation, as a share of readily available water. */
  depletionAtStartPct: number;
  reason: string;
}

export interface WeekPlan {
  weekStart: string;
  weekEnd: string;
  events: IrrigationEvent[];
  totalGallons: number;
  totalGrossInches: number;
  totalNetInches: number;
  etcInches: number;
  rainInches: number;
  /** Days in the week on which no irrigation is scheduled. */
  restDays: string[];
  peakEtoDay: { date: string; etoIn: number };
  /** Highest forecast temperature in the week, degrees F. */
  peakTempF: number;
  /** Probability that at least 0.10 in of rain falls during the week. */
  rainChance: number;
}

export interface DeficitPlan {
  /** True when the seasonal requirement had to be cut to fit the water limit. */
  applied: boolean;
  /** Water available for the season, inches over the field. */
  availableIn: number;
  /** Water the crop would use with no restriction, inches. */
  requiredIn: number;
  /** Share of full requirement the plan delivers, 0-1. */
  deliveryRatio: number;
  /** Estimated relative yield under this allocation, 0-1 (FAO-33). */
  estimatedRelativeYield: number;
  /** Human-readable account of which stages were cut and which were protected. */
  strategy: string[];
}

export interface FieldPlan {
  field: Field;
  cropName: string;
  soilName: string;
  systemName: string;
  stationId: string;
  stationName: string;
  /** Daily water balance across the planning horizon. */
  balance: DayBalance[];
  /** Every irrigation the plan calls for. */
  events: IrrigationEvent[];
  /** The events grouped into weeks. */
  weeks: WeekPlan[];
  /** Season totals. */
  season: {
    startDate: string;
    endDate: string;
    etoIn: number;
    etcIn: number;
    rainIn: number;
    effectiveRainIn: number;
    netIrrigationIn: number;
    grossIrrigationIn: number;
    totalGallons: number;
    acreFeet: number;
    acreFeetPerAcre: number;
    irrigationCount: number;
    averageIntervalDays: number;
  };
  deficit: DeficitPlan;
  /** Application rate actually used, in/hr. */
  applicationRateInPerHr: number;
  /** Warnings the grower should see: runoff risk, capacity shortfalls, limit overruns. */
  warnings: string[];
}
