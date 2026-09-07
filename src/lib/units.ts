/**
 * Unit conversions.
 *
 * The agronomic core runs entirely in SI because that is what FAO-56 is written in.
 * Everything a Central Valley grower reads or types is US customary, so conversion
 * happens at the edges only -- never in the middle of a calculation.
 */

export const GALLONS_PER_ACRE_INCH = 27154.29;
export const CUBIC_FEET_PER_ACRE_FOOT = 43560;
export const GALLONS_PER_ACRE_FOOT = GALLONS_PER_ACRE_INCH * 12;

export const fToC = (f: number): number => ((f - 32) * 5) / 9;
export const cToF = (c: number): number => (c * 9) / 5 + 32;

export const inToMm = (inches: number): number => inches * 25.4;
export const mmToIn = (mm: number): number => mm / 25.4;

export const mphToMs = (mph: number): number => mph * 0.44704;
export const msToMph = (ms: number): number => ms / 0.44704;

export const ftToM = (ft: number): number => ft * 0.3048;
export const mToFt = (m: number): number => m / 0.3048;

export const inHgToKPa = (inHg: number): number => inHg * 3.386389;

/** Acre-inches of water, expressed as gallons. */
export const acreInchesToGallons = (acreInches: number): number =>
  acreInches * GALLONS_PER_ACRE_INCH;

/** Gallons of water, expressed as acre-inches. */
export const gallonsToAcreInches = (gallons: number): number =>
  gallons / GALLONS_PER_ACRE_INCH;

/** A depth of water (inches) applied over `acres`, expressed as gallons. */
export const depthToGallons = (depthIn: number, acres: number): number =>
  depthIn * acres * GALLONS_PER_ACRE_INCH;

/** A volume of water (gallons) spread over `acres`, expressed as a depth in inches. */
export const gallonsToDepth = (gallons: number, acres: number): number =>
  acres > 0 ? gallons / (acres * GALLONS_PER_ACRE_INCH) : 0;

export const acreFeetToGallons = (af: number): number => af * GALLONS_PER_ACRE_FOOT;
export const gallonsToAcreFeet = (gal: number): number => gal / GALLONS_PER_ACRE_FOOT;

/** Round to `digits` decimal places, returning a number (not a string). */
export function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/** Clamp `value` into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
