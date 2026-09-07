/**
 * Reference evapotranspiration (ETo) by the FAO-56 Penman-Monteith method.
 *
 * Allen, R.G., Pereira, L.S., Raes, D., Smith, M. (1998).
 * "Crop evapotranspiration -- Guidelines for computing crop water requirements."
 * FAO Irrigation and Drainage Paper 56.
 *
 * ETo is the water use of a hypothetical reference crop: 0.12 m tall, surface
 * resistance 70 s/m, albedo 0.23 -- close to a uniform, well-watered grass sward.
 * Every irrigation number this app produces starts here, so this module is kept
 * pure (no I/O, no dates beyond day-of-year) and is unit-tested against the
 * worked values published in FAO-56.
 *
 * All inputs and outputs are SI. Equation numbers below refer to FAO-56.
 */

const SOLAR_CONSTANT = 0.0820; // MJ m^-2 min^-1
const STEFAN_BOLTZMANN = 4.903e-9; // MJ K^-4 m^-2 day^-1
const ALBEDO_REFERENCE_CROP = 0.23;

export interface EtoInputs {
  /** Daily maximum air temperature, degrees C. */
  tmaxC: number;
  /** Daily minimum air temperature, degrees C. */
  tminC: number;
  /** Mean dewpoint temperature, degrees C. Preferred source of actual vapour pressure. */
  dewpointC?: number;
  /** Mean relative humidity, percent. Used only when dewpoint is unavailable. */
  relativeHumidityPct?: number;
  /** Wind speed, m/s. */
  windSpeedMs: number;
  /** Height at which wind speed was measured, m. Defaults to the 10 m ASOS standard. */
  windMeasurementHeightM?: number;
  /** Station elevation above sea level, m. */
  elevationM: number;
  /** Site latitude in decimal degrees; negative in the southern hemisphere. */
  latitudeDeg: number;
  /** Day of year, 1-366. */
  dayOfYear: number;
  /**
   * Measured incoming solar radiation, MJ m^-2 day^-1.
   * When absent it is estimated from the diurnal temperature range (eq. 50).
   */
  solarRadiationMj?: number;
  /**
   * Hargreaves radiation adjustment coefficient. 0.16 for interior locations,
   * 0.19 near a coast. The San Joaquin Valley is interior.
   */
  krs?: number;
}

export interface EtoBreakdown {
  /** Reference evapotranspiration, mm/day. */
  etoMm: number;
  /** Extraterrestrial radiation, MJ m^-2 day^-1 (eq. 21). */
  raMj: number;
  /** Incoming solar radiation, MJ m^-2 day^-1 -- measured or estimated. */
  rsMj: number;
  /** Clear-sky solar radiation, MJ m^-2 day^-1 (eq. 37). */
  rsoMj: number;
  /** Net radiation at the crop surface, MJ m^-2 day^-1 (eq. 40). */
  rnMj: number;
  /** Saturation vapour pressure, kPa (eq. 12). */
  esKPa: number;
  /** Actual vapour pressure, kPa. */
  eaKPa: number;
  /** Vapour pressure deficit, kPa. */
  vpdKPa: number;
  /** Slope of the saturation vapour pressure curve, kPa/degC (eq. 13). */
  deltaKPaC: number;
  /** Psychrometric constant, kPa/degC (eq. 8). */
  gammaKPaC: number;
  /** Wind speed adjusted to 2 m, m/s (eq. 47). */
  u2Ms: number;
  /** The share of ETo driven by available energy, mm/day. */
  radiationTermMm: number;
  /** The share of ETo driven by dry, moving air, mm/day. */
  aerodynamicTermMm: number;
}

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Saturation vapour pressure at temperature `tC`, kPa (eq. 11).
 * FAO-56 Table 2.3: e0(20 degC) = 2.338 kPa, e0(25 degC) = 3.168 kPa.
 */
export function saturationVapourPressure(tC: number): number {
  return 0.6108 * Math.exp((17.27 * tC) / (tC + 237.3));
}

/**
 * Slope of the saturation vapour pressure curve at `tC`, kPa/degC (eq. 13).
 * FAO-56 Table 2.4: delta(25 degC) = 0.189 kPa/degC.
 */
export function slopeSaturationVapourPressure(tC: number): number {
  return (4098 * saturationVapourPressure(tC)) / (tC + 237.3) ** 2;
}

/** Atmospheric pressure at elevation `elevationM`, kPa (eq. 7). */
export function atmosphericPressure(elevationM: number): number {
  return 101.3 * ((293 - 0.0065 * elevationM) / 293) ** 5.26;
}

/** Psychrometric constant, kPa/degC (eq. 8). */
export function psychrometricConstant(elevationM: number): number {
  return 0.000665 * atmosphericPressure(elevationM);
}

/**
 * Extraterrestrial radiation for daily periods, MJ m^-2 day^-1 (eq. 21).
 * This is the astronomical ceiling on available energy: it depends only on
 * latitude and day of year, which is why a plan can be built for any future
 * date without a forecast of sunshine.
 */
export function extraterrestrialRadiation(latitudeDeg: number, dayOfYear: number): number {
  const phi = toRadians(latitudeDeg);
  // Inverse relative Earth-Sun distance (eq. 23).
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * dayOfYear) / 365);
  // Solar declination (eq. 24).
  const delta = 0.409 * Math.sin((2 * Math.PI * dayOfYear) / 365 - 1.39);

  // Sunset hour angle (eq. 25), guarded for polar day/night where |tan phi tan delta| > 1.
  const cosOmega = -Math.tan(phi) * Math.tan(delta);
  const omegaS = Math.acos(Math.min(1, Math.max(-1, cosOmega)));

  return (
    ((24 * 60) / Math.PI) *
    SOLAR_CONSTANT *
    dr *
    (omegaS * Math.sin(phi) * Math.sin(delta) +
      Math.cos(phi) * Math.cos(delta) * Math.sin(omegaS))
  );
}

/** Daylight hours (eq. 34) -- used to pick safe irrigation windows. */
export function daylightHours(latitudeDeg: number, dayOfYear: number): number {
  const phi = toRadians(latitudeDeg);
  const delta = 0.409 * Math.sin((2 * Math.PI * dayOfYear) / 365 - 1.39);
  const cosOmega = -Math.tan(phi) * Math.tan(delta);
  const omegaS = Math.acos(Math.min(1, Math.max(-1, cosOmega)));
  return (24 / Math.PI) * omegaS;
}

/**
 * Solar radiation estimated from the diurnal temperature range, MJ m^-2 day^-1 (eq. 50).
 * A wide Tmax-Tmin spread means clear skies; a narrow one means cloud.
 */
export function hargreavesSolarRadiation(
  ra: number,
  tmaxC: number,
  tminC: number,
  krs = 0.16
): number {
  return krs * Math.sqrt(Math.max(0, tmaxC - tminC)) * ra;
}

/** Adjust a wind speed measured at `heightM` to the 2 m standard, m/s (eq. 47). */
export function windSpeedAt2m(windSpeedMs: number, heightM: number): number {
  if (heightM === 2) return windSpeedMs;
  return windSpeedMs * (4.87 / Math.log(67.8 * heightM - 5.42));
}

/**
 * Full FAO-56 Penman-Monteith reference evapotranspiration (eq. 6), with the
 * intermediate terms exposed so the UI can explain *why* a day is thirsty.
 */
export function referenceEto(input: EtoInputs): EtoBreakdown {
  const {
    tmaxC,
    tminC,
    dewpointC,
    relativeHumidityPct,
    windSpeedMs,
    windMeasurementHeightM = 10,
    elevationM,
    latitudeDeg,
    dayOfYear,
    solarRadiationMj,
    krs = 0.16,
  } = input;

  const tmeanC = (tmaxC + tminC) / 2;

  // --- Vapour pressures -------------------------------------------------
  // es is the mean of the saturation pressures at Tmax and Tmin, not the
  // saturation pressure at Tmean: using Tmean underestimates es (FAO-56 eq. 12).
  const esKPa = (saturationVapourPressure(tmaxC) + saturationVapourPressure(tminC)) / 2;

  let eaKPa: number;
  if (dewpointC != null && Number.isFinite(dewpointC)) {
    eaKPa = saturationVapourPressure(dewpointC); // eq. 14
  } else if (relativeHumidityPct != null && Number.isFinite(relativeHumidityPct)) {
    eaKPa = (esKPa * relativeHumidityPct) / 100; // eq. 19
  } else {
    // Last resort (eq. 48): in arid climates Tmin approximates the dewpoint,
    // biased 2 degC low because the air rarely saturates overnight.
    eaKPa = saturationVapourPressure(tminC - 2);
  }
  // Actual vapour pressure cannot exceed saturation.
  eaKPa = Math.min(eaKPa, esKPa);
  const vpdKPa = Math.max(0, esKPa - eaKPa);

  // --- Radiation --------------------------------------------------------
  const raMj = extraterrestrialRadiation(latitudeDeg, dayOfYear);
  const rsoMj = (0.75 + 2e-5 * elevationM) * raMj; // eq. 37
  let rsMj =
    solarRadiationMj != null && Number.isFinite(solarRadiationMj)
      ? solarRadiationMj
      : hargreavesSolarRadiation(raMj, tmaxC, tminC, krs);
  // Incoming radiation can never beat a cloudless sky.
  rsMj = Math.min(rsMj, rsoMj);

  const rns = (1 - ALBEDO_REFERENCE_CROP) * rsMj; // eq. 38
  const tmaxK4 = (tmaxC + 273.16) ** 4;
  const tminK4 = (tminC + 273.16) ** 4;
  // Cloudiness factor, clamped to the validity range of eq. 39.
  const cloudiness = Math.min(1.0, Math.max(0.05, 1.35 * (rsMj / rsoMj) - 0.35));
  const rnl =
    STEFAN_BOLTZMANN *
    ((tmaxK4 + tminK4) / 2) *
    (0.34 - 0.14 * Math.sqrt(Math.max(0, eaKPa))) *
    cloudiness; // eq. 39
  const rnMj = rns - rnl; // eq. 40

  // --- Aerodynamic and psychrometric terms ------------------------------
  const u2Ms = Math.max(0.5, windSpeedAt2m(windSpeedMs, windMeasurementHeightM));
  const deltaKPaC = slopeSaturationVapourPressure(tmeanC);
  const gammaKPaC = psychrometricConstant(elevationM);

  // Soil heat flux is negligible over a day at this scale (eq. 42).
  const gMj = 0;

  const denominator = deltaKPaC + gammaKPaC * (1 + 0.34 * u2Ms);
  const radiationTermMm = (0.408 * deltaKPaC * (rnMj - gMj)) / denominator;
  const aerodynamicTermMm =
    (gammaKPaC * (900 / (tmeanC + 273)) * u2Ms * vpdKPa) / denominator;

  const etoMm = Math.max(0, radiationTermMm + aerodynamicTermMm);

  return {
    etoMm,
    raMj,
    rsMj,
    rsoMj,
    rnMj,
    esKPa,
    eaKPa,
    vpdKPa,
    deltaKPaC,
    gammaKPaC,
    u2Ms,
    radiationTermMm,
    aerodynamicTermMm,
  };
}

/** Convenience wrapper when only the ETo value is needed. */
export function referenceEtoMm(input: EtoInputs): number {
  return referenceEto(input).etoMm;
}
