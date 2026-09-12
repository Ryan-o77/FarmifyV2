"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FieldForm } from "@/components/FieldForm";
import { Loading, NotFoundCard } from "@/components/Loading";
import { useStore } from "@/lib/useStore";
import { upsertField, deleteField } from "@/lib/clientStore";

export default function FieldSettingsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <FieldSettings />
    </Suspense>
  );
}

function FieldSettings() {
  const params = useSearchParams();
  const router = useRouter();
  const farmId = params.get("farm") ?? "";
  const fieldId = params.get("id");
  const { store, ready } = useStore();

  if (!ready) return <Loading />;

  const farm = store?.farms.find((f) => f.id === farmId) ?? null;
  if (!farm) return <NotFoundCard what="farm" />;

  const field = fieldId ? (farm.fields.find((f) => f.id === fieldId) ?? null) : null;
  if (fieldId && !field) return <NotFoundCard what="field" backHref={`/farm/?id=${farm.id}`} backLabel="Back to farm" />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={field ? `/field/?farm=${farm.id}&id=${field.id}` : `/farm/?id=${farm.id}`}
          className="text-sm text-soil-600 hover:text-leaf-700"
        >
          ← {field ? field.name : farm.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          {field ? "Edit field" : "Add a field"}
        </h1>
        {field ? (
          <p className="mt-1 text-sm text-soil-600">
            Changing anything here rebuilds the schedule. What Farmify has learned from your
            feedback on this field is kept.
          </p>
        ) : null}
      </div>

      <FieldForm
        farmId={farm.id}
        field={field ?? undefined}
        submitLabel={field ? "Save and rebuild plan" : "Create field and build plan"}
        onSave={(input) => {
          const saved = upsertField(farm.id, input);
          router.push(
            saved ? `/field/?farm=${farm.id}&id=${saved.id}` : `/farm/?id=${farm.id}`
          );
        }}
      />

      {field ? (
        <div className="card border-red-200 p-6">
          <h2 className="text-sm font-semibold text-red-700">Delete this field</h2>
          <p className="mt-1 text-sm text-soil-600">
            Removes the field and its feedback history. This cannot be undone.
          </p>
          <button
            type="button"
            className="btn mt-4 border border-red-300 bg-white text-red-700 hover:bg-red-50 focus:ring-red-500"
            onClick={() => {
              if (!confirm(`Delete ${field.name}?`)) return;
              deleteField(farm.id, field.id);
              router.push(`/farm/?id=${farm.id}`);
            }}
          >
            Delete field
          </button>
        </div>
      ) : null}
    </div>
  );
}
