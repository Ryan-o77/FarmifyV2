import Link from "next/link";
import { CROPS } from "@/lib/agronomy/crops";
import { SOILS } from "@/lib/agronomy/soils";
import { SYSTEMS } from "@/lib/agronomy/systems";

export const dynamic = "force-static";

export default function MethodPage() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">How Farmify decides</h1>
        <p className="mt-1 max-w-3xl text-sm text-soil-600">
          Nothing here is a black box. A schedule that a grower cannot argue with is a schedule
          they will not follow, so every step is written down and every number can be traced to a
          published source.
        </p>
      </header>

      <Section
        n={1}
        title="How much water the air pulls out of the ground"
        body={
          <>
            <p>
              The starting point is <strong>reference evapotranspiration</strong>: how much water
              a well-watered field of short grass would lose in a day. It is computed with the
              FAO-56 Penman-Monteith equation from temperature, dew point, wind and the solar
              radiation implied by the day&apos;s temperature range and the site&apos;s latitude.
            </p>
            <p>
              Airport weather stations sit over dry pavement, not irrigated grass, so running the
              equation on their observations overstates the answer — by about 15% here. Farmify
              corrects for that with a monthly factor that ties each station&apos;s output to the{" "}
              <Link href="/climate/" className="underline hover:text-leaf-700">
                CIMIS reference network
              </Link>
              , so seasonal totals are locally right while day-to-day movement still comes from
              the physics.
            </p>
          </>
        }
      />

      <Section
        n={2}
        title="How much of that your crop actually uses"
        body={
          <>
            <p>
              Reference ET is multiplied by a <strong>crop coefficient</strong> that traces the
              season: low at leaf-out, rising as the canopy fills, flat through peak growth, then
              falling toward harvest or leaf drop. Coefficients follow FAO-56, using the values
              California extension publishes for valley plantings, and are adjusted for how windy
              and dry the site is relative to a typical valley mid-season.
            </p>
            <p>
              A young orchard is scaled down for the light its canopy has not grown into yet, and
              alfalfa drops after each cutting and recovers as the stand regrows.
            </p>
            <p className="text-soil-600">
              {CROPS.length} crops are modelled, from almonds to lettuce.
            </p>
          </>
        }
      />

      <Section
        n={3}
        title="How much your soil can hold"
        body={
          <>
            <p>
              The soil is the reservoir. Its texture sets how many inches of usable water each
              foot of root zone holds, and the crop&apos;s tolerance sets how much of that can be
              spent before the plant starts closing stomata and losing yield. That threshold is
              what decides the interval between irrigations — not a fixed number of days.
            </p>
            <p>
              A hardpan matters more than most growers&apos; plans admit: roots cannot use water
              they cannot reach, so entering a restrictive layer depth can halve the reservoir and
              double the watering frequency.
            </p>
            <p className="text-soil-600">
              {SOILS.length} soil classes, each with a hand test you can do in the field.
            </p>
          </>
        }
      />

      <Section
        n={4}
        title="How long to leave the water on"
        body={
          <>
            <p>
              The depth the crop needs is divided by the rate your system applies water, which
              gives run time in hours. That depth is grossed up for the water that never reaches
              the roots — evaporation, wind drift, runoff, and the fact that the driest quarter of
              a field always gets less than the average.
            </p>
            <p>
              If the system puts water on faster than the ground can take it, the set is split
              into cycles with a soak between them, because water that runs off the end of a row
              was pumped for nothing.
            </p>
            <p className="text-soil-600">
              {SYSTEMS.length} system types, from buried drip to border flood.
            </p>
          </>
        }
      />

      <Section
        n={5}
        title="What the weather will do next"
        body={
          <>
            <p>
              A plan has to commit to days that have not happened, so Farmify predicts a range
              rather than a single number. It simulates many versions of the coming season from
              the station&apos;s own statistics: warm spells persist rather than resetting each
              day, storms arrive in sequences, and rainfall amounts follow the strongly skewed
              distribution a Mediterranean climate actually produces.
            </p>
            <p>
              The schedule is built on the middle of that range; the band on every chart is the
              rest of it. Where a live forecast is available it replaces the simulated days it
              covers.
            </p>
          </>
        }
      />

      <Section
        n={6}
        title="What to do when there is not enough water"
        body={
          <>
            <p>
              When an allocation is smaller than the crop wants, the question is not whether to
              cut but where. Cutting evenly is the worst option: it spends the same water while
              taking the loss during the weeks the crop can least afford it.
            </p>
            <p>
              Farmify puts the shortfall onto the growth stages that tolerate stress and protects
              the ones that do not, then carries the ration as a budget the scheduler draws down
              so the season genuinely fits inside the cap. The estimated yield uses the FAO-33
              yield response relation applied stage by stage.
            </p>
          </>
        }
      />

      <Section
        n={7}
        title="How your field corrects the model"
        body={
          <>
            <p>
              The model is general; your block is not. After a set, you say whether the ground was
              too wet, too dry or about right. Too dry raises this field&apos;s water use and
              lengthens its sets; runoff or a system problem tells Farmify the hardware is
              delivering less than its rating.
            </p>
            <p>
              Each report moves the numbers less than the one before it, so an early observation
              shapes the plan quickly while a single odd report late in the season does not undo a
              year of agreement.
            </p>
          </>
        }
      />

      <section className="card p-6">
        <h2 className="text-lg font-semibold">Sources</h2>
        <ul className="mt-3 space-y-2 text-sm text-soil-600">
          <li>
            Allen, Pereira, Raes &amp; Smith (1998).{" "}
            <em>Crop evapotranspiration — guidelines for computing crop water requirements.</em>{" "}
            FAO Irrigation and Drainage Paper 56. Reference ET, crop coefficients, the soil water
            balance and the stress function.
          </li>
          <li>
            Doorenbos &amp; Kassam (1979). <em>Yield response to water.</em> FAO Irrigation and
            Drainage Paper 33. Yield response factors used for the rationing estimate.
          </li>
          <li>
            Weather Underground monthly history for KFAT, KBFL and KMOD. The temperature, dew
            point, wind and rainfall record behind every calculation.
          </li>
          <li>
            California Irrigation Management Information System (CIMIS). Reference ET zone normals
            used to bias-correct the station data.
          </li>
          <li>
            USDA-NRCS soil textural water-holding capacities; ASABE and NRCS irrigation guide
            efficiency and uniformity ranges.
          </li>
        </ul>
        <p className="mt-4 rounded-lg bg-alert-50 p-3 text-sm text-soil-900">
          Farmify gives you a defensible starting point, not a prescription. Soil varies within a
          field, emitters wear, and the nearest station may be miles away. Check the ground, and
          tell the app when it is wrong.
        </p>
      </section>
    </div>
  );
}

function Section({ n, title, body }: { n: number; title: string; body: React.ReactNode }) {
  return (
    <section className="card p-6">
      <div className="flex items-start gap-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-leaf-600 font-bold text-white">
          {n}
        </span>
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <div className="mt-2 space-y-2 text-sm leading-relaxed">{body}</div>
        </div>
      </div>
    </section>
  );
}
