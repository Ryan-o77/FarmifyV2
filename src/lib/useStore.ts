"use client";

/**
 * Reading the browser store from React.
 *
 * The store cannot be touched while the page is being prerendered into static
 * HTML -- there is no `window` then -- so every page loads it in an effect and
 * shows a brief placeholder first. That is also what keeps the server-rendered
 * markup and the first client render identical, which is the thing React
 * complains about if you get it wrong.
 */

import { useCallback, useEffect, useState } from "react";
import { loadStore, type StoreShape } from "./clientStore";

export function useStore(): {
  store: StoreShape | null;
  ready: boolean;
  refresh: () => void;
} {
  const [store, setStore] = useState<StoreShape | null>(null);

  const refresh = useCallback(() => {
    setStore(loadStore());
  }, []);

  useEffect(() => {
    refresh();
    // A second tab editing the same workspace should not leave this one stale.
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === "farmify.store.v1") refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh]);

  return { store, ready: store !== null, refresh };
}

/** Today's date, resolved on the client so the plan matches the visitor's clock. */
export function useToday(): Date | null {
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => {
    const now = new Date();
    setToday(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
  }, []);
  return today;
}
