import Link from "next/link";
import { notFound } from "next/navigation";
import { FieldForm } from "@/components/FieldForm";
import { getField } from "@/lib/store";
import { saveFieldAction, deleteFieldAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function EditFieldPage({
  params,
}: {
  params: Promise<{ farmId: string; fieldId: string }>;
}) {
  const { farmId, fieldId } = await params;
  const found = await getField(farmId, fieldId);
  if (!found) notFound();

  const save = saveFieldAction.bind(null, farmId);
  const remove = deleteFieldAction.bind(null, farmId, fieldId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={`/farms/${farmId}/fields/${fieldId}`}
          className="text-sm text-soil-600 hover:text-leaf-700"
        >
          ← {found.field.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Edit field</h1>
        <p className="mt-1 text-sm text-soil-600">
          Changing anything here rebuilds the schedule. What Farmify has learned from your
          feedback on this field is kept.
        </p>
      </div>

      <FieldForm
        farmId={farmId}
        field={found.field}
        action={save}
        submitLabel="Save and rebuild plan"
      />

      <form action={remove} className="card border-red-200 p-6">
        <h2 className="text-sm font-semibold text-red-700">Delete this field</h2>
        <p className="mt-1 text-sm text-soil-600">
          Removes the field and its feedback history. This cannot be undone.
        </p>
        <button
          type="submit"
          className="btn mt-4 border border-red-300 bg-white text-red-700 hover:bg-red-50 focus:ring-red-500"
        >
          Delete field
        </button>
      </form>
    </div>
  );
}
