/**
 * The evapotranspiration engine is validated two ways.
 *
 * First against the worked values published in FAO-56 itself, which pins the
 * individual equations. Then against the seasonal totals the California
 * Irrigation Management Information System publishes for the San Joaquin Valley,
 * which is the check that actually matters: an equation can be transcribed
 * perfectly and still produce the wrong answer for Fresno.
 */

import { describe, it, expect } from "vitest";
import {
  saturationVapourPressure,
  slopeSaturationVapourPressure,
  atmosphericPressure,
  psychrometricConstant,
  extraterrestrialRadiation,
  windSpeedAt2m,
  daylightHours,
  referenceEto,
} from "@/lib/climate/eto";
import {
  getStation,
  dailyClimateNormal,
  climateTotals,
  interpolateMonthly,
  getBiasFactors,
} from "@/lib/climate/station";
import { fToC, mphToMs, mmToIn } from "@/lib/units";

describe("FAO-56 building blocks", () => {
  it("matches the saturation vapour pressures in FAO-56 Table 2.3", () => {
    // e0(T) values published in the table, kPa.
    expect(saturationVapourPressure(15)).toBeCloseTo(1.705, 3);
    expect(saturationVapourPressure(20)).toBeCloseTo(2.338, 3);
    expect(saturationVapourPressure(25)).toBeCloseTo(3.168, 3);
    expect(saturationVapourPressure(30)).toBeCloseTo(4.243, 3);
  });

  it("matches the vapour pressure curve slopes in FAO-56 Table 2.4", () => {
    expect(slopeSaturationVapourPressure(20)).toBeCloseTo(0.145, 3);
    expect(slopeSaturationVapourPressure(25)).toBeCloseTo(0.189, 3);
    expect(slopeSaturationVapourPressure(30)).toBeCloseTo(0.243, 3);
  });

  it("reproduces the atmospheric pressure and psychrometric constant of FAO-56 Example 2", () => {
    // 1800 m elevation: P = 81.8 kPa, gamma = 0.054 kPa/degC.
    expect(atmosphericPressure(1800)).toBeCloseTo(81.8, 1);
    expect(psychrometricConstant(1800)).toBeCloseTo(0.054, 3);
  });

  it("reproduces the extraterrestrial radiation of FAO-56 Example 8", () => {
    // 20 degrees S on 3 September (day 246): Ra = 32.2 MJ/m2/day.
    expect(extraterrestrialRadiation(-20, 246)).toBeCloseTo(32.2, 1);
  });

  it("reproduces the daylight hours of FAO-56 Example 10", () => {
    // 20 degrees S on 3 September: N = 11.7 hours.
    expect(daylightHours(-20, 246)).toBeCloseTo(11.7, 1);
  });

  it("adjusts wind speed to 2 m by FAO-56 eq. 47", () => {
    // 3.2 m/s measured at 10 m becomes 2.4 m/s at 2 m.
    expect(windSpeedAt2m(3.2, 10)).toBeCloseTo(2.4, 1);
    // A measurement already at 2 m is returned untouched.
    expect(windSpeedAt2m(2.5, 2)).toBe(2.5);
  });

  it("keeps solar radiation below the clear-sky ceiling", () => {
    const result = referenceEto({
      tmaxC: 38,
      tminC: 20,
      dewpointC: 12,
      windSpeedMs: 2,
      elevationM: 100,
      latitudeDeg: 36.78,
      dayOfYear: 196,
      // Deliberately absurd input: more sun than physically reaches the ground.
      solarRadiationMj: 999,
    });
    expect(result.rsMj).toBeLessThanOrEqual(result.rsoMj);
    expect(result.etoMm).toBeGreaterThan(0);
  });

  it("never lets actual vapour pressure exceed saturation", () => {
    const result = referenceEto({
      tmaxC: 20,
      tminC: 10,
      dewpointC: 40, // impossible: dewpoint above the air temperature
      windSpeedMs: 2,
      elevationM: 100,
      latitudeDeg: 36.78,
      dayOfYear: 100,
    });
    expect(result.eaKPa).toBeLessThanOrEqual(result.esKPa + 1e-9);
    expect(result.vpdKPa).toBeGreaterThanOrEqual(0);
  });

  it("splits ETo into a radiation term and an aerodynamic term that sum to the total", () => {
    const r = referenceEto({
      tmaxC: 37,
      tminC: 20,
      dewpointC: 13,
      windSpeedMs: 3.2,
      elevationM: 102,
      latitudeDeg: 36.78,
      dayOfYear: 196,
    });
    expect(r.radiationTermMm + r.aerodynamicTermMm).toBeCloseTo(r.etoMm, 6);
    // In a hot, dry valley summer both terms are substantial.
    expect(r.radiationTermMm).toBeGreaterThan(0);
    expect(r.aerodynamicTermMm).toBeGreaterThan(0);
  });

  it("produces more ETo on a hot dry windy day than a cool humid calm one", () => {
    const base = {
      elevationM: 102,
      latitudeDeg: 36.78,
      dayOfYear: 196,
    };
    const harsh = referenceEto({ ...base, tmaxC: 40, tminC: 22, dewpointC: 8, windSpeedMs: 6 });
    const mild = referenceEto({ ...base, tmaxC: 26, tminC: 18, dewpointC: 17, windSpeedMs: 1 });
    expect(harsh.etoMm).toBeGreaterThan(mild.etoMm * 1.5);
  });
});

describe("station climatology", () => {
  it("matches CIMIS annual reference ETo at every station after bias correction", () => {
    for (const station of [getStation("KFAT"), getStation("KBFL"), getStation("KMOD")]) {
      const totals = climateTotals(
        station,
        new Date(Date.UTC(2025, 0, 1)),
        new Date(Date.UTC(2025, 11, 31))
      );
      expect(totals.etoIn).toBeCloseTo(station.referenceEtoNormals.annualIn, 0);
    }
  });

  it("puts Fresno's July reference ETo in the range CIMIS reports for the valley", () => {
    const station = getStation("KFAT");
    const july = dailyClimateNormal(station, new Date(Date.UTC(2025, 6, 15)));
    // CIMIS zone 15 mid-July runs about 0.25-0.28 in/day.
    expect(july.etoIn).toBeGreaterThan(0.24);
    expect(july.etoIn).toBeLessThan(0.29);
  });

  it("puts Fresno's January reference ETo near zero, as winter fog demands", () => {
    const january = dailyClimateNormal(getStation("KFAT"), new Date(Date.UTC(2025, 0, 15)));
    expect(january.etoIn).toBeGreaterThan(0.015);
    expect(january.etoIn).toBeLessThan(0.05);
  });

  it("reproduces each station's annual rainfall from the monthly record", () => {
    for (const station of [getStation("KFAT"), getStation("KBFL"), getStation("KMOD")]) {
      const expected = station.monthly.reduce((s, m) => s + m.precipIn, 0);
      const totals = climateTotals(
        station,
        new Date(Date.UTC(2025, 0, 1)),
        new Date(Date.UTC(2025, 11, 31))
      );
      // Daily interpolation of monthly totals should conserve the annual sum.
      expect(totals.rainIn).toBeCloseTo(expected, 0);
    }
  });

  it("interpolates monthly values smoothly across the turn of the year", () => {
    const station = getStation("KFAT");
    const values = station.monthly.map((m) => m.tmaxF);
    const dec31 = interpolateMonthly(values, 365);
    const jan1 = interpolateMonthly(values, 1);
    // No discontinuity: one day apart should differ by a fraction of a degree.
    expect(Math.abs(dec31 - jan1)).toBeLessThan(0.5);
  });

  it("keeps bias factors within a plausible correction range", () => {
    for (const station of [getStation("KFAT"), getStation("KBFL"), getStation("KMOD")]) {
      for (const factor of getBiasFactors(station)) {
        expect(factor).toBeGreaterThan(0.5);
        expect(factor).toBeLessThan(1.2);
      }
    }
  });

  it("computes uncorrected Penman-Monteith above the corrected value, as the airport bias implies", () => {
    const july = dailyClimateNormal(getStation("KFAT"), new Date(Date.UTC(2025, 6, 15)));
    expect(mmToIn(july.rawEtoMm)).toBeGreaterThan(july.etoIn);
  });

  it("falls back to the default station for an unknown id", () => {
    expect(getStation("NOPE").id).toBe("KFAT");
    expect(getStation(null).id).toBe("KFAT");
  });
});

describe("units", () => {
  it("round-trips Fahrenheit, inches and wind speed", () => {
    expect(fToC(212)).toBeCloseTo(100, 6);
    expect(fToC(32)).toBeCloseTo(0, 6);
    expect(mmToIn(25.4)).toBeCloseTo(1, 9);
    expect(mphToMs(1)).toBeCloseTo(0.44704, 6);
  });
});
