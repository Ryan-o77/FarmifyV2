import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Farmify — irrigation planning for the San Joaquin Valley",
  description:
    "Turns Weather Underground history and FAO-56 crop water modelling into a specific irrigation schedule, in plain language, for every field on a farm.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="no-print border-b border-soil-100 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2">
              <span
                aria-hidden
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-leaf-600 text-lg text-white"
              >
                ~
              </span>
              <span className="text-lg font-bold tracking-tight text-soil-900">Farmify</span>
            </Link>
            <nav className="flex items-center gap-4 text-sm font-medium text-soil-600">
              <Link href="/" className="hover:text-leaf-700">
                Farms
              </Link>
              <Link href="/climate" className="hover:text-leaf-700">
                Climate data
              </Link>
              <Link href="/method" className="hover:text-leaf-700">
                How it works
              </Link>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>

        <footer className="no-print mt-12 border-t border-soil-100 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-6 text-xs leading-relaxed text-soil-600">
            <p>
              Weather history from{" "}
              <a
                className="underline hover:text-leaf-700"
                href="https://www.wunderground.com/history/monthly/us/ca/fresno"
                target="_blank"
                rel="noreferrer"
              >
                Weather Underground
              </a>
              . Crop water use follows FAO Irrigation &amp; Drainage Paper 56; reference
              evapotranspiration is calibrated against the CIMIS network.
            </p>
            <p className="mt-1">
              Farmify produces a starting point, not a prescription. Check your own soil and
              trees, and tell the app when it is wrong — that is how the plan improves.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
