/**
 * Turning an irrigation plan into instructions anyone can act on.
 *
 * The detailed plan is correct but unreadable if you are not an agronomist: it
 * talks about depletion fractions, crop coefficients and gross application
 * depths. What a person standing at a valve needs is four things -- which day,
 * what time, how long, and what to look for afterwards.
 *
 * This module produces that, at a deliberately low reading level, with numbers
 * rounded to what a person can actually act on. Nobody sets a valve to 7.43
 * hours, so the plan says 7 hours 30 minutes. Nobody can measure 1.34 inches of
 * water, so the plan leads with hours and gallons.
 */

import type { FieldPlan, IrrigationEvent, Language, WeekPlan } from "../types";
import { t, translator, type MessageKey } from "./i18n";

export interface SimpleStep {
  /** ISO date. */
  date: string;
  /** Translated weekday name -- the thing a person actually navigates by. */
  weekdayName: string;
  /** True when nothing is scheduled that day. */
  rest: boolean;
  /** "05:30" in 24h, plus a friendlier rendering. */
  startTime: string;
  startTimeLabel: string;
  /** "7 hours 30 minutes", already translated. */
  durationLabel: string;
  durationHours: number;
  /** Rounded volume, e.g. "1,480,000 gallons". */
  gallonsLabel: string;
  gallons: number;
  /** Depth applied, inches. */
  inches: number;
  /** Present when the set must be broken into cycles. */
  cycleNote?: string;
  /** One short sentence on why this day. */
  why: string;
}

export interface SimpleSummary {
  language: Language;
  weekStart: string;
  weekEnd: string;
  headline: string;
  steps: SimpleStep[];
  weatherLine: string;
  rainLine: string;
  totalLine: string;
  checkLine: string;
  watchLines: string[];
  feedbackAsk: string;
  limitLine?: string;
}

/** Round a duration to the nearest five minutes: the finest setting anyone uses. */
export function roundDuration(hours: number): { hours: number; minutes: number } {
  const totalMinutes = Math.max(5, Math.round((hours * 60) / 5) * 5);
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

function durationLabel(language: Language, hours: number): string {
  const { hours: h, minutes: m } = roundDuration(hours);
  const hourWord = t(language, "plan.hours");
  const minuteWord = t(language, "plan.minutes");
  if (h === 0) return `${m} ${minuteWord}`;
  if (m === 0) return `${h} ${hourWord}`;
  return `${h} ${hourWord} ${m} ${minuteWord}`;
}

/** 24-hour clock is unambiguous across all four languages; add am/pm for English. */
function timeLabel(language: Language, hhmm: string): string {
  if (language !== "en") return hhmm;
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Round volumes to something a person can hold in their head. */
export function roundGallons(gallons: number): number {
  if (gallons >= 100_000) return Math.round(gallons / 10_000) * 10_000;
  if (gallons >= 10_000) return Math.round(gallons / 1_000) * 1_000;
  if (gallons >= 1_000) return Math.round(gallons / 100) * 100;
  return Math.round(gallons / 10) * 10;
}

function gallonsLabel(language: Language, gallons: number): string {
  return `${roundGallons(gallons).toLocaleString("en-US")} ${t(language, "plan.gallons")}`;
}

function weekdayName(language: Language, isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return t(language, `weekday.${dow}` as MessageKey);
}

/**
 * A short, concrete reason for each set, written without jargon.
 *
 * The technical reason string on the event mentions depletion percentages; this
 * reduces it to the two facts that change a person's behaviour: how hot it will
 * be, and how long until the next watering.
 */
function simpleWhy(
  language: Language,
  event: IrrigationEvent,
  nextEventDate: string | null
): string {
  const gapDays = nextEventDate
    ? Math.round(
        (Date.parse(`${nextEventDate}T00:00:00Z`) - Date.parse(`${event.date}T00:00:00Z`)) /
          86_400_000
      )
    : null;

  switch (language) {
    case "es":
      return gapDays
        ? `La tierra ya uso la mayor parte de su agua. El siguiente riego es en ${gapDays} dias.`
        : "La tierra ya uso la mayor parte de su agua.";
    case "pa":
      return gapDays
        ? `ਮਿੱਟੀ ਦਾ ਬਹੁਤਾ ਪਾਣੀ ਮੁੱਕ ਗਿਆ ਹੈ। ਅਗਲੀ ਵਾਰ ${gapDays} ਦਿਨਾਂ ਬਾਅਦ ਪਾਣੀ ਲਾਉਣਾ ਹੈ।`
        : "ਮਿੱਟੀ ਦਾ ਬਹੁਤਾ ਪਾਣੀ ਮੁੱਕ ਗਿਆ ਹੈ।";
    case "hmn":
      return gapDays
        ? `Cov av siv nws cov dej lawm. Zaum tom ntej yog ${gapDays} hnub tom ntej.`
        : "Cov av siv nws cov dej lawm.";
    default:
      return gapDays
        ? `The soil has used most of its water. The next watering is in ${gapDays} days.`
        : "The soil has used most of its water.";
  }
}

function totalLine(language: Language, gallons: number, inches: number): string {
  const g = gallonsLabel(language, gallons);
  const inchText = `${inches.toFixed(1)} ${t(language, "plan.inches")}`;
  switch (language) {
    case "es":
      return `Agua total esta semana: ${g} (${inchText}).`;
    case "pa":
      return `ਇਸ ਹਫ਼ਤੇ ਦਾ ਕੁੱਲ ਪਾਣੀ: ${g} (${inchText})।`;
    case "hmn":
      return `Tag nrho cov dej lub lim tiam no: ${g} (${inchText}).`;
    default:
      return `Total water this week: ${g} (${inchText}).`;
  }
}

function headline(language: Language, count: number): string {
  if (count === 0) return t(language, "plan.noWaterThisWeek");
  switch (language) {
    case "es":
      return count === 1 ? "Riegue 1 vez esta semana." : `Riegue ${count} veces esta semana.`;
    case "pa":
      return `ਇਸ ਹਫ਼ਤੇ ${count} ਵਾਰ ਪਾਣੀ ਲਾਓ।`;
    case "hmn":
      return `Ywg dej ${count} zaug lub lim tiam no.`;
    default:
      return count === 1 ? "Water 1 time this week." : `Water ${count} times this week.`;
  }
}

function cycleNote(language: Language, event: IrrigationEvent): string | undefined {
  if (event.cycles.length <= 1) return undefined;
  const each = durationLabel(language, event.cycles[0].durationHours);
  const wait = `${event.soakMinutesBetweenCycles} ${t(language, "plan.minutes")}`;
  switch (language) {
    case "es":
      return `Divida en ${event.cycles.length} riegos de ${each}, con ${wait} de espera entre cada uno.`;
    case "pa":
      return `${event.cycles.length} ਵਾਰੀਆਂ ਵਿੱਚ ਵੰਡੋ, ਹਰ ਵਾਰੀ ${each}, ਅਤੇ ਵਿਚਕਾਰ ${wait} ਰੁਕੋ।`;
    case "hmn":
      return `Faib ua ${event.cycles.length} zaug, ib zaug ${each}, tos ${wait} ntawm txhua zaug.`;
    default:
      return `Split into ${event.cycles.length} runs of ${each}, waiting ${wait} between each one.`;
  }
}

/**
 * Build the simple weekly summary for one field.
 */
export function simplifyWeek(
  plan: FieldPlan,
  week: WeekPlan,
  language: Language
): SimpleSummary {
  const tr = translator(language);

  const steps: SimpleStep[] = week.events.map((event, idx) => {
    const next = week.events[idx + 1]?.date ?? null;
    return {
      date: event.date,
      weekdayName: weekdayName(language, event.date),
      rest: false,
      startTime: event.startTime,
      startTimeLabel: timeLabel(language, event.startTime),
      durationLabel: durationLabel(language, event.durationHours),
      durationHours: event.durationHours,
      gallonsLabel: gallonsLabel(language, event.gallons),
      gallons: event.gallons,
      inches: event.grossDepthIn,
      cycleNote: cycleNote(language, event),
      why: simpleWhy(language, event, next),
    };
  });

  const hot = week.peakTempF >= 95;
  const rainy = week.rainChance >= 0.35;

  return {
    language,
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
    headline: headline(language, week.events.length),
    steps,
    weatherLine: hot ? tr("plan.hotWeek") : tr("plan.mildWeek"),
    rainLine: rainy ? tr("plan.rainLikely") : tr("plan.rainUnlikely"),
    totalLine: totalLine(language, week.totalGallons, week.totalGrossInches),
    checkLine: tr("plan.checkSoil"),
    watchLines: [tr("plan.watchFor.tooWet"), tr("plan.watchFor.tooDry")],
    feedbackAsk: tr("plan.feedbackAsk"),
    limitLine: plan.deficit.applied ? tr("plan.waterLimitOn") : undefined,
  };
}

/**
 * The one-line answer to "what do I do today?" -- used on the home screen.
 */
export function todayLine(
  plan: FieldPlan,
  isoDate: string,
  language: Language
): { water: boolean; text: string } {
  const event = plan.events.find((e) => e.date === isoDate);
  if (!event) {
    return { water: false, text: t(language, "plan.restDay") };
  }
  const time = timeLabel(language, event.startTime);
  const dur = durationLabel(language, event.durationHours);
  switch (language) {
    case "es":
      return { water: true, text: `Riegue a las ${time} por ${dur}.` };
    case "pa":
      return { water: true, text: `${time} ਵਜੇ ${dur} ਲਈ ਪਾਣੀ ਲਾਓ।` };
    case "hmn":
      return { water: true, text: `Ywg dej thaum ${time} ntev ${dur}.` };
    default:
      return { water: true, text: `Water at ${time} for ${dur}.` };
  }
}
