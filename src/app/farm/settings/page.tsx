"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FarmForm } from "@/components/FarmForm";
import { Loading, NotFoundCard } from "@/components/Loading";
import { useStore } from "@/lib/useStore";
import { createFarm, updateFarm, deleteFarm } from "@/lib/clientStore";

export default function FarmSettingsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <FarmSettings />
    </Suspense>
  );
}

function FarmSettings() {
  const params = useSearchParams();
  const router = useRouter();
  const farmId = params.get("id");
  const { store, ready } = useStore();

  if (!ready) return <Loading />;

  const farm = farmId ? (store?.farms.find((f) => f.id === farmId) ?? null) : null;
  if (farmId && !farm) return <NotFoundCard what="farm" />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={farm ? `/farm/?id=${farm.id}` : "/"}
          className="text-sm text-soil-600 hover:text-leaf-700"
        >
          ← {farm ? farm.name : "Farms"}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          {farm ? "Farm settings" : "Add a farm"}
        </h1>
        {!farm ? (
          <p className="mt-1 text-sm text-soil-600">
            A farm holds one or more fields. Each field is planned separately, because a plan
            is only as good as the crop, soil and system it is built for.
          </p>
        ) : null}
      </div>

      <FarmForm
        farm={farm ?? undefined}
        submitLabel={farm ? "Save changes" : "Create farm"}
        cancelHref={farm ? `/farm/?id=${farm.id}` : "/"}
        onSave={(input) => {
          if (farm) {
            updateFarm(farm.id, input);
            router.push(`/farm/?id=${farm.id}`);
          } else {
            const created = createFarm(input);
            router.push(`/farm/?id=${created.id}`);
          }
        }}
      />

      {farm ? (
        <div className="card border-red-200 p-6">
          <h2 className="text-sm font-semibold text-red-700">Delete this farm</h2>
          <p className="mt-1 text-sm text-soil-600">
            Removes the farm, its {farm.fields.length} field
            {farm.fields.length === 1 ? "" : "s"} and all feedback recorded against them. This
            cannot be undone.
          </p>
          <button
            type="button"
            className="btn mt-4 border border-red-300 bg-white text-red-700 hover:bg-red-50 focus:ring-red-500"
            onClick={() => {
              if (!confirm(`Delete ${farm.name} and all of its fields?`)) return;
              deleteFarm(farm.id);
              router.push("/");
            }}
          >
            Delete farm
          </button>
        </div>
      ) : null}
    </div>
  );
}
