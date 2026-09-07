import Link from "next/link";
import { FarmForm } from "@/components/FarmForm";
import { createFarmAction } from "@/app/actions";

export default function NewFarmPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/" className="text-sm text-soil-600 hover:text-leaf-700">
          ← Farms
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Add a farm</h1>
        <p className="mt-1 text-sm text-soil-600">
          A farm holds one or more fields. Each field is planned separately, because a plan is
          only as good as the crop, soil and system it is built for.
        </p>
      </div>
      <FarmForm action={createFarmAction} submitLabel="Create farm" cancelHref="/" />
    </div>
  );
}
