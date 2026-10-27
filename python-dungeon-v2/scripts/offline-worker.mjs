import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

export async function createAssetManifest(root, prefix = "") {
  const entries = [];
  for (const file of await readdir(join(root, prefix), {
    withFileTypes: true,
  })) {
    const name = prefix ? `${prefix}/${file.name}` : file.name;
    if (file.isDirectory())
      entries.push(...(await createAssetManifest(root, name)));
    else if (!name.endsWith(".map") && name !== "sw.js") {
      const digest = createHash("sha256")
        .update(await readFile(join(root, name)))
        .digest("base64");
      entries.push([`/${name}`, digest]);
    }
  }
  return entries.sort(([a], [b]) => a.localeCompare(b, "en"));
}

// Serialized into the standalone worker. Keep all runtime helpers inside here.
function offlineWorker(CACHE, FILES) {
  const PREFIX = "runecode-";
  const ACTIVE = "/__runecode_active_release__";
  async function matchesDigest(response, expected) {
    if (!response?.ok) return false;
    try {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        await response.clone().arrayBuffer(),
      );
      return btoa(String.fromCharCode(...new Uint8Array(digest))) === expected;
    } catch {
      return false;
    }
  }
  async function install() {
    const keys = (await caches.keys()).filter((key) => key.startsWith(PREFIX));
    const sources = await Promise.all(keys.map((key) => caches.open(key)));
    const active = new Set();
    for (let index = 0; index < keys.length; index++) {
      if (await sources[index].match(ACTIVE)) active.add(keys[index]);
    }
    // Releases predating the marker kept exactly one active cache. Cache names
    // are returned in creation order, so its oldest cache is the safe fallback.
    if (!active.size && self.registration.active && keys.length)
      active.add(keys[0]);
    // Keep the last candidate: it can activate if the final old tab closes
    // during this install. Older, superseded candidates cannot still be used.
    const pending = keys
      .filter((key) => !active.has(key) && key !== CACHE)
      .at(-1);
    // A rollback can revisit a superseded candidate. Recreate it to keep cache
    // creation order aligned with candidate order, without touching active data.
    if (keys.includes(CACHE) && !active.has(CACHE)) await caches.delete(CACHE);
    const target = await caches.open(CACHE);
    for (const key of keys) {
      if (key !== CACHE && key !== pending && !active.has(key))
        await caches.delete(key);
    }
    const reusable = sources.filter(
      (_, index) => active.has(keys[index]) || keys[index] === pending,
    );
    async function cacheFile([url, digest]) {
      for (const source of reusable) {
        const previous = await source.match(url, { ignoreVary: true });
        if (await matchesDigest(previous, digest)) {
          await target.put(url, previous);
          return;
        }
      }
      // Python may already be in the HTTP cache from its foreground load.
      // Verify those bytes too, retrying stale unchanged URLs from the network.
      let response = await fetch(new Request(url, { cache: "default" }));
      if (!(await matchesDigest(response, digest)))
        response = await fetch(new Request(url, { cache: "reload" }));
      if (!(await matchesDigest(response, digest)))
        throw new Error(`Incomplete offline asset: ${url}`);
      await target.put(url, response);
    }
    let cursor = 0;
    const copy = async () => {
      while (cursor < FILES.length) await cacheFile(FILES[cursor++]);
    };
    // Bounded memory, and wait for all writes before cleaning a failed install.
    const results = await Promise.allSettled(Array.from({ length: 4 }, copy));
    const failed = results.find((result) => result.status === "rejected");
    if (failed) {
      if (!active.has(CACHE)) await caches.delete(CACHE);
      throw failed.reason;
    }
    // Updates stay waiting until the old release has no controlled tabs. A
    // live tab may still need its old hashed editor or Python worker chunk.
  }
  self.addEventListener("install", (event) => event.waitUntil(install()));
  self.addEventListener("activate", (event) =>
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE);
        await cache.put(ACTIVE, new Response("active"));
        const keys = (await caches.keys()).filter((key) =>
          key.startsWith(PREFIX),
        );
        const pending = self.registration.installing
          ? keys.filter((key) => key !== CACHE).at(-1)
          : null;
        for (const key of keys) {
          if (key === CACHE) continue;
          if (key === pending) {
            // A newer installer may be writing this cache concurrently.
            await (await caches.open(key)).delete(ACTIVE);
          } else await caches.delete(key);
        }
        await self.clients.claim();
      })(),
    ),
  );
  self.addEventListener("fetch", (event) => {
    if (
      event.request.method !== "GET" ||
      new URL(event.request.url).origin !== self.location.origin
    )
      return;
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const key =
          event.request.mode === "navigate" ? "/index.html" : event.request;
        return (
          (await cache.match(key, { ignoreVary: true })) || fetch(event.request)
        );
      })(),
    );
  });
}

export function renderServiceWorker(entries) {
  const files = [...entries].sort(([a], [b]) => a.localeCompare(b, "en"));
  const runtime = offlineWorker.toString();
  const version = createHash("sha256")
    .update(JSON.stringify(files))
    .update(runtime)
    .digest("hex")
    .slice(0, 16);
  return `// RuneCode offline assets: content-verified, atomic installation.\n(${runtime})(${JSON.stringify(`runecode-${version}`)},${JSON.stringify(files)});\n`;
}
