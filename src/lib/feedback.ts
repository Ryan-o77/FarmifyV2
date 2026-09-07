/**
 * Turning what a grower observes into a correction to the model.
 *
 * The model is a general one; a particular block is not. Soil varies within a
 * field, emitters put out less than their catalogue rating after a decade in the
 * ground, canopies differ, and the nearest weather station may be fifteen miles
 * away. Rather than ask a grower to calibrate anything numerically, the app asks
 * a question anyone can answer -- was the ground too wet, too dry, or about right
 * a day or two after watering -- and moves two multipliers accordingly.
 *
 *   demandFactor      scales crop water use. Raised when the block dries out
 *                     faster than predicted.
 *   applicationFactor scales the system's delivered rate. Lowered when a set that
 *                     should have wetted the profile did not, which points at the
 *                     hardware rather than the crop.
 *
 * Updates are exponentially smoothed and the step size shrinks as observations
 * accumulate, so an early report moves the plan noticeably while a single odd
 * report much later does not undo a season of agreement.
 */

import type { Calibration, Feedback, FeedbackKind } from "./types";
import { clamp } from "./units";

const MIN_FACTOR = 0.6;
const MAX_FACTOR = 1.6;

/** How hard each kind of report pushes, before the confidence-based damping. */
const RESPONSE: Record<FeedbackKind, { demand: number; application: number; note: string }> = {
  "too-wet": {
    demand: -0.1,
    application: 0.06,
    note: "Water use lowered and the system credited with delivering slightly more than rated.",
  },
  "too-dry": {
    demand: 0.1,
    application: -0.06,
    note: "Water use raised and the system assumed to deliver slightly less than rated.",
  },
  "just-right": {
    demand: 0,
    application: 0,
    note: "Current settings confirmed; confidence in the plan increased.",
  },
  runoff: {
    // Water standing or running off means it went on faster than the ground could
    // take it, so less of it was stored than the schedule assumed.
    demand: 0,
    application: -0.12,
    note: "Effective delivery reduced: water applied faster than the soil accepted it.",
  },
  "cannot-run-schedule": {
    demand: 0,
    application: 0,
    note: "No change to the water model -- adjust the field's irrigation days or hours instead.",
  },
  "system-problem": {
    demand: 0,
    application: -0.15,
    note: "Delivered rate reduced to reflect a system that is not putting out its rated flow.",
  },
};

export function applyFeedback(
  calibration: Calibration,
  kind: FeedbackKind
): { calibration: Calibration; note: string } {
  const response = RESPONSE[kind];
  // Each successive report moves the factors less than the one before it.
  const damping = 1 / (1 + calibration.observations * 0.35);

  const demandFactor = clamp(
    calibration.demandFactor * (1 + response.demand * damping),
    MIN_FACTOR,
    MAX_FACTOR
  );
  const applicationFactor = clamp(
    calibration.applicationFactor * (1 + response.application * damping),
    MIN_FACTOR,
    MAX_FACTOR
  );

  return {
    calibration: {
      demandFactor,
      applicationFactor,
      observations: calibration.observations + 1,
      updatedAt: new Date().toISOString(),
    },
    note: response.note,
  };
}

/** A plain sentence describing what the accumulated calibration is doing. */
export function describeCalibration(calibration: Calibration, language = "en"): string {
  const demandPct = Math.round((calibration.demandFactor - 1) * 100);
  const appPct = Math.round((calibration.applicationFactor - 1) * 100);

  if (calibration.observations === 0) {
    return language === "es"
      ? "Aun no hay comentarios. El plan usa los valores estandar."
      : "No feedback yet. The plan uses standard values for this crop and soil.";
  }

  const parts: string[] = [];
  if (Math.abs(demandPct) >= 2) {
    parts.push(
      demandPct > 0
        ? `watering ${demandPct}% more than the book value, because you reported this block drying out faster than expected`
        : `watering ${Math.abs(demandPct)}% less than the book value, because you reported this block staying wet`
    );
  }
  if (Math.abs(appPct) >= 2) {
    parts.push(
      appPct < 0
        ? `running sets ${Math.abs(appPct)}% longer, because your system appears to deliver less than its rated flow`
        : `running sets ${appPct}% shorter, because your system appears to deliver more than its rated flow`
    );
  }

  if (parts.length === 0) {
    return `${calibration.observations} report${calibration.observations === 1 ? "" : "s"} received; the standard values are working for this block.`;
  }
  return `Based on ${calibration.observations} report${calibration.observations === 1 ? "" : "s"}, Farmify is ${parts.join(", and ")}.`;
}

export function summariseFeedbackHistory(history: Feedback[]): Record<FeedbackKind, number> {
  const counts = {
    "too-wet": 0,
    "too-dry": 0,
    "just-right": 0,
    runoff: 0,
    "cannot-run-schedule": 0,
    "system-problem": 0,
  } as Record<FeedbackKind, number>;
  for (const f of history) counts[f.kind] = (counts[f.kind] ?? 0) + 1;
  return counts;
}
