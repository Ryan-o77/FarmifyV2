/**
 * Weather prediction for the planning horizon.
 *
 * An irrigation plan has to commit to numbers for days that have not happened
 * yet, so the honest thing to do is predict a *distribution* rather than a single
 * value, and say how confident we are.
 *
 * The predictor is a stochastic weather generator conditioned on the station's
 * own history:
 *
 *   - Temperature anomalies follow a first-order autoregressive process. Warm
 *     spells persist -- tomorrow's departure from normal is mostly today's,
 *     decayed toward zero -- which is what makes a valley heat wave forecastable
 *     several days out.
 *   - Rain occurrence is a two-state Markov chain. Storms arrive in sequences,
 *     so the chance of rain tomorrow depends on whether it rained today.
 *   - Rain amounts are drawn from a gamma distribution, which reproduces the
 *     strong right skew of Mediterranean-climate rainfall: many small events and
 *     a few very large ones.
 *
 * Many members are simulated and summarised into percentiles. The scheduler plans
 * against the median; the risk numbers on the dashboard come from the spread.
 *
 * When a live forecast provider is configured and reachable, its deterministic
 * forecast replaces the generated values for the days it covers, and the
 * generator fills in the rest of the horizon.
 */

import {
  type Station,
  type DailyClimate,
  dailyClimateNormal,
  etoForObservedDay,
  addDays,
  toIsoDate,
  dayOfYear,
  interpolateMonthly,
} from "./station";
import type { WeatherDay } from "../agronomy/waterbalance";
import { clamp } from "../units";

/** Deterministic PRNG (mulberry32) so a given farm and date always yield the same plan. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Box-Muller standard normal. */
function normal(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Gamma variate by Marsaglia-Tsang. Rainfall amounts are gamma distributed:
 * bounded below at zero and heavily right-skewed.
 */
function gamma(rng: () => number, shape: number, scale: number): number {
  if (shape < 1) {
    const u = rng();
    return gamma(rng, shape + 1, scale) * u ** (1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (let i = 0; i < 200; i++) {
    const x = normal(rng);
    const v = (1 + c * x) ** 3;
    if (v <= 0) continue;
    const u = rng();
    if (u < 1 - 0.0331 * x ** 4) return d * v * scale;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * scale;
  }
  return shape * scale;
}

/** Lag-1 autocorrelation of daily temperature anomalies -- a persistent, continental value. */
const TEMP_AR1 = 0.72;
/** Probability rain continues given rain yesterday, relative to the base rate. */
const WET_PERSISTENCE = 3.2;

export interface EnsembleDay {
  date: string;
  dayOfYear: number;
  /** Median (P50) values -- what the schedule is built on. */
  tmaxF: number;
  tminF: number;
  dewpointF: number;
  windMph: number;
  humidityPct: number;
  etoIn: number;
  rainIn: number;
  rainProbability: number;
  /** Spread across the ensemble. */
  etoP10In: number;
  etoP90In: number;
  tmaxP10F: number;
  tmaxP90F: number;
  /** Share of members exceeding 100 F -- the valley's operational heat threshold. */
  heatRisk: number;
  /** Share of members with at least 0.10 in of rain. */
  wetRisk: number;
  /** Long-run normal for the same calendar day, for the "vs normal" readout. */
  normal: DailyClimate;
  /** True when this day came from a live forecast rather than the generator. */
  fromLiveForecast: boolean;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = clamp(p, 0, 1) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export interface LiveObservation {
  date: string;
  tmaxF: number;
  tminF: number;
  dewpointF?: number;
  humidityPct?: number;
  windMph?: number;
  rainIn?: number;
  rainProbability?: number;
}

export interface ForecastOptions {
  /** Number of ensemble members. More members means smoother percentiles. */
  members?: number;
  /** Seed component so different farms do not all get an identical weather draw. */
  seed?: string;
  /** Days already covered by a real forecast or observations. */
  live?: LiveObservation[];
}

/**
 * Generate the ensemble forecast for `days` days starting at `startDate`.
 */
export function forecastEnsemble(
  station: Station,
  startDate: Date,
  days: number,
  options: ForecastOptions = {}
): EnsembleDay[] {
  const { members = 120, seed = "", live = [] } = options;
  const liveByDate = new Map(live.map((o) => [o.date, o]));

  const normals: DailyClimate[] = [];
  for (let i = 0; i < days; i++) {
    normals.push(dailyClimateNormal(station, addDays(startDate, i)));
  }

  const tmaxSd = station.variability.tmaxSdF;
  const tminSd = station.variability.tminSdF;

  // Accumulators: one array of member values per day, per variable.
  const tmaxSamples: number[][] = Array.from({ length: days }, () => []);
  const tminSamples: number[][] = Array.from({ length: days }, () => []);
  const etoSamples: number[][] = Array.from({ length: days }, () => []);
  const rainSamples: number[][] = Array.from({ length: days }, () => []);
  const wetFlags: number[] = Array.from({ length: days }, () => 0);
  const heatFlags: number[] = Array.from({ length: days }, () => 0);

  const baseSeed = hashString(`${station.id}|${toIsoDate(startDate)}|${seed}`);

  for (let m = 0; m < members; m++) {
    const rng = makeRng(baseSeed + m * 7919);
    // Daily anomalies are expressed in units of the monthly standard deviation.
    let tmaxAnomaly = normal(rng) * 0.6;
    let tminAnomaly = normal(rng) * 0.6;
    let wetYesterday: boolean = false;

    for (let i = 0; i < days; i++) {
      const nrm = normals[i];
      const monthIdx = nrm.month - 1;

      // AR(1): today's anomaly is a decayed version of yesterday's plus fresh noise.
      const innovation = Math.sqrt(1 - TEMP_AR1 ** 2);
      tmaxAnomaly = TEMP_AR1 * tmaxAnomaly + innovation * normal(rng);
      tminAnomaly = TEMP_AR1 * tminAnomaly + innovation * normal(rng);

      // Daily variability runs wider than the monthly-mean variability the
      // dataset stores, because month-to-month averaging cancels most day-to-day swings.
      const dailySdScale = 2.2;
      let tmax = nrm.tmaxF + tmaxAnomaly * tmaxSd[monthIdx] * dailySdScale;
      let tmin = nrm.tminF + tminAnomaly * tminSd[monthIdx] * dailySdScale;

      // Two-state Markov chain for rain occurrence.
      //
      // The wet-after-wet probability is raised above the climatological rate to
      // reproduce storm sequences. The dry-after-wet probability is then pinned
      // by the requirement that the chain's stationary distribution still match
      // the observed frequency of wet days: for a chain with transition
      // probabilities p01 (dry->wet) and p11 (wet->wet), the long-run share of
      // wet days is p01 / (1 + p01 - p11), so p01 = pi * (1 - p11) / (1 - pi).
      // Without that constraint, adding persistence would also silently add
      // rainfall to the climate.
      const base = clamp(nrm.precipProbability, 0, 0.9);
      const p11 = clamp(base * WET_PERSISTENCE, 0, 0.9);
      const p01 = base >= 0.9 ? p11 : clamp((base * (1 - p11)) / (1 - base), 0, 0.9);
      const pWet: number = wetYesterday ? p11 : p01;
      const isWet: boolean = rng() < pWet;
      wetYesterday = isWet;

      let rain = 0;
      if (isWet) {
        // Mean amount on a wet day = monthly total / wet days, already implicit
        // in the normal's per-day rate divided by its probability.
        const meanWetAmount = base > 0 ? nrm.precipIn / base : 0;
        const cv = station.variability.precipCv[monthIdx];
        const shape = clamp(1 / Math.max(0.2, cv * cv), 0.35, 6);
        const scale = meanWetAmount / shape;
        rain = gamma(rng, shape, scale);
        // Rain suppresses the diurnal range: cloud caps the high and holds up the low.
        tmax -= clamp(rain * 6, 0, 12);
        tmin += clamp(rain * 2, 0, 5);
      }

      // Overwrite with a live forecast where one exists.
      const liveDay = liveByDate.get(nrm.date);
      if (liveDay) {
        tmax = liveDay.tmaxF;
        tmin = liveDay.tminF;
        rain = liveDay.rainIn ?? 0;
      }

      if (tmin > tmax - 3) tmin = tmax - 3; // keep a physically sensible diurnal range

      const dew = liveDay?.dewpointF ?? nrm.dewpointF + (isWet ? 4 : 0);
      const wind = liveDay?.windMph ?? Math.max(0.5, nrm.windMph * (0.75 + 0.5 * rng()));

      const { etoIn } = etoForObservedDay(station, new Date(`${nrm.date}T00:00:00Z`), {
        tmaxF: tmax,
        tminF: tmin,
        dewpointF: Math.min(dew, tmin),
        windMph: wind,
      });

      tmaxSamples[i].push(tmax);
      tminSamples[i].push(tmin);
      etoSamples[i].push(etoIn);
      rainSamples[i].push(rain);
      if (rain >= 0.1) wetFlags[i] += 1;
      if (tmax >= 100) heatFlags[i] += 1;
    }
  }

  return normals.map((nrm, i) => {
    const tmaxSorted = [...tmaxSamples[i]].sort((a, b) => a - b);
    const tminSorted = [...tminSamples[i]].sort((a, b) => a - b);
    const etoSorted = [...etoSamples[i]].sort((a, b) => a - b);
    const liveDay = liveByDate.get(nrm.date);

    const rainMean = rainSamples[i].reduce((s, v) => s + v, 0) / Math.max(1, members);

    return {
      date: nrm.date,
      dayOfYear: nrm.dayOfYear,
      tmaxF: percentile(tmaxSorted, 0.5),
      tminF: percentile(tminSorted, 0.5),
      dewpointF: nrm.dewpointF,
      windMph: nrm.windMph,
      humidityPct: nrm.humidityPct,
      etoIn: percentile(etoSorted, 0.5),
      // The expected amount, not the median: the median of a rainfall
      // distribution is almost always zero, which would understate the water a
      // plan can count on over a run of days.
      rainIn: liveDay?.rainIn ?? rainMean,
      rainProbability: liveDay?.rainProbability ?? wetFlags[i] / Math.max(1, members),
      etoP10In: percentile(etoSorted, 0.1),
      etoP90In: percentile(etoSorted, 0.9),
      tmaxP10F: percentile(tmaxSorted, 0.1),
      tmaxP90F: percentile(tmaxSorted, 0.9),
      heatRisk: heatFlags[i] / Math.max(1, members),
      wetRisk: wetFlags[i] / Math.max(1, members),
      normal: nrm,
      fromLiveForecast: Boolean(liveDay),
    };
  });
}

/** Reduce the ensemble to the plain daily series the water balance consumes. */
export function toWeatherDays(ensemble: EnsembleDay[]): WeatherDay[] {
  return ensemble.map((d) => ({
    date: d.date,
    dayOfYear: d.dayOfYear,
    etoIn: d.etoIn,
    rainIn: d.rainIn,
    rainProbability: d.rainProbability,
    tmaxF: d.tmaxF,
    tminF: d.tminF,
    windMph: d.windMph,
    humidityPct: d.humidityPct,
  }));
}

/** The same series built from the climate normals alone, with no stochastic spread. */
export function normalWeatherDays(
  station: Station,
  startDate: Date,
  days: number
): WeatherDay[] {
  const out: WeatherDay[] = [];
  for (let i = 0; i < days; i++) {
    const c = dailyClimateNormal(station, addDays(startDate, i));
    out.push({
      date: c.date,
      dayOfYear: c.dayOfYear,
      etoIn: c.etoIn,
      rainIn: c.precipIn,
      rainProbability: c.precipProbability,
      tmaxF: c.tmaxF,
      tminF: c.tminF,
      windMph: c.windMph,
      humidityPct: c.humidityPct,
    });
  }
  return out;
}

/**
 * Mean 2 m wind speed and minimum relative humidity over a window, used for the
 * FAO-56 eq. 62 crop coefficient adjustment.
 */
export function climateAdjustmentInputs(
  station: Station,
  startDate: Date,
  days: number
): { u2Ms: number; rhMinPct: number } {
  let windSum = 0;
  let rhMinSum = 0;
  for (let i = 0; i < days; i++) {
    const c = dailyClimateNormal(station, addDays(startDate, i));
    windSum += c.breakdown.u2Ms;
    // RHmin is approximated from the dewpoint against the daily maximum
    // temperature: the driest moment of the day is the hottest one.
    const esTmax = 0.6108 * Math.exp((17.27 * ((c.tmaxF - 32) * 5) / 9) / (((c.tmaxF - 32) * 5) / 9 + 237.3));
    const ea = 0.6108 * Math.exp((17.27 * ((c.dewpointF - 32) * 5) / 9) / (((c.dewpointF - 32) * 5) / 9 + 237.3));
    rhMinSum += clamp((ea / esTmax) * 100, 5, 100);
  }
  const n = Math.max(1, days);
  return { u2Ms: windSum / n, rhMinPct: rhMinSum / n };
}

export { dayOfYear, interpolateMonthly };
