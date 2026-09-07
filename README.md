# Farmify

Irrigation planning for San Joaquin Valley farms, built from Weather Underground's
historical record and the FAO-56 crop water balance.

You describe a field — crop, soil, irrigation system, how many acres, which days you can
run water, and any limit on how much you may pump. Farmify returns a dated schedule that
says exactly when to open the valve, for how long, and how many gallons that is. The same
plan is then restated in plain language, in the language spoken on that farm, and printed
on one page you can tape inside a pump house.

## Why it works the way it does

A schedule is only useful if a grower can argue with it, so nothing here is a black box.
Every number traces to a published source, and `/method` in the running app explains each
step in the order the calculation makes them.

**Reference evapotranspiration** comes from the FAO-56 Penman-Monteith equation, driven by
the temperature, dew point and wind record at three first-order valley stations. Airport
stations sit over dry pavement rather than the irrigated grass that reference ET is defined
over, so running the equation on their observations overstates the answer by roughly 15%
here — and Fresno's winter tule fog defeats the temperature-range solar radiation estimate
entirely. Farmify computes the physics and then applies a monthly bias correction that ties
each station to the CIMIS reference network, so seasonal totals are locally right while
day-to-day movement still comes from the weather. The correction is visible per month on
the `/climate` page rather than buried.

**Crop water use** follows the FAO-56 single crop coefficient method across 18 valley
crops, with the coefficients California extension publishes for these plantings rather than
FAO's generic orchard entries, which assume smaller and less densely planted trees. Because
those values are already local, the eq. 62 wind and humidity adjustment is applied relative
to a typical valley mid-season rather than FAO's sub-humid reference — otherwise the
valley's aridity gets counted twice and water use inflates by about 10%.

**The schedule** comes from a daily soil water balance. Two separate limits decide when a
set is called: the agronomic one (readily available water, past which the crop closes
stomata) and the operational one (what the system can physically replace in the hours
available). A block whose reservoir holds 3 inches but whose sprinklers can only put on 1.3
inches a night has to be watered more often and lighter — waiting for the stress threshold
would open a deficit that can never be made up.

**Rationing** is where the interesting work is. When an allocation is smaller than the crop
wants, cutting evenly is the worst option: it spends the same water while taking the loss
during the weeks the crop can least afford it. Farmify puts the shortfall onto the growth
stages that tolerate stress, protects the ones that do not, and carries the ration as a
per-stage budget the scheduler draws down. That last part matters — applying a smaller
depth at each set saves nothing, because the soil simply crosses the trigger again sooner
and total delivery still tracks demand. Water is only saved by spending less of it. The
budget is paced against progress through each stage, so a short allocation produces an even
deficit rather than full watering until the money runs out and then nothing.

**The forecast** is a stochastic weather generator conditioned on each station's own
statistics: temperature anomalies follow an autoregressive process (warm spells persist),
rain occurrence is a two-state Markov chain constrained so that adding storm persistence
does not silently add rainfall to the climate, and amounts are gamma-distributed to
reproduce the skew a Mediterranean climate actually produces. Many members are simulated
and summarised into percentiles; the schedule is built on the median and the band on every
chart is the rest. A live forecast, where one is available, replaces the days it covers.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

```bash
npm test             # 67 tests
npm run typecheck
npm run build && npm start
```

The app seeds a worked example farm on first run, so there is something to look at
immediately. Data lives in `data/store/farms.json` — a single file you can copy, back up
and read without special software, which is more useful for a farm office than a database.

## Refreshing the weather record

The bundled dataset in `data/stations/san-joaquin-valley.json` holds monthly climatology
for Fresno (KFAT), Bakersfield (KBFL) and Modesto (KMOD), transcribed from the Weather
Underground monthly history tables, with the interannual dispersion statistics the forecast
generator needs. That is enough to run the whole application.

To pull the year-by-year observations down from the live history API:

```bash
WU_API_KEY=<your key> npm run data:refresh
WU_API_KEY=<your key> npm run data:refresh -- --years 30 --station KFAT
```

The script walks the API month by month, aggregates hourly observations the same way the
Wunderground table does, discards months missing more than a few days of record, and writes
the result into each station's `observedYears`. No key is committed to the repository.

## Getting a PDF

Open any field's plan and choose **Print / save PDF**, then "Save as PDF" in the browser's
print dialog. The print stylesheet is a first-class part of the app rather than an
afterthought: navigation disappears, no irrigation set is split across a page break, and
the sheet carries a blank column for the irrigator to mark how the ground looked — so the
plan comes back as the record of what was actually applied.

The printed page puts the instructions in the farm's language and repeats the technical
detail underneath in English, so the same sheet works for the person at the valve and for
the agronomist or water district checking the numbers.

## Languages

English, Spanish, Punjabi and Hmong — the languages actually spoken on valley farms. Every
string is a whole sentence rather than an assembled fragment, because word order differs
between these languages and a fragment that reads correctly in English becomes nonsense in
Punjabi. The simple summary contains no technical vocabulary at all: no evapotranspiration,
no depletion, just which day, what time, how long, and what to check afterwards.

## Feedback

The model is general; a particular block is not. Soil varies within a field, emitters put
out less than their catalogue rating after a decade in the ground, and the nearest station
may be fifteen miles away. Rather than ask anyone to calibrate something numerically,
Farmify asks a question you can answer by looking at the ground — was it too wet, too dry,
or about right — and moves two multipliers: one on crop water use, one on the system's
delivered rate. Runoff and system problems move the second without touching the first,
because that is a hardware fault, not a thirsty crop. Each report moves the numbers less
than the one before it, so an early observation shapes the plan quickly while one odd
report late in the season cannot undo a year of agreement.

## Layout

```
data/stations/     Weather Underground climate record, with provenance
scripts/           Refresh the record from the live history API
src/lib/climate/   Penman-Monteith ETo, station climatology, forecast generator
src/lib/agronomy/  Crop coefficients, soils, irrigation systems, water balance, rationing
src/lib/plan/      Plan engine, plain-language simplifier, translations
src/app/           Pages and server actions
tests/             FAO-56 validation and engine property tests
```

## What this is not

Farmify gives you a defensible starting point, not a prescription. It does not know that
the east end of your block always dries out first, that your pressure drops when the
neighbour is pumping, or that you lost a lateral last week. Check the ground, and tell the
app when it is wrong.

## Sources

- Allen, Pereira, Raes & Smith (1998). *Crop evapotranspiration — guidelines for computing
  crop water requirements.* FAO Irrigation and Drainage Paper 56.
- Doorenbos & Kassam (1979). *Yield response to water.* FAO Irrigation and Drainage Paper 33.
- [Weather Underground monthly history](https://www.wunderground.com/history/monthly/us/ca/fresno)
  for KFAT, KBFL and KMOD.
- California Irrigation Management Information System (CIMIS) reference ET zone normals.
- USDA-NRCS soil textural water-holding capacities; ASABE and NRCS irrigation guide
  efficiency and uniformity ranges.
