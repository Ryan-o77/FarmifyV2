/**
 * Persistence.
 *
 * Farms, fields and feedback live in a JSON file under `data/store/`. A database
 * would be the right answer for a multi-tenant deployment, but for a tool a
 * grower or a farm office runs for themselves, a single file that can be copied,
 * backed up and read without special software is more useful than a server.
 *
 * Writes are serialised through a promise chain and go via a temporary file, so
 * two requests arriving together cannot interleave and leave a half-written
 * store on disk.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Farm, Feedback, Field, Language } from "./types";
import { DEFAULT_CALIBRATION } from "./types";
import { getSystem } from "./agronomy/systems";

const STORE_DIR = path.join(process.cwd(), "data", "store");
const STORE_FILE = path.join(STORE_DIR, "farms.json");

interface StoreShape {
  version: number;
  farms: Farm[];
  feedback: Feedback[];
}

const EMPTY: StoreShape = { version: 1, farms: [], feedback: [] };

let writeChain: Promise<unknown> = Promise.resolve();

async function readStore(): Promise<StoreShape> {
  try {
    const text = await fs.readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(text) as StoreShape;
    return {
      version: parsed.version ?? 1,
      farms: Array.isArray(parsed.farms) ? parsed.farms : [],
      feedback: Array.isArray(parsed.feedback) ? parsed.feedback : [],
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { ...EMPTY, farms: [], feedback: [] };
    throw err;
  }
}

async function writeStore(store: StoreShape): Promise<void> {
  await fs.mkdir(STORE_DIR, { recursive: true });
  const tmp = `${STORE_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await fs.rename(tmp, STORE_FILE);
}

/** Run `mutator` against the store with no other write interleaving. */
async function mutate<T>(mutator: (store: StoreShape) => Promise<T> | T): Promise<T> {
  const run = writeChain.then(async () => {
    const store = await readStore();
    const result = await mutator(store);
    await writeStore(store);
    return result;
  });
  // Keep the chain alive even if this mutation rejects.
  writeChain = run.catch(() => undefined);
  return run;
}

// --- Reads -----------------------------------------------------------------

export async function listFarms(): Promise<Farm[]> {
  const store = await readStore();
  if (store.farms.length === 0) {
    // First run: seed a worked example so the app is not an empty shell.
    return mutate((s) => {
      if (s.farms.length === 0) s.farms = seedFarms();
      return s.farms;
    });
  }
  return store.farms;
}

export async function getFarm(farmId: string): Promise<Farm | null> {
  const farms = await listFarms();
  return farms.find((f) => f.id === farmId) ?? null;
}

export async function getField(
  farmId: string,
  fieldId: string
): Promise<{ farm: Farm; field: Field } | null> {
  const farm = await getFarm(farmId);
  if (!farm) return null;
  const field = farm.fields.find((f) => f.id === fieldId);
  return field ? { farm, field } : null;
}

export async function listFeedback(farmId?: string, fieldId?: string): Promise<Feedback[]> {
  const store = await readStore();
  return store.feedback
    .filter((f) => (farmId ? f.farmId === farmId : true))
    .filter((f) => (fieldId ? f.fieldId === fieldId : true))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// --- Writes ----------------------------------------------------------------

export async function createFarm(input: {
  name: string;
  farmerName: string;
  language: Language;
  stationId: string;
}): Promise<Farm> {
  const now = new Date().toISOString();
  const farm: Farm = {
    id: randomUUID(),
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

export async function updateFarm(
  farmId: string,
  patch: Partial<Omit<Farm, "id" | "fields" | "createdAt">>
): Promise<Farm | null> {
  return mutate((store) => {
    const farm = store.farms.find((f) => f.id === farmId);
    if (!farm) return null;
    Object.assign(farm, patch, { updatedAt: new Date().toISOString() });
    return farm;
  });
}

export async function deleteFarm(farmId: string): Promise<boolean> {
  return mutate((store) => {
    const before = store.farms.length;
    store.farms = store.farms.filter((f) => f.id !== farmId);
    store.feedback = store.feedback.filter((f) => f.farmId !== farmId);
    return store.farms.length < before;
  });
}

export async function upsertField(
  farmId: string,
  field: Omit<Field, "id"> & { id?: string }
): Promise<Field | null> {
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
          calibration: existing.calibration ?? DEFAULT_CALIBRATION,
        };
        return farm.fields[idx];
      }
    }
    const created: Field = {
      ...(field as Field),
      id: field.id ?? randomUUID(),
      calibration: { ...DEFAULT_CALIBRATION },
    };
    farm.fields.push(created);
    return created;
  });
}

export async function deleteField(farmId: string, fieldId: string): Promise<boolean> {
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

export async function recordFeedback(
  entry: Omit<Feedback, "id" | "createdAt">,
  nextCalibration: Field["calibration"],
  previousCalibration: Field["calibration"]
): Promise<Feedback | null> {
  return mutate((store) => {
    const farm = store.farms.find((f) => f.id === entry.farmId);
    if (!farm) return null;
    const field = farm.fields.find((f) => f.id === entry.fieldId);
    if (!field) return null;

    field.calibration = nextCalibration;
    farm.updatedAt = new Date().toISOString();

    const record: Feedback = {
      ...entry,
      id: randomUUID(),
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

// --- Seed data --------------------------------------------------------------

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

function seedFarms(): Farm[] {
  const now = new Date().toISOString();
  const farmId = "demo-sanchez";
  return [
    {
      id: farmId,
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
          seasonStartDate: `${new Date().getUTCFullYear()}-04-15`,
          plantingAgeYears: null,
          restrictiveLayerDepthFt: null,
          applicationRateInPerHr: null,
          distributionUniformity: 0.88,
          emitter: null,
          waterLimit: { amount: 150, unit: "acre-feet", period: "season", note: "District allocation" },
          constraints: defaultConstraints("drip-buried"),
          calibration: { ...DEFAULT_CALIBRATION },
          notes: "Transplanted mid-April, contracted for an early-September harvest.",
        },
      ],
    },
  ];
}
