import { describe, expect, it, vi } from "vitest";
import { observeOfflineSupport } from "../src/ui/offlineSupport";

class Worker extends EventTarget {
  constructor(public state: ServiceWorkerState) {
    super();
  }
}
class Registration extends EventTarget {
  active: Worker | null = null;
  waiting: Worker | null = null;
  installing: Worker | null = null;
}
class Workers extends EventTarget {
  controller: Worker | null = null;
  current = new Registration();
  register = vi.fn(async () => this.current);
  getRegistration = vi.fn(async () => this.current);
}
const container = (workers: Workers) =>
  workers as unknown as ServiceWorkerContainer;
async function settled() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("offline installation priority and release status", () => {
  it("does not start installation while Python is loading, but observes an existing release", async () => {
    const workers = new Workers();
    workers.current.active = new Worker("activated");
    const ready = vi.fn();
    const dispose = observeOfflineSupport(
      container(workers),
      false,
      ready,
      vi.fn(),
    );
    await settled();
    expect(workers.register).not.toHaveBeenCalled();
    expect(workers.getRegistration).toHaveBeenCalledOnce();
    expect(ready).toHaveBeenLastCalledWith(true);
    dispose();
  });

  it("starts precaching after Python is prepared and announces readiness only after activation", async () => {
    const workers = new Workers();
    const installing = new Worker("installing");
    workers.current.installing = installing;
    const ready = vi.fn();
    const dispose = observeOfflineSupport(
      container(workers),
      true,
      ready,
      vi.fn(),
    );
    await settled();
    expect(workers.register).toHaveBeenCalledWith("/sw.js");
    expect(ready).toHaveBeenLastCalledWith(false);
    installing.state = "installed";
    installing.dispatchEvent(new Event("statechange"));
    expect(ready).toHaveBeenLastCalledWith(false);
    installing.state = "activated";
    workers.current.active = installing;
    workers.current.installing = null;
    installing.dispatchEvent(new Event("statechange"));
    expect(ready).toHaveBeenLastCalledWith(true);
    dispose();
  });

  it("keeps the active release ready while showing a waiting update", async () => {
    const workers = new Workers();
    workers.current.active = new Worker("activated");
    workers.current.waiting = new Worker("installed");
    const ready = vi.fn();
    const waiting = vi.fn();
    const dispose = observeOfflineSupport(
      container(workers),
      true,
      ready,
      waiting,
    );
    await settled();
    expect(ready).toHaveBeenLastCalledWith(true);
    expect(waiting).toHaveBeenLastCalledWith(true);
    workers.current.waiting.state = "redundant";
    workers.current.waiting.dispatchEvent(new Event("statechange"));
    expect(waiting).toHaveBeenLastCalledWith(false);
    expect(ready).toHaveBeenLastCalledWith(true);
    dispose();
  });

  it("preserves controlling-release readiness if registration fails", async () => {
    const workers = new Workers();
    workers.controller = new Worker("activated");
    workers.register.mockRejectedValueOnce(new Error("offline"));
    const ready = vi.fn();
    const dispose = observeOfflineSupport(
      container(workers),
      true,
      ready,
      vi.fn(),
    );
    await settled();
    expect(ready).toHaveBeenLastCalledWith(true);
    dispose();
  });

  it("ignores a registration promise completed after disposal", async () => {
    const workers = new Workers();
    let complete!: (registration: Registration) => void;
    workers.register.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const ready = vi.fn();
    const dispose = observeOfflineSupport(
      container(workers),
      true,
      ready,
      vi.fn(),
    );
    const calls = ready.mock.calls.length;
    dispose();
    workers.current.active = new Worker("activated");
    complete(workers.current);
    await settled();
    workers.current.dispatchEvent(new Event("updatefound"));
    expect(ready).toHaveBeenCalledTimes(calls);
  });

  it("removes worker and container listeners on disposal", async () => {
    const workers = new Workers();
    workers.current.installing = new Worker("installing");
    const ready = vi.fn();
    const waiting = vi.fn();
    const dispose = observeOfflineSupport(
      container(workers),
      true,
      ready,
      waiting,
    );
    await settled();
    const calls = ready.mock.calls.length;
    const waitingCalls = waiting.mock.calls.length;
    dispose();
    workers.current.installing.state = "activated";
    workers.current.installing.dispatchEvent(new Event("statechange"));
    workers.current.dispatchEvent(new Event("updatefound"));
    workers.dispatchEvent(new Event("controllerchange"));
    expect(ready).toHaveBeenCalledTimes(calls);
    expect(waiting).toHaveBeenCalledTimes(waitingCalls);
  });
});
