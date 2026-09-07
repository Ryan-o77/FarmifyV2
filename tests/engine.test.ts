/**
 * Engine tests.
 *
 * These check the properties an irrigation plan has to have to be safe to hand a
 * grower: seasonal water use in the range extension publishes for the crop, a
 * water limit that is genuinely respected, sets that fit inside the hours the
 * grower said they have, and a plan that does not silently change between two
 * identical requests.
 */

import { describe, it, expect } from "vitest";
import { buildFieldPlan, waterLimitToInches, resolveSeasonStart } from "@/lib/plan/engine";
import { simplifyWeek, todayLine, roundDuration, roundGallons } from "@/lib/plan/simplify";
import { applyFeedback, describeCalibration } from "@/lib/feedback";
import { allocateDeficit, estimateRelativeYield } from "@/lib/agronomy/deficit";
import { getCrop, cropCoefficient, rootingDepth, adjustKcForClimate } from "@/lib/agronomy/crops";
import { getSoil, totalAvailableWater, readilyAvailableWater } from "@/lib/agronomy/soils";
import {
  applicationRateFromEmitters,
  applicationRateFromFlow,
  checkRunoffRisk,
  grossApplicationFactor,
  getSystem,
} from "@/lib/agronomy/systems";
import { DEFAULT_CALIBRATION, type Farm, type Field, type Weekday } from "@/lib/types";

function makeField(over: Partial<Field> = {}): Field {
  return {
    id: "field-1",
    name: "Test block",
    acres: 40,
    cropId: "almond",
    soilId: "sandy-loam",
    systemId: "micro-sprinkler",
    seasonStartDate: null,
    plantingAgeYears: 10,
    restrictiveLayerDepthFt: null,
    applicationRateInPerHr: null,
    distributionUniformity: null,
    emitter: null,
    waterLimit: null,
    constraints: {
      allowedWeekdays: [0, 1, 2, 3, 4, 5, 6],
      earliestStartHour: 18,
      latestEndHour: 12,
      maxHoursPerDay: 18,
    },
    calibration: { ...DEFAULT_CALIBRATION },
    ...over,
  };
}

const farm: Farm = {
  id: "farm-1",
  name: "Test farm",
  farmerName: "Tester",
  language: "en",
  stationId: "KFAT",
  fields: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const REFERENCE = new Date(Date.UTC(2026, 6, 1));

describe("seasonal water use lands in the range California extension publishes", () => {
  // Applied water in acre-feet per acre, as reported for mature San Joaquin
  // Valley plantings on efficient systems.
  const cases: { cropId: string; systemId: string; soilId: string; min: number; max: number }[] = [
    { cropId: "almond", systemId: "micro-sprinkler", soilId: "sandy-loam", min: 3.4, max: 4.8 },
    { cropId: "pistachio", systemId: "drip-surface", soilId: "clay-loam", min: 3.0, max: 4.5 },
    { cropId: "grape-wine", systemId: "drip-surface", soilId: "sandy-loam", min: 1.0, max: 2.6 },
    { cropId: "citrus", systemId: "micro-sprinkler", soilId: "sandy-loam", min: 2.4, max: 4.2 },
    { cropId: "tomato-processing", systemId: "drip-buried", soilId: "clay-loam", min: 1.6, max: 3.0 },
    { cropId: "cotton", systemId: "drip-buried", soilId: "clay-loam", min: 2.0, max: 3.6 },
  ];

  for (const c of cases) {
    it(`${c.cropId} uses ${c.min}-${c.max} AF/acre`, () => {
      const field = makeField({
        cropId: c.cropId,
        systemId: c.systemId,
        soilId: c.soilId,
        seasonStartDate: getCrop(c.cropId).perennial ? null : "2026-04-15",
        plantingAgeYears: getCrop(c.cropId).perennial ? 10 : null,
      });
      const plan = buildFieldPlan(farm, field, { referenceDate: REFERENCE });
      expect(plan.season.acreFeetPerAcre).toBeGreaterThan(c.min);
      expect(plan.season.acreFeetPerAcre).toBeLessThan(c.max);
    });
  }
});

describe("the schedule respects what the grower said they can do", () => {
  it("only schedules irrigation on the allowed weekdays", () => {
    const allowed: Weekday[] = [1, 4]; // Monday and Thursday only
    const plan = buildFieldPlan(
      farm,
      makeField({
        constraints: {
          allowedWeekdays: allowed,
          earliestStartHour: 18,
          latestEndHour: 12,
          maxHoursPerDay: 18,
        },
      }),
      { referenceDate: REFERENCE }
    );
    expect(plan.events.length).toBeGreaterThan(0);
    for (const event of plan.events) {
      expect(allowed).toContain(event.weekday);
    }
  });

  it("never schedules a set longer than the hours available in a day", () => {
    const maxHours = 6;
    const plan = buildFieldPlan(
      farm,
      makeField({
        constraints: {
          allowedWeekdays: [0, 1, 2, 3, 4, 5, 6],
          earliestStartHour: 22,
          latestEndHour: 10,
          maxHoursPerDay: maxHours,
        },
      }),
      { referenceDate: REFERENCE }
    );
    for (const event of plan.events) {
      expect(event.durationHours).toBeLessThanOrEqual(maxHours + 1e-6);
    }
  });

  it("irrigates more often when the system can only put on a little at a time", () => {
    const slow = buildFieldPlan(
      farm,
      makeField({ applicationRateInPerHr: 0.05 }),
      { referenceDate: REFERENCE }
    );
    const fast = buildFieldPlan(
      farm,
      makeField({ applicationRateInPerHr: 0.3 }),
      { referenceDate: REFERENCE }
    );
    // A slow system cannot replace a full profile overnight, so it must come
    // back sooner rather than let the block run down past the stress point.
    expect(slow.season.irrigationCount).toBeGreaterThan(fast.season.irrigationCount);
  });

  it("splits a set into cycles when water goes on faster than the soil takes it", () => {
    const plan = buildFieldPlan(
      farm,
      makeField({ soilId: "clay", systemId: "border-flood" }),
      { referenceDate: REFERENCE }
    );
    expect(plan.warnings.some((w) => w.includes("faster than"))).toBe(true);
    expect(plan.events.some((e) => e.cycles.length > 1)).toBe(true);
  });

  it("gives every set a start time on a quarter hour", () => {
    const plan = buildFieldPlan(farm, makeField(), { referenceDate: REFERENCE });
    for (const event of plan.events) {
      const minutes = Number(event.startTime.split(":")[1]);
      expect([0, 15, 30, 45]).toContain(minutes);
    }
  });
});

describe("water limits are actually respected", () => {
  it("keeps seasonal pumping inside a tight allocation", () => {
    const acres = 60;
    const limitAf = 90; // 1.5 AF/acre for a crop that wants far more
    const field = makeField({
      acres,
      cropId: "almond",
      waterLimit: { amount: limitAf, unit: "acre-feet", period: "season" },
    });
    const plan = buildFieldPlan(farm, field, { referenceDate: REFERENCE });

    expect(plan.deficit.applied).toBe(true);
    // Allow a 2% tolerance for the scheduler working in whole sets.
    expect(plan.season.acreFeet).toBeLessThanOrEqual(limitAf * 1.02);
    expect(plan.deficit.estimatedRelativeYield).toBeLessThan(1);
    expect(plan.deficit.estimatedRelativeYield).toBeGreaterThan(0);
  });

  it("leaves the plan alone when the limit is generous", () => {
    const field = makeField({
      acres: 40,
      waterLimit: { amount: 400, unit: "acre-feet", period: "season" },
    });
    const plan = buildFieldPlan(farm, field, { referenceDate: REFERENCE });
    expect(plan.deficit.applied).toBe(false);
    expect(plan.deficit.estimatedRelativeYield).toBeCloseTo(1, 2);
  });

  it("converts every limit unit to the same depth over the field", () => {
    const acres = 50;
    const asFeet = waterLimitToInches(
      { amount: 100, unit: "acre-feet", period: "season" },
      acres,
      200
    );
    const asInches = waterLimitToInches(
      { amount: 1200, unit: "acre-inches", period: "season" },
      acres,
      200
    );
    const asGallons = waterLimitToInches(
      { amount: 100 * 27154.29 * 12, unit: "gallons", period: "season" },
      acres,
      200
    );
    expect(asFeet).toBeCloseTo(24, 6);
    expect(asInches).toBeCloseTo(asFeet, 6);
    expect(asGallons).toBeCloseTo(asFeet, 4);
  });

  it("cuts the tolerant stages harder than the sensitive ones", () => {
    const crop = getCrop("almond");
    const demands = [
      { stage: "initial" as const, etcIn: 6 },
      { stage: "development" as const, etcIn: 10 },
      { stage: "mid" as const, etcIn: 20 },
      { stage: "late" as const, etcIn: 8 },
    ];
    const { allocation } = allocateDeficit(crop, demands, 30); // 30 of 44 in available
    // Almonds are least sensitive late in the season and most sensitive at peak.
    expect(allocation.late).toBeLessThan(allocation.mid);
    expect(allocation.initial).toBeLessThan(allocation.mid);
    for (const stage of ["initial", "development", "mid", "late"] as const) {
      expect(allocation[stage]).toBeGreaterThanOrEqual(0.45);
      expect(allocation[stage]).toBeLessThanOrEqual(1);
    }
  });

  it("charges no yield penalty when demand is fully met", () => {
    const crop = getCrop("almond");
    const relative = estimateRelativeYield(crop, [
      { stage: "mid", etcIn: 20, etActualIn: 20 },
      { stage: "late", etcIn: 8, etActualIn: 8 },
    ]);
    expect(relative).toBeCloseTo(1, 6);
  });

  it("charges more yield for a deficit at peak growth than the same deficit late", () => {
    const crop = getCrop("almond");
    // The same 30% shortfall, moved from peak growth to late season.
    const atPeak = estimateRelativeYield(crop, [
      { stage: "mid", etcIn: 20, etActualIn: 14 },
      { stage: "late", etcIn: 20, etActualIn: 20 },
    ]);
    const atLate = estimateRelativeYield(crop, [
      { stage: "mid", etcIn: 20, etActualIn: 20 },
      { stage: "late", etcIn: 20, etActualIn: 14 },
    ]);
    expect(atPeak).toBeLessThan(atLate);
  });
});

describe("the water balance stays physically consistent", () => {
  it("closes the balance: what goes in equals what goes out", () => {
    const plan = buildFieldPlan(farm, makeField(), { referenceDate: REFERENCE });
    const last = plan.balance[plan.balance.length - 1];

    // FAO-56 eq. 85 accumulated over the season, starting from a full profile:
    //   irrigation + effective rain = crop water use + deep percolation + storage change
    // Depletion is the *shortfall* below field capacity, so it is the negative of
    // storage: ending the season 1.5 in depleted means the soil supplied 1.5 in
    // that never had to be pumped.
    const inputs = plan.season.netIrrigationIn + plan.season.effectiveRainIn;
    const outputs =
      plan.balance.reduce((s, d) => s + d.etActualIn + d.deepPercolationIn, 0) -
      last.depletionIn;

    expect(Math.abs(inputs - outputs)).toBeLessThan(0.01);
  });

  it("never lets depletion exceed the size of the reservoir", () => {
    const plan = buildFieldPlan(
      farm,
      makeField({ waterLimit: { amount: 40, unit: "acre-feet", period: "season" } }),
      { referenceDate: REFERENCE }
    );
    for (const day of plan.balance) {
      expect(day.depletionIn).toBeGreaterThanOrEqual(-1e-9);
      expect(day.depletionIn).toBeLessThanOrEqual(day.tawIn + 1e-6);
      expect(day.soilWaterFraction).toBeGreaterThanOrEqual(0);
      expect(day.soilWaterFraction).toBeLessThanOrEqual(1);
      expect(day.stressCoefficient).toBeGreaterThanOrEqual(0);
      expect(day.stressCoefficient).toBeLessThanOrEqual(1);
    }
  });

  it("keeps actual water use at or below full demand", () => {
    const plan = buildFieldPlan(farm, makeField(), { referenceDate: REFERENCE });
    for (const day of plan.balance) {
      expect(day.etActualIn).toBeLessThanOrEqual(day.etcIn + 1e-9);
    }
  });

  it("gives the same plan twice for the same inputs", () => {
    const a = buildFieldPlan(farm, makeField(), { referenceDate: REFERENCE });
    const b = buildFieldPlan(farm, makeField(), { referenceDate: REFERENCE });
    expect(a.events.map((e) => `${e.date}:${e.durationHours.toFixed(4)}`)).toEqual(
      b.events.map((e) => `${e.date}:${e.durationHours.toFixed(4)}`)
    );
  });

  it("waters a shallow-rooted crop more often than a deep-rooted one on the same soil", () => {
    const onion = buildFieldPlan(
      farm,
      makeField({ cropId: "onion", seasonStartDate: "2026-01-15", plantingAgeYears: null }),
      { referenceDate: new Date(Date.UTC(2026, 3, 1)) }
    );
    const almond = buildFieldPlan(farm, makeField(), { referenceDate: REFERENCE });
    expect(onion.season.averageIntervalDays).toBeLessThan(almond.season.averageIntervalDays);
  });

  it("waters more often when a hardpan shrinks the root zone", () => {
    const deep = buildFieldPlan(farm, makeField(), { referenceDate: REFERENCE });
    const shallow = buildFieldPlan(
      farm,
      makeField({ restrictiveLayerDepthFt: 2 }),
      { referenceDate: REFERENCE }
    );
    expect(shallow.season.irrigationCount).toBeGreaterThan(deep.season.irrigationCount);
  });

  it("leaves a dormant deciduous orchard off the schedule in midwinter", () => {
    const plan = buildFieldPlan(farm, makeField(), {
      referenceDate: new Date(Date.UTC(2026, 6, 1)),
    });
    const december = plan.balance.filter((d) => d.date.startsWith("2026-12"));
    for (const day of december) {
      expect(day.irrigated).toBe(false);
    }
  });
});

describe("crop, soil and system libraries", () => {
  it("traces the FAO-56 trapezoid through the season", () => {
    const crop = getCrop("almond");
    const initial = cropCoefficient(crop, 10);
    const mid = cropCoefficient(crop, 150);
    const late = cropCoefficient(crop, 245);
    const dormant = cropCoefficient(crop, 400);

    expect(initial.stage).toBe("initial");
    expect(mid.stage).toBe("mid");
    expect(late.stage).toBe("late");
    expect(dormant.stage).toBe("dormant");
    expect(mid.kc).toBeGreaterThan(initial.kc);
    expect(mid.kc).toBeGreaterThan(late.kc);
  });

  it("scales a young orchard down", () => {
    const crop = getCrop("almond");
    const mature = cropCoefficient(crop, 150);
    const young = cropCoefficient(crop, 150, { canopyCoverFraction: 0.25 });
    expect(young.kc).toBeLessThan(mature.kc);
    expect(young.kc).toBeGreaterThan(0);
  });

  it("leaves the crop coefficient unchanged under valley reference conditions", () => {
    // The tabulated values are already San Joaquin Valley figures, so a typical
    // valley mid-season must not shift them.
    expect(adjustKcForClimate(1.05, 5, 2.4, 25)).toBeCloseTo(1.05, 6);
    // A windier, drier site genuinely uses more.
    expect(adjustKcForClimate(1.05, 5, 3.5, 20)).toBeGreaterThan(1.05);
    // Low coefficients are outside the equation's validity range.
    expect(adjustKcForClimate(0.3, 5, 5, 15)).toBe(0.3);
  });

  it("grows roots through the development stage and then holds", () => {
    const crop = getCrop("tomato-processing");
    expect(rootingDepth(crop, 0)).toBeCloseTo(crop.initialRootDepthM, 6);
    expect(rootingDepth(crop, 200)).toBeCloseTo(crop.rootDepthM, 6);
    expect(rootingDepth(crop, 40)).toBeGreaterThan(rootingDepth(crop, 10));
  });

  it("holds less usable water above a hardpan", () => {
    const soil = getSoil("sandy-loam");
    expect(totalAvailableWater(soil, 1.8, 2)).toBeLessThan(totalAvailableWater(soil, 1.8, null));
    expect(readilyAvailableWater(soil, 1.8, 0.4)).toBeLessThan(totalAvailableWater(soil, 1.8));
  });

  it("computes application rate from an emitter layout", () => {
    // 1 gph emitters at 2 ft spacing on 5 ft laterals: 4356 emitters/acre.
    const rate = applicationRateFromEmitters({
      emitterGph: 1,
      emitterSpacingFt: 2,
      lateralSpacingFt: 5,
    });
    expect(rate).toBeCloseTo(4356 / 27154.29, 4);
  });

  it("computes application rate from a measured flow", () => {
    // 500 gpm onto 40 acres.
    expect(applicationRateFromFlow(500, 40)).toBeCloseTo((500 * 60) / (40 * 27154.29), 6);
    expect(applicationRateFromFlow(500, 0)).toBe(0);
  });

  it("flags runoff risk only when application outruns infiltration", () => {
    expect(checkRunoffRisk(0.08, 1.0).atRisk).toBe(false);
    const risky = checkRunoffRisk(0.75, 0.15);
    expect(risky.atRisk).toBe(true);
    expect(risky.suggestedCycles).toBeGreaterThan(1);
  });

  it("requires more pumped water from a less efficient system", () => {
    const drip = grossApplicationFactor(getSystem("drip-buried"));
    const flood = grossApplicationFactor(getSystem("border-flood"));
    expect(flood).toBeGreaterThan(drip);
    expect(drip).toBeGreaterThan(1);
  });
});

describe("perennial seasons are anchored to the calendar", () => {
  it("finds the season containing the planning date", () => {
    const crop = getCrop("almond");
    const start = resolveSeasonStart(crop, makeField(), new Date(Date.UTC(2026, 6, 1)));
    expect(start.toISOString().slice(0, 10)).toBe("2026-02-20");
  });

  it("plans the next season when asked between seasons", () => {
    const crop = getCrop("almond");
    const start = resolveSeasonStart(crop, makeField(), new Date(Date.UTC(2026, 0, 5)));
    expect(start.toISOString().slice(0, 10)).toBe("2026-02-20");
  });

  it("uses the planting date for an annual crop", () => {
    const crop = getCrop("tomato-processing");
    const start = resolveSeasonStart(
      crop,
      makeField({ cropId: "tomato-processing", seasonStartDate: "2026-04-20" }),
      new Date(Date.UTC(2026, 5, 1))
    );
    expect(start.toISOString().slice(0, 10)).toBe("2026-04-20");
  });
});

describe("plain-language output", () => {
  it("rounds run times to something a person can set", () => {
    expect(roundDuration(7.43)).toEqual({ hours: 7, minutes: 25 });
    expect(roundDuration(0.02)).toEqual({ hours: 0, minutes: 5 });
    expect(roundGallons(1_824_768)).toBe(1_820_000);
    expect(roundGallons(432)).toBe(430);
  });

  it("produces a summary in each supported language", () => {
    const plan = buildFieldPlan(farm, makeField(), { referenceDate: REFERENCE });
    const week = plan.weeks.find((w) => w.events.length > 0);
    expect(week).toBeDefined();

    for (const language of ["en", "es", "pa", "hmn"] as const) {
      const summary = simplifyWeek(plan, week!, language);
      expect(summary.headline.length).toBeGreaterThan(0);
      expect(summary.steps.length).toBe(week!.events.length);
      for (const step of summary.steps) {
        expect(step.weekdayName.length).toBeGreaterThan(0);
        expect(step.durationLabel.length).toBeGreaterThan(0);
        expect(step.gallonsLabel).toMatch(/\d/);
      }
      expect(summary.checkLine.length).toBeGreaterThan(0);
    }
  });

  it("says clearly when there is nothing to do today", () => {
    const plan = buildFieldPlan(farm, makeField(), { referenceDate: REFERENCE });
    const line = todayLine(plan, "2026-12-25", "en");
    expect(line.water).toBe(false);
    expect(line.text).toBe("No water today");
  });

  it("gives a concrete instruction on a day with a set", () => {
    const plan = buildFieldPlan(farm, makeField(), { referenceDate: REFERENCE });
    const event = plan.events[0];
    const line = todayLine(plan, event.date, "en");
    expect(line.water).toBe(true);
    expect(line.text).toMatch(/Water at .* for .*/);
  });
});

describe("feedback moves the plan", () => {
  it("raises water use when the grower reports the ground drying out", () => {
    const { calibration } = applyFeedback(DEFAULT_CALIBRATION, "too-dry");
    expect(calibration.demandFactor).toBeGreaterThan(1);
    expect(calibration.observations).toBe(1);
  });

  it("lowers water use when the grower reports the ground staying wet", () => {
    const { calibration } = applyFeedback(DEFAULT_CALIBRATION, "too-wet");
    expect(calibration.demandFactor).toBeLessThan(1);
  });

  it("blames the hardware, not the crop, when water runs off", () => {
    const { calibration } = applyFeedback(DEFAULT_CALIBRATION, "runoff");
    expect(calibration.demandFactor).toBeCloseTo(1, 6);
    expect(calibration.applicationFactor).toBeLessThan(1);
  });

  it("moves less with each successive report", () => {
    let calibration = { ...DEFAULT_CALIBRATION };
    const steps: number[] = [];
    for (let i = 0; i < 4; i++) {
      const before = calibration.demandFactor;
      calibration = applyFeedback(calibration, "too-dry").calibration;
      steps.push(calibration.demandFactor - before);
    }
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]).toBeLessThan(steps[i - 1]);
    }
  });

  it("never runs away, however many reports arrive", () => {
    let calibration = { ...DEFAULT_CALIBRATION };
    for (let i = 0; i < 100; i++) {
      calibration = applyFeedback(calibration, "too-dry").calibration;
    }
    expect(calibration.demandFactor).toBeLessThanOrEqual(1.6);
    expect(calibration.demandFactor).toBeGreaterThan(1);
  });

  it("actually changes the schedule it produces", () => {
    const base = buildFieldPlan(farm, makeField(), { referenceDate: REFERENCE });
    const thirsty = buildFieldPlan(
      farm,
      makeField({ calibration: { demandFactor: 1.25, applicationFactor: 1, observations: 4 } }),
      { referenceDate: REFERENCE }
    );
    expect(thirsty.season.grossIrrigationIn).toBeGreaterThan(base.season.grossIrrigationIn);
  });

  it("lengthens sets when the system under-delivers", () => {
    const base = buildFieldPlan(farm, makeField(), { referenceDate: REFERENCE });
    const weak = buildFieldPlan(
      farm,
      makeField({ calibration: { demandFactor: 1, applicationFactor: 0.75, observations: 3 } }),
      { referenceDate: REFERENCE }
    );
    // Individual sets are capped by the hours in the watering window, so the
    // invariant is total run time across the season: the same depth of water
    // through a slower system simply takes longer to apply.
    const baseHours = base.events.reduce((s, e) => s + e.durationHours, 0);
    const weakHours = weak.events.reduce((s, e) => s + e.durationHours, 0);
    expect(weakHours).toBeGreaterThan(baseHours);
  });

  it("describes what it has learned in plain words", () => {
    expect(describeCalibration(DEFAULT_CALIBRATION)).toMatch(/No feedback yet/);
    const { calibration } = applyFeedback(DEFAULT_CALIBRATION, "too-dry");
    expect(describeCalibration(calibration)).toMatch(/drying out faster/);
  });
});
