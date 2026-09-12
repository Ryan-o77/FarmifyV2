import Link from "next/link";

/** Shown for the moment between the static HTML arriving and the browser store loading. */
export function Loading({ label = "Loading your farms…" }: { label?: string }) {
  return (
    <div className="card p-10 text-center">
      <p className="text-sm text-soil-600">{label}</p>
    </div>
  );
}

/** Shown when a URL points at a farm or field this browser does not have. */
export function NotFoundCard({
  what,
  backHref = "/",
  backLabel = "Back to farms",
}: {
  what: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="card p-10 text-center">
      <h1 className="text-lg font-semibold">That {what} is not in this browser</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-soil-600">
        Farmify keeps every workspace in the browser it was created in, so a link shared from
        another device will not find it here. Create it again, or restore a backup from the
        home page.
      </p>
      <Link href={backHref} className="btn-primary mt-5">
        {backLabel}
      </Link>
    </div>
  );
}
