/**
 * Browser-store tests.
 *
 * Farmify has no server, so this module is the only thing standing between a
 * grower and losing their records. The cases that matter are the awkward ones:
 * a browser that refuses to persist, a corrupt value in storage, a form post
 * that must not clobber learned calibration, and a backup file that round-trips.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

/** A localStorage good enough to test against, with switchable failure modes. */
class FakeStorage implements Storage {
  private map = new Map<string, string>();
  throwOnWrite = false;
  throwOnAccess = false;

  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string) {
    if (this.throwOnAccess) throw new Error("access denied");
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.throwOnAccess || this.throwOnWrite) throw new Error("quota exceeded");
    this.map.set(k, v);
  }
  removeItem(k: string) {
    if (this.throwOnAccess) throw new Error("access denied");
    this.map.delete(k);
  }
}

let fake: FakeStorage;

beforeEach(async () => {
  fake = new FakeStorage();
  vi.stubGlobal("window", { localStorage: fake } as unknown as Window & typeof globalThis);
  vi.resetModules();
});

async function load() {
  return import("@/lib/clientStore");
}

describe("the browser store", () => {
  it("seeds a worked example for a first-time visitor", async () => {
    const store = await load();
    const farms = store.listFarms();
    expect(farms.length).toBe(1);
    expect(farms[0].fields.length).toBe(2);
    // Seeding is written straight back, so a reload sees the same workspace.
    expect(fake.getItem("farmify.store.v1")).toContain("Sanchez Family Ranch");
  });

  it("keeps one visitor's edits out of another's", async () => {
    const store = await load();
    store.createFarm({
      name: "Only mine",
      farmerName: "A",
      language: "en",
      stationId: "KFAT",
    });
    expect(store.listFarms().some((f) => f.name === "Only mine")).toBe(true);

    // A different browser is a different storage object entirely.
    fake = new FakeStorage();
    vi.stubGlobal("window", { localStorage: fake } as unknown as Window & typeof globalThis);
    vi.resetModules();
    const other = await load();
    expect(other.listFarms().some((f) => f.name === "Only mine")).toBe(false);
    expect(other.listFarms()[0].name).toBe("Sanchez Family Ranch");
  });

  it("creates, updates and deletes a farm", async () => {
    const store = await load();
    const farm = store.createFarm({
      name: "Test Ranch",
      farmerName: "Grower",
      language: "pa",
      stationId: "KBFL",
    });
    expect(store.getFarm(farm.id)?.language).toBe("pa");

    store.updateFarm(farm.id, { name: "Renamed" });
    expect(store.getFarm(farm.id)?.name).toBe("Renamed");
    // A patch must not silently drop untouched fields.
    expect(store.getFarm(farm.id)?.stationId).toBe("KBFL");

    expect(store.deleteFarm(farm.id)).toBe(true);
    expect(store.getFarm(farm.id)).toBeNull();
  });

  it("adds a field and finds it again", async () => {
    const store = await load();
    const farm = store.listFarms()[0];
    const field = store.upsertField(farm.id, {
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
    expect(store.getField(farm.id, field!.id)?.field.cropId).toBe("walnut");
  });

  it("never lets a field edit overwrite learned calibration", async () => {
    const store = await load();
    const farm = store.listFarms()[0];
    const field = farm.fields[0];

    store.recordFeedback(
      { farmId: farm.id, fieldId: field.id, kind: "too-dry", date: "2026-07-01" },
      { demandFactor: 1.1, applicationFactor: 0.95, observations: 1 },
      field.calibration
    );

    // Save the field again as the edit form would, posting default calibration.
    store.upsertField(farm.id, {
      ...field,
      name: "Renamed block",
      calibration: { demandFactor: 1, applicationFactor: 1, observations: 0 },
    });

    const after = store.getField(farm.id, field.id);
    expect(after?.field.name).toBe("Renamed block");
    expect(after?.field.calibration.demandFactor).toBeCloseTo(1.1, 6);
    expect(after?.field.calibration.observations).toBe(1);
  });

  it("records feedback with what it changed, newest first", async () => {
    const store = await load();
    const farm = store.listFarms()[0];
    const field = farm.fields[0];

    store.recordFeedback(
      { farmId: farm.id, fieldId: field.id, kind: "too-dry", date: "2026-07-01" },
      { demandFactor: 1.1, applicationFactor: 1, observations: 1 },
      { demandFactor: 1, applicationFactor: 1, observations: 0 }
    );
    store.recordFeedback(
      { farmId: farm.id, fieldId: field.id, kind: "just-right", date: "2026-07-08" },
      { demandFactor: 1.1, applicationFactor: 1, observations: 2 },
      { demandFactor: 1.1, applicationFactor: 1, observations: 1 }
    );

    const history = store.listFeedback(farm.id, field.id);
    expect(history.length).toBe(2);
    expect(history[0].date).toBe("2026-07-08");
    expect(history[1].applied?.demandFactorAfter).toBeCloseTo(1.1, 6);
  });

  it("deletes a field's feedback along with the field", async () => {
    const store = await load();
    const farm = store.listFarms()[0];
    const field = farm.fields[0];
    store.recordFeedback(
      { farmId: farm.id, fieldId: field.id, kind: "too-dry", date: "2026-07-01" },
      { demandFactor: 1.1, applicationFactor: 1, observations: 1 },
      { demandFactor: 1, applicationFactor: 1, observations: 0 }
    );
    expect(store.listFeedback(farm.id, field.id).length).toBe(1);
    store.deleteField(farm.id, field.id);
    expect(store.listFeedback(farm.id, field.id).length).toBe(0);
  });

  it("round-trips a backup file", async () => {
    const store = await load();
    store.createFarm({
      name: "Backed up",
      farmerName: "G",
      language: "en",
      stationId: "KMOD",
    });
    const backup = store.exportJson();

    store.clearAll();
    expect(store.listFarms().length).toBe(0);

    expect(store.importJson(backup)).toEqual({ ok: true });
    expect(store.listFarms().some((f) => f.name === "Backed up")).toBe(true);
  });

  it("refuses a file that is not a backup, without destroying anything", async () => {
    const store = await load();
    const before = store.listFarms().length;

    expect(store.importJson("this is not json")).toEqual({
      ok: false,
      error: "That file is not valid JSON.",
    });
    expect(store.importJson('{"something":"else"}')).toEqual({
      ok: false,
      error: "That file does not look like a Farmify backup.",
    });
    expect(store.listFarms().length).toBe(before);
  });

  it("recovers from a corrupt value in storage rather than breaking the page", async () => {
    fake.setItem("farmify.store.v1", "{ not json at all");
    const store = await load();
    expect(store.listFarms().length).toBeGreaterThan(0);
  });

  it("keeps working when the browser refuses to persist", async () => {
    fake.throwOnAccess = true;
    const store = await load();
    // Private browsing: the session still works, it just will not survive a reload.
    const farm = store.createFarm({
      name: "Ephemeral",
      farmerName: "G",
      language: "en",
      stationId: "KFAT",
    });
    expect(store.getFarm(farm.id)?.name).toBe("Ephemeral");
  });

  it("keeps the session alive when the quota is exhausted", async () => {
    const store = await load();
    fake.throwOnWrite = true;
    const farm = store.createFarm({
      name: "Over quota",
      farmerName: "G",
      language: "en",
      stationId: "KFAT",
    });
    expect(store.getFarm(farm.id)?.name).toBe("Over quota");
  });

  it("resets to the worked example on demand", async () => {
    const store = await load();
    store.clearAll();
    expect(store.listFarms().length).toBe(0);
    store.resetToSeed();
    expect(store.listFarms()[0].name).toBe("Sanchez Family Ranch");
  });

  it("gives drip and flood systems different default watering windows", async () => {
    const store = await load();
    const drip = store.defaultConstraints("drip-buried");
    const flood = store.defaultConstraints("border-flood");
    const sprinkler = store.defaultConstraints("solid-set-sprinkler");

    expect(drip.maxHoursPerDay).toBeGreaterThan(sprinkler.maxHoursPerDay);
    expect(sprinkler.earliestStartHour).toBeGreaterThanOrEqual(20);
    expect(flood.earliestStartHour).toBeGreaterThanOrEqual(6);
    expect(flood.latestEndHour).toBeLessThanOrEqual(18);
  });
});
