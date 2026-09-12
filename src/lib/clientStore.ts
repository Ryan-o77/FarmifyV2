"use client";

/**
 * Persistence, in the visitor's own browser.
 *
 * Farmify is published as a static site, so there is no server to keep anyone's
 * farms on. That is the right arrangement for a public tool rather than a
 * limitation: a shared server-side store on a public URL would mean every
 * visitor editing the same farms, and nobody's field data would be their own.
 * Here each browser holds its own workspace, nothing is transmitted anywhere,
 * and the whole application keeps working with the network unplugged -- which
 * matters more than it sounds like for a tool meant to be used in the valley.
 *
 * The obvious cost is that clearing site data clears the farms, so the store
 * knows how to write itself out to a file and read one back in.
 */

import { randomId } from "./id";
import type { Farm, Feedback, Field, Language } from "./types";
import { DEFAULT_CALIBRATION } from "./types";
import { getSystem } from "./agronomy/systems";

const STORAGE_KEY = "farmify.store.v1";

export interface StoreShape {
  version: number;
  farms: Farm[];
  feedback: Feedback[];
}

/** In-memory fallback for private-mode browsers that refuse to persist. */
let memoryFallback: StoreShape | null = null;
let warnedAboutStorage = false;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const probe = "__farmify_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    // Private browsing, or site data blocked. The app still works for this
    // session; it just will not survive a reload.
    if (!warnedAboutStorage) {
      console.warn("Farmify: browser storage unavailable; data will not persist.");
      warnedAboutStorage = true;
    }
    return null;
  }
}

function emptyStore(): StoreShape {
  return { version: 1, farms: [], feedback: [] };
}

function normalise(raw: unknown): StoreShape {
  const parsed = raw as Partial<StoreShape> | null;
  if (!parsed || typeof parsed !== "object") return emptyStore();
  return {
    version: typeof parsed.version === "number" ? parsed.version : 1,
    farms: Array.isArray(parsed.farms) ? parsed.farms : [],
    feedback: Array.isArray(parsed.feedback) ? parsed.feedback : [],
  };
}

function read(): StoreShape {
  const store = storage();
  if (!store) return memoryFallback ?? (memoryFallback = seededStore());
  try {
    const text = store.getItem(STORAGE_KEY);
    if (!text) {
      const seeded = seededStore();
      write(seeded);
      return seeded;
    }
    return normalise(JSON.parse(text));
  } catch {
    // Corrupt or unreadable: start clean rather than leaving the app broken.
    const seeded = seededStore();
    write(seeded);
    return seeded;
  }
}

function write(next: StoreShape): void {
  const store = storage();
  if (!store) {
    memoryFallback = next;
    return;
  }
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota exceeded. Keep the session usable in memory.
    memoryFallback = next;
  }
}

function mutate<T>(mutator: (store: StoreShape) => T): T {
  const store = read();
  const result = mutator(store);
  write(store);
  return result;
}

// --- Reads -----------------------------------------------------------------

export function loadStore(): StoreShape {
  return read();
}

export function listFarms(): Farm[] {
  return read().farms;
}

export function getFarm(farmId: string): Farm | null {
  return read().farms.find((f) => f.id === farmId) ?? null;
}

export function getField(
  farmId: string,
  fieldId: string
): { farm: Farm; field: Field } | null {
  const farm = getFarm(farmId);
  if (!farm) return null;
  const field = farm.fields.find((f) => f.id === fieldId);
  return field ? { farm, field } : null;
}

export function listFeedback(farmId?: string, fieldId?: string): Feedback[] {
  return read()
    .feedback.filter((f) => (farmId ? f.farmId === farmId : true))
    .filter((f) => (fieldId ? f.fieldId === fieldId : true))
    // Ordered by the day the grower looked at the ground, not the moment they
    // typed it in -- someone logging yesterday's observation this morning should
    // not have it jump ahead of a report from today. Submission time only breaks
    // ties between observations of the same day.
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

// --- Writes ----------------------------------------------------------------

export function createFarm(input: {
  name: string;
  farmerName: string;
  language: Language;
  stationId: string;
}): Farm {
  const now = new Date().toISOString();
  const farm: Farm = {
    id: randomId(),
    name: input.name,
    farmerName: input.farmerName,
    language: input.language,
    stationId: input.stationId,
    fields: [],
    createdAt: now,
    updatedAt: now,
  };
  return mutate((store) => {
    store.farms.push(farm);
    return farm;
  });
}

export function updateFarm(
  farmId: string,
  patch: Partial<Omit<Farm, "id" | "fields" | "createdAt">>
): Farm | null {
  return mutate((store) => {
    const farm = store.farms.find((f) => f.id === farmId);
    if (!farm) return null;
    Object.assign(farm, patch, { updatedAt: new Date().toISOString() });
    return farm;
  });
}

export function deleteFarm(farmId: string): boolean {
  return mutate((store) => {
    const before = store.farms.length;
    store.farms = store.farms.filter((f) => f.id !== farmId);
    store.feedback = store.feedback.filter((f) => f.farmId !== farmId);
    return store.farms.length < before;
  });
}

export function upsertField(
  farmId: string,
  field: Omit<Field, "id"> & { id?: string }
): Field | null {
  return mutate((store) => {
    const farm = store.farms.find((f) => f.id === farmId);
    if (!farm) return null;
    farm.updatedAt = new Date().toISOString();

    if (field.id) {
      const idx = farm.fields.findIndex((f) => f.id === field.id);
      if (idx >= 0) {
        // Calibration is learned, not entered: never let a form post overwrite it.
        const existing = farm.fields[idx];
        farm.fields[idx] = {
          ...(field as Field),
          id: existing.id,
          calibration: existing.calibration ?? { ...DEFAULT_CALIBRATION },
        };
        return farm.fields[idx];
      }
    }
    const created: Field = {
      ...(field as Field),
      id: field.id ?? randomId(),
      calibration: { ...DEFAULT_CALIBRATION },
    };
    farm.fields.push(created);
    return created;
  });
}

export function deleteField(farmId: string, fieldId: string): boolean {
  return mutate((store) => {
    const farm = store.farms.find((f) => f.id === farmId);
    if (!farm) return false;
    const before = farm.fields.length;
    farm.fields = farm.fields.filter((f) => f.id !== fieldId);
    store.feedback = store.feedback.filter((f) => f.fieldId !== fieldId);
    farm.updatedAt = new Date().toISOString();
    return farm.fields.length < before;
  });
}

export function recordFeedback(
  entry: Omit<Feedback, "id" | "createdAt">,
  nextCalibration: Field["calibration"],
  previousCalibration: Field["calibration"]
): Feedback | null {
  return mutate((store) => {
    const farm = store.farms.find((f) => f.id === entry.farmId);
    if (!farm) return null;
    const field = farm.fields.find((f) => f.id === entry.fieldId);
    if (!field) return null;

    field.calibration = nextCalibration;
    farm.updatedAt = new Date().toISOString();

    const record: Feedback = {
      ...entry,
      id: randomId(),
      createdAt: new Date().toISOString(),
      applied: {
        demandFactorBefore: previousCalibration.demandFactor,
        demandFactorAfter: nextCalibration.demandFactor,
        applicationFactorBefore: previousCalibration.applicationFactor,
        applicationFactorAfter: nextCalibration.applicationFactor,
      },
    };
    store.feedback.push(record);
    return record;
  });
}

// --- Backup -----------------------------------------------------------------

/** The whole workspace as pretty-printed JSON, for the grower to keep. */
export function exportJson(): string {
  return `${JSON.stringify(read(), null, 2)}\n`;
}

/**
 * Replace the workspace from a previously exported file.
 * Returns an error message rather than throwing, because this is driven by a
 * file the user chose and a bad file should not blank the screen.
 */
export function importJson(text: string): { ok: true } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file is not valid JSON." };
  }
  const candidate = normalise(parsed);
  if (!Array.isArray((parsed as StoreShape)?.farms)) {
    return { ok: false, error: "That file does not look like a Farmify backup." };
  }
  write(candidate);
  return { ok: true };
}

/** Wipe the workspace and put the worked example back. */
export function resetToSeed(): void {
  write(seededStore());
}

/** Throw away everything, leaving an empty workspace. */
export function clearAll(): void {
  write(emptyStore());
}

// --- Defaults and seed -------------------------------------------------------

/** Sensible irrigation window for a system type. */
export function defaultConstraints(systemId: string): Field["constraints"] {
  const system = getSystem(systemId);
  if (system.category === "drip" || system.category === "micro") {
    // Low-loss systems can run around the clock.
    return {
      allowedWeekdays: [0, 1, 2, 3, 4, 5, 6],
      earliestStartHour: 18,
      latestEndHour: 12,
      maxHoursPerDay: 18,
    };
  }
  if (system.category === "surface") {
    return {
      allowedWeekdays: [1, 2, 3, 4, 5],
      earliestStartHour: 6,
      latestEndHour: 18,
      maxHoursPerDay: 12,
    };
  }
  // Overhead sprinklers belong at night, out of the wind.
  return {
    allowedWeekdays: [0, 1, 2, 3, 4, 5, 6],
    earliestStartHour: 21,
    latestEndHour: 9,
    maxHoursPerDay: 10,
  };
}

/**
 * A worked example, so a first-time visitor lands on something real rather than
 * an empty form. Two contrasting fields: an unrestricted orchard and a row crop
 * under a district allocation.
 */
export function seededStore(): StoreShape {
  const now = new Date().toISOString();
  const year = new Date().getUTCFullYear();
  return {
    version: 1,
    farms: [
      {
        id: "demo-sanchez",
        name: "Sanchez Family Ranch",
        farmerName: "Maria Sanchez",
        language: "es",
        stationId: "KFAT",
        createdAt: now,
        updatedAt: now,
        fields: [
          {
            id: "demo-almond-north",
            name: "North almond block",
            acres: 42,
            cropId: "almond",
            soilId: "sandy-loam",
            systemId: "micro-sprinkler",
            seasonStartDate: null,
            plantingAgeYears: 9,
            restrictiveLayerDepthFt: null,
            applicationRateInPerHr: null,
            distributionUniformity: 0.82,
            emitter: null,
            waterLimit: null,
            constraints: defaultConstraints("micro-sprinkler"),
            calibration: { ...DEFAULT_CALIBRATION },
            notes: "Nonpareil / Monterey, planted 2017 on 20 x 18 spacing.",
          },
          {
            id: "demo-tomato-south",
            name: "South tomato ground",
            acres: 65,
            cropId: "tomato-processing",
            soilId: "clay-loam",
            systemId: "drip-buried",
            seasonStartDate: `${year}-04-15`,
            plantingAgeYears: null,
            restrictiveLayerDepthFt: null,
            applicationRateInPerHr: null,
            distributionUniformity: 0.88,
            emitter: null,
            waterLimit: {
              amount: 150,
              unit: "acre-feet",
              period: "season",
              note: "District allocation",
            },
            constraints: defaultConstraints("drip-buried"),
            calibration: { ...DEFAULT_CALIBRATION },
            notes: "Transplanted mid-April, contracted for an early-September harvest.",
          },
        ],
      },
    ],
    feedback: [],
  };
}
