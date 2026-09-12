"use client";

import { t } from "@/lib/plan/i18n";
import type { FeedbackKind, Language } from "@/lib/types";

const OPTIONS: { kind: FeedbackKind; key: string; hint: string }[] = [
  {
    kind: "too-wet",
    key: "feedback.tooWet",
    hint: "Still soggy a day or two after the set, or water sitting on the surface.",
  },
  {
    kind: "too-dry",
    key: "feedback.tooDry",
    hint: "Dry a hand's depth down before the next watering, or leaves curling in the afternoon.",
  },
  { kind: "just-right", key: "feedback.justRight", hint: "Damp, crumbly, neither muddy nor dusty." },
  { kind: "runoff", key: "feedback.runoff", hint: "Water ran off the end of the row or ponded." },
  {
    kind: "cannot-run-schedule",
    key: "feedback.cannotRun",
    hint: "The days or hours in the plan do not work for this field.",
  },
  {
    kind: "system-problem",
    key: "feedback.systemProblem",
    hint: "Plugged emitters, a leak, or low pressure.",
  },
];

/**
 * The feedback control.
 *
 * Six buttons, no numbers to enter. Each one is something a person can judge by
 * looking at the ground, which is the only way this gets used often enough to be
 * worth anything.
 */
export function FeedbackForm({
  language,
  onSubmit,
}: {
  language: Language;
  onSubmit: (kind: FeedbackKind, date: string, comment?: string) => void;
}) {
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const kind = (data.get("kind") as FeedbackKind) ?? "just-right";
        const date = (data.get("date") as string) || todayIso;
        const comment = ((data.get("comment") as string) || "").trim();
        onSubmit(kind, date, comment || undefined);
        event.currentTarget.reset();
      }}
      className="space-y-4"
    >
      <fieldset>
        <legend className="label">What did the ground look like?</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {OPTIONS.map((option, idx) => (
            <label
              key={option.kind}
              className="flex cursor-pointer gap-3 rounded-lg border border-soil-100 bg-white p-3 transition hover:border-leaf-500 hover:bg-leaf-50"
            >
              <input
                type="radio"
                name="kind"
                value={option.kind}
                defaultChecked={idx === 2}
                className="mt-1 h-4 w-4 border-soil-100 text-leaf-600 focus:ring-leaf-500"
              />
              <span>
                <span className="block text-sm font-semibold" lang={language}>
                  {t(language, option.key as never)}
                </span>
                <span className="block text-xs text-soil-600">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="date">
            Date you looked
          </label>
          <input id="date" name="date" type="date" className="input" defaultValue={todayIso} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="comment">
            Anything else (optional)
          </label>
          <input
            id="comment"
            name="comment"
            className="input"
            placeholder="East end always dries out first"
          />
        </div>
      </div>

      <button type="submit" className="btn-primary">
        Send report and update the plan
      </button>
    </form>
  );
}
