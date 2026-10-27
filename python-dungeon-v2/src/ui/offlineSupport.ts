/** Observe existing offline support immediately; start downloads only when allowed. */
export function observeOfflineSupport(
  workers: ServiceWorkerContainer,
  installAllowed: boolean,
  onReady: (ready: boolean) => void,
  onWaiting: (waiting: boolean) => void,
) {
  let disposed = false;
  const cleanup: Array<() => void> = [];
  const controllingReleaseReady = () =>
    workers.controller?.state === "activated";
  onReady(controllingReleaseReady());
  onWaiting(false);
  const registration = installAllowed
    ? workers.register("/sw.js")
    : workers.getRegistration();
  void registration
    .then((current) => {
      if (disposed || !current) return;
      const observed = new Set<ServiceWorker>();
      const refresh = () => {
        if (disposed) return;
        const releases = [current.active, current.waiting, current.installing];
        onWaiting(current.waiting?.state === "installed");
        onReady(
          controllingReleaseReady() ||
            releases.some((worker) => worker?.state === "activated"),
        );
        for (const worker of releases) {
          if (!worker || observed.has(worker)) continue;
          observed.add(worker);
          worker.addEventListener("statechange", refresh);
          cleanup.push(() =>
            worker.removeEventListener("statechange", refresh),
          );
        }
      };
      current.addEventListener("updatefound", refresh);
      workers.addEventListener("controllerchange", refresh);
      cleanup.push(
        () => current.removeEventListener("updatefound", refresh),
        () => workers.removeEventListener("controllerchange", refresh),
      );
      refresh();
    })
    .catch(() => {
      if (!disposed) onReady(controllingReleaseReady());
    });
  return () => {
    disposed = true;
    cleanup.forEach((remove) => remove());
  };
}
