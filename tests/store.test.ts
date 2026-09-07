/**
 * Persistence tests.
 *
 * These run against a real temporary store directory rather than a mock, because
 * the things worth checking here -- that concurrent writes do not interleave,
 * and that a form post cannot clobber learned calibration -- only exist at the
 * file layer.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

let workDir: string;
let originalCwd: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), "farmify-store-"));
  // The store resolves its path from the working directory at call time.
  vi.spyOn(process, "cwd").mockReturnValue(workDir);
  vi.resetModules();
});

afterEach(async () => {
  vi.restoreAllMocks();
  process.chdir(originalCwd);
  await fs.rm(workDir, { recursive: true, force: true });
});

async function loadStore() {
  return import("@/lib/store");
}

describe("the store", () => {
  it("seeds a worked example on first read", async () => {
    const store = await loadStore();
    const farms = await store.listFarms();
    expect(farms.length).toBeGreaterThan(0);
    expect(farms[0].fields.length).toBeGreaterThan(0);
    // Seeding is persisted, not regenerated each time.
    const again = await store.listFarms();
    expect(again[0].id).toBe(farms[0].id);
  });

  it("creates, updates and deletes a farm", async () => {
    const store = await loadStore();
    const farm = await store.createFarm({
      name: "Test Ranch",
      farmerName: "Grower",
      language: "pa",
      stationId: "KBFL",
    });
    expect(farm.id).toBeTruthy();

    const updated = await store.updateFarm(farm.id, { name: "Renamed Ranch" });
    expect(updated?.name).toBe("Renamed Ranch");
    expect(updated?.language).toBe("pa");

    expect(await store.deleteFarm(farm.id)).toBe(true);
    expect(await store.getFarm(farm.id)).toBeNull();
  });

  it("adds a field and finds it again", async () => {
    const store = await loadStore();
    const farm = await store.createFarm({
      name: "Test Ranch",
      farmerName: "Grower",
      language: "en",
      stationId: "KFAT",
    });
    const field = await store.upsertField(farm.id, {
      name: "Block A",
      acres: 25,
      cropId: "walnut",
      soilId: "loam",
      systemId: "micro-sprinkler",
      seasonStartDate: null,
      plantingAgeYears: 8,
      restrictiveLayerDepthFt: null,
      applicationRateInPerHr: null,
      distributionUniformity: null,
      emitter: null,
      waterLimit: null,
      constraints: store.defaultConstraints("micro-sprinkler"),
      calibration: { demandFactor: 1, applicationFactor: 1, observations: 0 },
    });
    expect(field?.id).toBeTruthy();

    const found = await store.getField(farm.id, field!.id);
    expect(found?.field.name).toBe("Block A");
    expect(found?.field.acres).toBe(25);
  });

  it("never lets a field edit overwrite learned calibration", async () => {
    const store = await loadStore();
    const farms = await store.listFarms();
    const farm = farms[0];
    const field = farm.fields[0];

    // Simulate feedback having moved the calibration.
    await store.recordFeedback(
      { farmId: farm.id, fieldId: field.id, kind: "too-dry", date: "2026-07-01" },
      { demandFactor: 1.1, applicationFactor: 0.95, observations: 1 },
      field.calibration
    );

    // Now save the field again as an edit form would, posting default calibration.
    await store.upsertField(farm.id, {
      ...field,
      name: "Renamed block",
      calibration: { demandFactor: 1, applicationFactor: 1, observations: 0 },
    });

    const after = await store.getField(farm.id, field.id);
    expect(after?.field.name).toBe("Renamed block");
    // What the app learned survives the edit.
    expect(after?.field.calibration.demandFactor).toBeCloseTo(1.1, 6);
    expect(after?.field.calibration.observations).toBe(1);
  });

  it("records feedback with what it changed, newest first", async () => {
    const store = await loadStore();
    const farm = (await store.listFarms())[0];
    const field = farm.fields[0];

    await store.recordFeedback(
      { farmId: farm.id, fieldId: field.id, kind: "too-dry", date: "2026-07-01" },
      { demandFactor: 1.1, applicationFactor: 1, observations: 1 },
      { demandFactor: 1, applicationFactor: 1, observations: 0 }
    );
    await store.recordFeedback(
      { farmId: farm.id, fieldId: field.id, kind: "just-right", date: "2026-07-08" },
      { demandFactor: 1.1, applicationFactor: 1, observations: 2 },
      { demandFactor: 1.1, applicationFactor: 1, observations: 1 }
    );

    const history = await store.listFeedback(farm.id, field.id);
    expect(history.length).toBe(2);
    expect(history[0].date).toBe("2026-07-08");
    expect(history[1].applied?.demandFactorBefore).toBe(1);
    expect(history[1].applied?.demandFactorAfter).toBeCloseTo(1.1, 6);
  });

  it("does not lose writes that arrive at the same moment", async () => {
    const store = await loadStore();
    // Ten farms created concurrently must all survive: the store serialises
    // writes, so no read-modify-write can clobber another.
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        store.createFarm({
          name: `Farm ${i}`,
          farmerName: "Grower",
          language: "en",
          stationId: "KFAT",
        })
      )
    );
    const farms = await store.listFarms();
    const created = farms.filter((f) => f.name.startsWith("Farm "));
    expect(created.length).toBe(10);
  });

  it("gives drip and flood systems different default watering windows", async () => {
    const store = await loadStore();
    const drip = store.defaultConstraints("drip-buried");
    const flood = store.defaultConstraints("border-flood");
    const sprinkler = store.defaultConstraints("solid-set-sprinkler");

    // Drip loses almost nothing to evaporation, so it can run around the clock.
    expect(drip.maxHoursPerDay).toBeGreaterThan(sprinkler.maxHoursPerDay);
    // Overhead sprinklers belong at night, out of the wind.
    expect(sprinkler.earliestStartHour).toBeGreaterThanOrEqual(20);
    // Surface irrigation needs someone there to move water.
    expect(flood.earliestStartHour).toBeGreaterThanOrEqual(6);
    expect(flood.latestEndHour).toBeLessThanOrEqual(18);
  });
});
