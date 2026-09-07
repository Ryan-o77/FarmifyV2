import Link from "next/link";
import { notFound } from "next/navigation";
import { FarmForm } from "@/components/FarmForm";
import { getFarm } from "@/lib/store";
import { updateFarmAction, deleteFarmAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function EditFarmPage({
  params,
}: {
  params: Promise<{ farmId: string }>;
}) {
  const { farmId } = await params;
  const farm = await getFarm(farmId);
  if (!farm) notFound();

  const update = updateFarmAction.bind(null, farmId);
  const remove = deleteFarmAction.bind(null, farmId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/farms/${farmId}`} className="text-sm text-soil-600 hover:text-leaf-700">
          ← {farm.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Farm settings</h1>
      </div>

      <FarmForm
        farm={farm}
        action={update}
        submitLabel="Save changes"
        cancelHref={`/farms/${farmId}`}
      />

      <form action={remove} className="card border-red-200 p-6">
        <h2 className="text-sm font-semibold text-red-700">Delete this farm</h2>
        <p className="mt-1 text-sm text-soil-600">
          Removes the farm, its {farm.fields.length} field
          {farm.fields.length === 1 ? "" : "s"} and all feedback recorded against them. This
          cannot be undone.
        </p>
        <button
          type="submit"
          className="btn mt-4 border border-red-300 bg-white text-red-700 hover:bg-red-50 focus:ring-red-500"
        >
          Delete farm
        </button>
      </form>
    </div>
  );
}
