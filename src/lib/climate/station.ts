/**
 * Station climatology: turns the bundled Weather Underground monthly record into
 * the calibrated daily weather series the irrigation engine consumes.
 *
 * Three things happen here:
 *
 *  1. Monthly normals are interpolated to a smooth daily curve. Irrigation
 *     decisions are daily, but a step function at month boundaries would produce
 *     an absurd jump in run times on the 1st of every month.
 *
 *  2. Reference ETo is computed from the physics (FAO-56 Penman-Monteith) and
 *     then bias-corrected against the local CIMIS reference network. Airport
 *     stations over dry pavement run hot and windy relative to the well-watered
 *     grass that ETo is defined over, so uncorrected Penman-Monteith on ASOS data
 *     overestimates seasonal ETo by roughly 15% in the San Joaquin Valley.
 *
 *  3. Where a real year-by-year record has been pulled down by
 *     `npm run data:refresh`, it is used for the interannual statistics instead
 *     of the bundled dispersion estimates.
 */

import rawDataset from "../../../data/stations/san-joaquin-valley.json";
import { referenceEto, type EtoBreakdown } from "./eto";
import { cToF, fToC, mmToIn, mphToMs, inToMm } from "../units";

export interface MonthlyNormal {
  month: number;
  tmaxF: number;
  tminF: number;
  tmeanF: number;
  dewpointF: number;
  humidityPct: number;
  windMph: number;
  pressureInHg: number;
  precipIn: number;
  precipDays: number;
}

export interface StationVariability {
  note: string;
  tmaxSdF: number[];
  tminSdF: number[];
  precipCv: number[];
}

export interface ObservedYear {
  year: number;
  months: (MonthlyNormal & { month: number })[];
}

export interface Station {
  id: string;
  name: string;
  region: string;
  wundergroundPath: string;
  latitude: number;
  longitude: number;
  elevationM: number;
  timezone: string;
  isDefault: boolean;
  monthly: MonthlyNormal[];
  variability: StationVariability;
  referenceEtoNormals: {
    source: string;
    zone: number;
    zoneName: string;
    note: string;
    monthlyIn: number[];
    annualIn: number;
  };
  observedYears: ObservedYear[];
}

export interface Dataset {
  schemaVersion: number;
  provenance: Record<string, unknown>;
  stations: Station[];
}

const dataset = rawDataset as unknown as Dataset;

export const stations: Station[] = dataset.stations;
export const provenance = dataset.provenance;

export function getStation(stationId?: string | null): Station {
  if (stationId) {
    const found = stations.find((s) => s.id === stationId.toUpperCase());
    if (found) return found;
  }
  return stations.find((s) => s.isDefault) ?? stations[0];
}

/** Day of year, 1-366, for a UTC-normalised calendar date. */
export function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const here = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((here - start) / 86_400_000) + 1;
}

export function daysInYear(year: number): number {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

/** Day-of-year of the midpoint of each month, used as the interpolation knots. */
const MONTH_MIDPOINTS = [15, 45, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];

/**
 * Periodic Catmull-Rom interpolation of twelve monthly values onto a day of year.
 *
 * The series wraps: December's curve flows into January's rather than resetting,
 * so there is no discontinuity at the turn of the year.
 */
export function interpolateMonthly(monthlyValues: number[], doy: number): number {
  const n = 12;
  const yearLength = 365;
  // Locate the interval between month midpoints that contains `doy`.
  let i = MONTH_MIDPOINTS.findIndex((mid, idx) => {
    const next = idx === n - 1 ? MONTH_MIDPOINTS[0] + yearLength : MONTH_MIDPOINTS[idx + 1];
    const d = doy < mid && idx === 0 ? doy + yearLength : doy;
    return d >= mid && d < next;
  });

  let t: number;
  if (i === -1) {
    // Before the January midpoint: we are inside the December -> January span.
    i = n - 1;
    const start = MONTH_MIDPOINTS[n - 1];
    const end = MONTH_MIDPOINTS[0] + yearLength;
    t = (doy + yearLength - start) / (end - start);
  } else {
    const start = MONTH_MIDPOINTS[i];
    const end = i === n - 1 ? MONTH_MIDPOINTS[0] + yearLength : MONTH_MIDPOINTS[i + 1];
    t = (doy - start) / (end - start);
  }

  const at = (k: number) => monthlyValues[((k % n) + n) % n];
  const p0 = at(i - 1);
  const p1 = at(i);
  const p2 = at(i + 1);
  const p3 = at(i + 2);

  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

export interface DailyClimate {
  /** ISO date (YYYY-MM-DD) this record describes. */
  date: string;
  dayOfYear: number;
  month: number;
  tmaxF: number;
  tminF: number;
  tmeanF: number;
  dewpointF: number;
  humidityPct: number;
  windMph: number;
  /** Long-run average precipitation for this calendar day, inches. */
  precipIn: number;
  /** Probability that measurable rain (>= 0.01 in) falls on this calendar day. */
  precipProbability: number;
  /** Bias-corrected reference evapotranspiration, inches/day. */
  etoIn: number;
  /** The same value in mm/day. */
  etoMm: number;
  /** Uncorrected Penman-Monteith output, for transparency. */
  rawEtoMm: number;
  /** The multiplier applied to reach the CIMIS-consistent value. */
  biasFactor: number;
  breakdown: EtoBreakdown;
}

const monthLengths = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Monthly multipliers that reconcile raw Penman-Monteith on this station's
 * observations with the published CIMIS reference ETo for its zone.
 *
 * Computed once per station and memoised: for each month the raw ETo is evaluated
 * at the month midpoint, scaled to a monthly total, and compared to the CIMIS normal.
 */
const biasCache = new Map<string, number[]>();

function monthlyBiasFactors(station: Station): number[] {
  const cached = biasCache.get(station.id);
  if (cached) return cached;

  const factors = station.monthly.map((m, idx) => {
    const raw = referenceEto({
      tmaxC: fToC(m.tmaxF),
      tminC: fToC(m.tminF),
      dewpointC: fToC(m.dewpointF),
      windSpeedMs: mphToMs(m.windMph),
      windMeasurementHeightM: 10,
      elevationM: station.elevationM,
      latitudeDeg: station.latitude,
      dayOfYear: MONTH_MIDPOINTS[idx],
    });
    const rawMonthlyIn = mmToIn(raw.etoMm) * monthLengths[idx];
    const targetIn = station.referenceEtoNormals.monthlyIn[idx];
    if (rawMonthlyIn <= 0) return 1;
    // Guard against a pathological ratio if a station's normals are ever mis-entered.
    return Math.min(1.6, Math.max(0.4, targetIn / rawMonthlyIn));
  });

  biasCache.set(station.id, factors);
  return factors;
}

/** Expose the correction factors so the UI and tests can inspect them. */
export function getBiasFactors(station: Station): number[] {
  return monthlyBiasFactors(station);
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * The long-run expected weather for one calendar day at a station.
 *
 * This is the backbone of both the historical dashboard and the forecast: the
 * forecast is this curve plus a modelled anomaly, so a plan can be produced for
 * any date, with or without a live feed.
 */
export function dailyClimateNormal(station: Station, date: Date): DailyClimate {
  const doy = dayOfYear(date);
  const month = date.getUTCMonth() + 1;

  const tmaxF = interpolateMonthly(station.monthly.map((m) => m.tmaxF), doy);
  const tminF = interpolateMonthly(station.monthly.map((m) => m.tminF), doy);
  const dewpointF = interpolateMonthly(station.monthly.map((m) => m.dewpointF), doy);
  const humidityPct = interpolateMonthly(station.monthly.map((m) => m.humidityPct), doy);
  const windMph = interpolateMonthly(station.monthly.map((m) => m.windMph), doy);

  // Monthly precipitation totals become a per-day expectation.
  const precipIn = interpolateMonthly(
    station.monthly.map((m, i) => m.precipIn / monthLengths[i]),
    doy
  );
  const precipProbability = Math.min(
    1,
    Math.max(
      0,
      interpolateMonthly(
        station.monthly.map((m, i) => m.precipDays / monthLengths[i]),
        doy
      )
    )
  );

  const breakdown = referenceEto({
    tmaxC: fToC(tmaxF),
    tminC: fToC(tminF),
    dewpointC: fToC(dewpointF),
    windSpeedMs: mphToMs(windMph),
    windMeasurementHeightM: 10,
    elevationM: station.elevationM,
    latitudeDeg: station.latitude,
    dayOfYear: doy,
  });

  const biasFactor = interpolateMonthly(monthlyBiasFactors(station), doy);
  const etoMm = Math.max(0, breakdown.etoMm * biasFactor);

  return {
    date: toIsoDate(date),
    dayOfYear: doy,
    month,
    tmaxF,
    tminF,
    tmeanF: (tmaxF + tminF) / 2,
    dewpointF,
    humidityPct,
    windMph,
    precipIn: Math.max(0, precipIn),
    precipProbability,
    etoIn: mmToIn(etoMm),
    etoMm,
    rawEtoMm: breakdown.etoMm,
    biasFactor,
    breakdown,
  };
}

/**
 * Recompute ETo for a day whose weather is known (an observation or a live
 * forecast) rather than taken from the normals. The same bias correction is
 * applied so observed and normal days remain on one consistent scale.
 */
export function etoForObservedDay(
  station: Station,
  date: Date,
  obs: { tmaxF: number; tminF: number; dewpointF?: number; humidityPct?: number; windMph?: number }
): { etoIn: number; etoMm: number; breakdown: EtoBreakdown; biasFactor: number } {
  const doy = dayOfYear(date);
  const normal = station.monthly[date.getUTCMonth()];
  const breakdown = referenceEto({
    tmaxC: fToC(obs.tmaxF),
    tminC: fToC(obs.tminF),
    dewpointC: obs.dewpointF != null ? fToC(obs.dewpointF) : undefined,
    relativeHumidityPct: obs.dewpointF == null ? obs.humidityPct ?? normal.humidityPct : undefined,
    windSpeedMs: mphToMs(obs.windMph ?? normal.windMph),
    windMeasurementHeightM: 10,
    elevationM: station.elevationM,
    latitudeDeg: station.latitude,
    dayOfYear: doy,
  });
  const biasFactor = interpolateMonthly(monthlyBiasFactors(station), doy);
  const etoMm = Math.max(0, breakdown.etoMm * biasFactor);
  return { etoIn: mmToIn(etoMm), etoMm, breakdown, biasFactor };
}

/** Seasonal (or any-window) totals of ETo and rainfall from the normals, in inches. */
export function climateTotals(
  station: Station,
  startDate: Date,
  endDate: Date
): { etoIn: number; rainIn: number; days: number } {
  let etoIn = 0;
  let rainIn = 0;
  let days = 0;
  for (let d = new Date(startDate.getTime()); d <= endDate; d = addDays(d, 1)) {
    const c = dailyClimateNormal(station, d);
    etoIn += c.etoIn;
    rainIn += c.precipIn;
    days += 1;
    if (days > 2000) break; // defensive: never spin on a malformed range
  }
  return { etoIn, rainIn, days };
}

/** Convenience re-exports so callers need only one climate import. */
export { cToF, fToC, mmToIn, inToMm, mphToMs };
