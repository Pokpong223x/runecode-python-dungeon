import { describe, it, expect, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join, resolve, sep, basename } from "node:path";
import { tmpdir } from "node:os";
import { createHash, webcrypto } from "node:crypto";
import vm from "node:vm";
import {
  createAssetManifest,
  renderServiceWorker,
} from "../scripts/offline-worker.mjs";

describe("offline build identity", () => {
  it("is repeatable and detects changed bytes at an unchanged runtime URL", async () => {
    const directory = await mkdtemp(join(tmpdir(), "runecode-cache-test-"));
    try {
      await mkdir(join(directory, "python"));
      await writeFile(join(directory, "index.html"), "first page");
      await writeFile(
        join(directory, "python", "runtime.wasm"),
        Buffer.from([0, 97, 115, 109]),
      );
      await writeFile(join(directory, "sw.js"), "old generated worker");
      await writeFile(join(directory, "ignored.map"), "debug data");
      const first = await createAssetManifest(directory);
      expect(first.map(([url]) => url)).toEqual([
        "/index.html",
        "/python/runtime.wasm",
      ]);
      expect(renderServiceWorker(first)).toBe(
        renderServiceWorker(await createAssetManifest(directory)),
      );
      expect(renderServiceWorker([...first].reverse())).toBe(
        renderServiceWorker(first),
      );
      await writeFile(
        join(directory, "python", "runtime.wasm"),
        Buffer.from([0, 97, 115, 110]),
      );
      const changed = await createAssetManifest(directory);
      expect(changed[0]).toEqual(first[0]);
      expect(changed[1][1]).not.toBe(first[1][1]);
      expect(renderServiceWorker(changed)).not.toBe(renderServiceWorker(first));
    } finally {
      const absolute = resolve(directory);
      if (
        !absolute.startsWith(resolve(tmpdir()) + sep) ||
        !basename(absolute).startsWith("runecode-cache-test-")
      )
        throw new Error("Unexpected test directory");
      await rm(absolute, { recursive: true, force: true });
    }
  });
});

// Exercise the generated standalone worker, with browser lifecycle transitions
// supplied explicitly. These checks do not substitute for browser update tests.
function offlineHost() {
  const origin = "https://runecode.test";
  const stores = new Map();
  const network = new Map();
  const httpCache = new Map();
  const requests = [];
  const registration = { active: null, waiting: null, installing: null };
  const absolute = (request) =>
    new URL(typeof request === "string" ? request : request.url, origin).href;
  const caches = {
    keys: async () => [...stores.keys()],
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        match: async (request) => entries.get(absolute(request))?.clone(),
        put: async (request, response) =>
          entries.set(absolute(request), response.clone()),
        delete: async (request) => entries.delete(absolute(request)),
      };
    },
    delete: async (name) => stores.delete(name),
  };
  class LocalRequest extends Request {
    constructor(url, options) {
      super(new URL(url, origin), options);
    }
  }
  function release(files) {
    const entries = Object.entries(files).map(([url, body]) => [
      url,
      createHash("sha256").update(body).digest("base64"),
    ]);
    const script = renderServiceWorker(entries);
    const cacheName = script.match(/runecode-[a-f0-9]{16}/)[0];
    const listeners = new Map();
    const worker = {
      cacheName,
      skipWaiting: 0,
      claimed: 0,
      install: () => dispatch("install"),
      activate: async () => {
        registration.active = worker;
        if (registration.installing === worker) registration.installing = null;
        if (registration.waiting === worker) registration.waiting = null;
        await dispatch("activate");
      },
      fetch: (url) => {
        let response;
        listeners.get("fetch")({
          request: new LocalRequest(url),
          respondWith: (promise) => (response = promise),
        });
        return response;
      },
    };
    async function dispatch(name) {
      let pending;
      listeners.get(name)({ waitUntil: (promise) => (pending = promise) });
      await pending;
    }
    vm.runInNewContext(script, {
      URL,
      Request: LocalRequest,
      Response,
      Uint8Array,
      crypto: webcrypto,
      btoa,
      caches,
      fetch: async (request) => {
        const path = new URL(request.url).pathname;
        const cached = request.cache === "default" && httpCache.has(path);
        requests.push({
          path,
          mode: request.cache,
          source: cached ? "http" : "network",
        });
        const body = (cached ? httpCache : network).get(path);
        return body === undefined
          ? new Response("missing", { status: 404 })
          : new Response(await body);
      },
      self: {
        location: { origin },
        registration,
        clients: { claim: async () => worker.claimed++ },
        skipWaiting: async () => worker.skipWaiting++,
        addEventListener: (name, handler) => listeners.set(name, handler),
      },
    });
    registration.installing = worker;
    return worker;
  }
  return {
    release,
    stores,
    network,
    httpCache,
    requests,
    registration,
    caches,
  };
}

describe("generated offline worker", () => {
  it("reuses verified foreground HTTP-cache bytes on the first install", async () => {
    const host = offlineHost();
    host.httpCache.set("/python/runtime.wasm", "foreground Python bytes");
    const worker = host.release({
      "/python/runtime.wasm": "foreground Python bytes",
    });
    await worker.install();
    expect(host.requests).toEqual([
      { path: "/python/runtime.wasm", mode: "default", source: "http" },
    ]);
    expect(worker.skipWaiting).toBe(0);
    await worker.activate();
    expect(worker.claimed).toBe(1);
    expect(await (await worker.fetch("/python/runtime.wasm")).text()).toBe(
      "foreground Python bytes",
    );
  });

  it("refetches stale HTTP-cache bytes and rejects a corrupt network response", async () => {
    const host = offlineHost();
    host.httpCache.set("/python/runtime.wasm", "old Python");
    host.network.set("/python/runtime.wasm", "new Python");
    const old = host.release({ "/python/runtime.wasm": "new Python" });
    await old.install();
    await old.activate();
    expect(host.requests.map(({ mode }) => mode)).toEqual([
      "default",
      "reload",
    ]);
    expect(await (await old.fetch("/python/runtime.wasm")).text()).toBe(
      "new Python",
    );
    host.requests.length = 0;
    host.network.set("/python/runtime.wasm", "corrupt Python");
    const broken = host.release({ "/python/runtime.wasm": "next Python" });
    await expect(broken.install()).rejects.toThrow("Incomplete offline asset");
    expect(host.requests.map(({ mode }) => mode)).toEqual([
      "default",
      "reload",
    ]);
    expect([...host.stores.keys()]).toEqual([old.cacheName]);
    expect(await (await old.fetch("/python/runtime.wasm")).text()).toBe(
      "new Python",
    );
  });

  it("removes a failed first candidate after all parallel cache writes settle", async () => {
    const host = offlineHost();
    host.network.set("/index.html", "complete page");
    host.network.set("/assets/Editor.js", "broken editor");
    const worker = host.release({
      "/index.html": "complete page",
      "/assets/Editor.js": "complete editor",
    });
    await expect(worker.install()).rejects.toThrow("Incomplete offline asset");
    expect([...host.stores.keys()]).toEqual([]);
    expect(worker.skipWaiting).toBe(0);
    expect(worker.claimed).toBe(0);
  });

  it("keeps live old lazy chunks through repeated waiting releases and bounds caches", async () => {
    const host = offlineHost();
    host.network.set("/assets/Editor-old.js", "old editor");
    const old = host.release({ "/assets/Editor-old.js": "old editor" });
    await old.install();
    await old.activate();
    await (
      await host.caches.open("unrelated-app")
    ).put("/marker", new Response("keep"));
    let next;
    for (const [index, version] of [2, 3, 2, 4, 5, 6, 7].entries()) {
      host.network.clear();
      host.network.set(`/assets/Editor-${version}.js`, `editor ${version}`);
      next = host.release({
        [`/assets/Editor-${version}.js`]: `editor ${version}`,
      });
      const previousWaiting = host.registration.waiting;
      await next.install();
      if (previousWaiting)
        expect(host.stores.has(previousWaiting.cacheName)).toBe(true);
      host.registration.installing = null;
      host.registration.waiting = next;
      expect(next.skipWaiting).toBe(0);
      expect(host.registration.active).toBe(old);
      expect(
        [...host.stores.keys()].filter((key) => key.startsWith("runecode-")),
      ).toHaveLength(Math.min(index + 2, 3));
      // The server no longer has this file. Only the live old release can serve it.
      expect(await (await old.fetch("/assets/Editor-old.js")).text()).toBe(
        "old editor",
      );
    }
    await next.activate();
    expect([...host.stores.keys()].sort()).toEqual(
      [next.cacheName, "unrelated-app"].sort(),
    );
    host.network.clear();
    expect(await (await next.fetch("/assets/Editor-7.js")).text()).toBe(
      "editor 7",
    );
  });

  it("migrates an unmarked active cache and preserves a concurrent installer at activation", async () => {
    const host = offlineHost();
    host.network.set("/old.js", "old");
    const old = host.release({ "/old.js": "old" });
    await old.install();
    host.registration.active = old; // The previous worker had no active marker.
    host.network.set("/waiting.js", "waiting");
    const waiting = host.release({ "/waiting.js": "waiting" });
    await waiting.install();
    host.registration.waiting = waiting;
    let finishDownload;
    host.network.set(
      "/installing.js",
      new Promise((resolveDownload) => {
        finishDownload = resolveDownload;
      }),
    );
    const installing = host.release({ "/installing.js": "installing" });
    const download = installing.install();
    await vi.waitFor(() =>
      expect(host.requests.some(({ path }) => path === "/installing.js")).toBe(
        true,
      ),
    );
    expect(host.stores.has(old.cacheName)).toBe(true);
    await waiting.activate();
    expect([...host.stores.keys()].sort()).toEqual(
      [waiting.cacheName, installing.cacheName].sort(),
    );
    finishDownload("installing");
    await download;
    await installing.activate();
    expect([...host.stores.keys()]).toEqual([installing.cacheName]);
    expect(await (await installing.fetch("/installing.js")).text()).toBe(
      "installing",
    );
  });
});
