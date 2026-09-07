import Link from "next/link";
import { notFound } from "next/navigation";
import { FieldForm } from "@/components/FieldForm";
import { getFarm } from "@/lib/store";
import { saveFieldAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function NewFieldPage({
  params,
}: {
  params: Promise<{ farmId: string }>;
}) {
  const { farmId } = await params;
  const farm = await getFarm(farmId);
  if (!farm) notFound();

  const save = saveFieldAction.bind(null, farmId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/farms/${farmId}`} className="text-sm text-soil-600 hover:text-leaf-700">
          ← {farm.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Add a field</h1>
      </div>
      <FieldForm farmId={farmId} action={save} submitLabel="Create field and build plan" />
    </div>
  );
}
