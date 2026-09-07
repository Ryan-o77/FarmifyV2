import Link from "next/link";
import { stations } from "@/lib/climate/station";
import { LANGUAGES, type Farm } from "@/lib/types";

export function FarmForm({
  farm,
  action,
  submitLabel,
  cancelHref,
}: {
  farm?: Farm;
  action: (form: FormData) => Promise<void>;
  submitLabel: string;
  cancelHref: string;
}) {
  return (
    <form action={action} className="card space-y-5 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">
            Farm name
          </label>
          <input
            id="name"
            name="name"
            className="input"
            defaultValue={farm?.name}
            placeholder="Sanchez Family Ranch"
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="farmerName">
            Grower
          </label>
          <input
            id="farmerName"
            name="farmerName"
            className="input"
            defaultValue={farm?.farmerName}
            placeholder="Maria Sanchez"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="language">
            Language for the simple plan
          </label>
          <select
            id="language"
            name="language"
            className="select"
            defaultValue={farm?.language ?? "en"}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.endonym} ({l.label})
              </option>
            ))}
          </select>
          <p className="hint">
            The detailed plan stays in English; the printable summary the crew reads uses this
            language.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="stationId">
            Nearest weather station
          </label>
          <select
            id="stationId"
            name="stationId"
            className="select"
            defaultValue={farm?.stationId ?? "KFAT"}
          >
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id} — {s.name}
              </option>
            ))}
          </select>
          <p className="hint">Weather history and evapotranspiration come from this station.</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary">
          {submitLabel}
        </button>
        <Link href={cancelHref} className="btn-secondary">
          Cancel
        </Link>
      </div>
    </form>
  );
}
