#!/usr/bin/env node
/**
 * Refresh the bundled San Joaquin Valley climate record from Weather Underground.
 *
 * The monthly history pages (e.g. https://www.wunderground.com/history/monthly/us/ca/fresno)
 * are rendered client-side from the Weather Company history API. This script walks that API
 * month by month for every station in the bundled dataset, aggregates each month the same way
 * the Wunderground table does, and writes the result back into each station's `observedYears`.
 *
 * Requires an API key supplied through the environment -- nothing is baked into the repo:
 *
 *   WU_API_KEY=<your key> npm run data:refresh
 *   WU_API_KEY=<your key> npm run data:refresh -- --years 30
 *   WU_API_KEY=<your key> npm run data:refresh -- --station KFAT
 *
 * Without a refresh the app still runs: the forecast engine falls back to the monthly normals
 * and interannual dispersion statistics that ship in data/stations/san-joaquin-valley.json.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATASET = path.join(HERE, "..", "data", "stations", "san-joaquin-valley.json");

const API_KEY = process.env.WU_API_KEY;
const API_BASE = process.env.WU_API_BASE || "https://api.weather.com/v1/location";
const RATE_LIMIT_MS = Number(process.env.WU_RATE_LIMIT_MS || 450);

function parseArgs(argv) {
  const args = { years: 20, station: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--years") args.years = Number(argv[++i]);
    else if (argv[i] === "--station") args.station = String(argv[++i]).toUpperCase();
  }
  if (!Number.isFinite(args.years) || args.years < 1) {
    throw new Error("--years must be a positive number");
  }
  return args;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function yyyymmdd(year, month, day) {
  return `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

async function fetchMonth(stationId, year, month, attempt = 1) {
  const start = yyyymmdd(year, month, 1);
  const end = yyyymmdd(year, month, daysInMonth(year, month));
  const url = new URL(`${API_BASE}/${stationId}:9:US/observations/historical.json`);
  url.searchParams.set("apiKey", API_KEY);
  url.searchParams.set("units", "e");
  url.searchParams.set("startDate", start);
  url.searchParams.set("endDate", end);

  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (res.status === 404) return null; // station not reporting that month
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    return Array.isArray(body?.observations) ? body.observations : [];
  } catch (err) {
    if (attempt >= 4) {
      console.warn(`  ! ${stationId} ${year}-${month}: giving up (${err.message})`);
      return null;
    }
    const backoff = 2 ** attempt * 1000;
    console.warn(`  . ${stationId} ${year}-${month}: ${err.message}, retrying in ${backoff}ms`);
    await sleep(backoff);
    return fetchMonth(stationId, year, month, attempt + 1);
  }
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (x, n) => (x == null ? null : Number(x.toFixed(n)));

/**
 * Collapse hourly observations into the daily extremes and means that the Wunderground
 * monthly table displays, then into the monthly aggregate this dataset stores.
 */
function aggregate(observations) {
  const byDay = new Map();
  for (const o of observations) {
    if (o?.valid_time_gmt == null) continue;
    const day = new Date(o.valid_time_gmt * 1000).toISOString().slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(o);
  }

  const dailyMax = [];
  const dailyMin = [];
  const dailyDew = [];
  const dailyRh = [];
  const dailyWind = [];
  const dailyPres = [];
  let precipTotal = 0;
  let precipDays = 0;

  for (const obs of byDay.values()) {
    const temps = obs.map((o) => o.temp).filter((v) => typeof v === "number");
    if (temps.length) {
      dailyMax.push(Math.max(...temps));
      dailyMin.push(Math.min(...temps));
    }
    const dew = obs.map((o) => o.dewPt).filter((v) => typeof v === "number");
    if (dew.length) dailyDew.push(mean(dew));
    const rh = obs.map((o) => o.rh).filter((v) => typeof v === "number");
    if (rh.length) dailyRh.push(mean(rh));
    const wind = obs.map((o) => o.wspd).filter((v) => typeof v === "number");
    if (wind.length) dailyWind.push(mean(wind));
    const pres = obs.map((o) => o.pressure).filter((v) => typeof v === "number");
    if (pres.length) dailyPres.push(mean(pres));

    // precip_hrly is an hourly accumulation; sum it across the day.
    const hourly = obs.map((o) => o.precip_hrly).filter((v) => typeof v === "number");
    const dayTotal = hourly.reduce((a, b) => a + b, 0);
    precipTotal += dayTotal;
    if (dayTotal >= 0.01) precipDays += 1;
  }

  if (!dailyMax.length) return null;

  return {
    tmaxF: round(mean(dailyMax), 1),
    tminF: round(mean(dailyMin), 1),
    tmeanF: round((mean(dailyMax) + mean(dailyMin)) / 2, 1),
    dewpointF: round(mean(dailyDew), 1),
    humidityPct: round(mean(dailyRh), 0),
    windMph: round(mean(dailyWind), 1),
    pressureInHg: round(mean(dailyPres), 2),
    precipIn: round(precipTotal, 2),
    precipDays,
    observedDays: byDay.size,
  };
}

async function main() {
  if (!API_KEY) {
    console.error(
      "WU_API_KEY is not set.\n" +
        "Supply a Weather Company / Weather Underground history API key in the environment:\n" +
        "  WU_API_KEY=<your key> npm run data:refresh\n"
    );
    process.exit(2);
  }

  const args = parseArgs(process.argv.slice(2));
  const dataset = JSON.parse(await readFile(DATASET, "utf8"));
  const now = new Date();
  const endYear = now.getUTCFullYear();
  const startYear = endYear - args.years + 1;

  for (const station of dataset.stations) {
    if (args.station && station.id !== args.station) continue;
    console.log(`\n${station.id} - ${station.name} (${startYear}-${endYear})`);
    const observedYears = [];

    for (let year = startYear; year <= endYear; year++) {
      const months = [];
      for (let month = 1; month <= 12; month++) {
        if (year === endYear && month > now.getUTCMonth() + 1) break;
        const obs = await fetchMonth(station.id, year, month);
        await sleep(RATE_LIMIT_MS);
        if (!obs || !obs.length) continue;
        const agg = aggregate(obs);
        if (!agg) continue;
        // A month missing more than a few days of record is not comparable to the others.
        if (agg.observedDays < daysInMonth(year, month) - 3) continue;
        const { observedDays, ...rest } = agg;
        months.push({ month, ...rest });
      }
      if (months.length) {
        observedYears.push({ year, months });
        console.log(`  ${year}: ${months.length} complete months`);
      }
    }

    station.observedYears = observedYears;
  }

  dataset.provenance.lastRefreshed = new Date().toISOString();
  await writeFile(DATASET, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
  console.log(`\nWrote ${DATASET}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
