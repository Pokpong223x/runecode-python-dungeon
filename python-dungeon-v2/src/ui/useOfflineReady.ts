import { useEffect, useState } from "react";
import { observeOfflineSupport } from "./offlineSupport";

/** Readiness follows a complete active release, including during failed updates. */
export function useOfflineReady(pythonPrepared: boolean) {
  const [ready, setReady] = useState(false);
  const [updateWaiting, setUpdateWaiting] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    // The first runtime download has priority over background precaching.
    // Existing active releases remain observable while Python is preparing.
    return observeOfflineSupport(
      navigator.serviceWorker,
      pythonPrepared,
      setReady,
      setUpdateWaiting,
    );
  }, [pythonPrepared]);
  return { ready, updateWaiting };
}
