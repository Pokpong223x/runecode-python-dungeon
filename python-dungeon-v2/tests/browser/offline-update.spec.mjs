import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  createAssetManifest,
  renderServiceWorker,
} from "../../scripts/offline-worker.mjs";
import { writePython } from "./input";

// An isolated origin serves actual game assets. Production preview and its save
// remain untouched while we change releases and inject a broken deployment.
async function versionedServer() {
  const manifest = await createAssetManifest("dist");
  const originalBodies = new Map(
    await Promise.all(
      manifest.map(async ([url]) => [url, await readFile(`dist${url}`)]),
    ),
  );
  const original = originalBodies.get("/index.html").toString();
  const requests = [];
  const activations = new Set();
  let bodies;
  let worker,
    cache,
    broken = null,
    holdHtml = false;
  const heldResponses = [];
  function release(version, fail = false, hold = false) {
    bodies = new Map(originalBodies);
    broken = fail === true ? "/index.html" : fail || null;
    holdHtml = hold;
    const html = Buffer.from(
      original.replace(
        '<html lang="th">',
        `<html lang="th" data-offline-release="${version}">`,
      ),
    );
    bodies.set("/index.html", html);
    // Real deployments replace hashed JS chunks. Change the actual module URLs
    // and every import reference, including the editor that loads on room entry.
    if (version > 1) {
      const renamed = new Map(
        [...bodies.keys()]
          .filter((url) => url.endsWith(".js"))
          .map((url) => [url, url.replace(/\.js$/, `-release-${version}.js`)]),
      );
      for (const [url, body] of [...bodies]) {
        if (!/\.(?:js|html)$/.test(url)) continue;
        let text = body.toString();
        for (const [before, after] of renamed)
          text = text.replaceAll(
            before.split("/").at(-1),
            after.split("/").at(-1),
          );
        bodies.delete(url);
        bodies.set(renamed.get(url) ?? url, Buffer.from(text));
      }
    }
    const files = [...bodies].map(([url, body]) => [
      url,
      createHash("sha256").update(body).digest("base64"),
    ]);
    worker = renderServiceWorker(files);
    cache = worker.match(/runecode-[a-f0-9]{16}/)[0];
    // Observe activation after the last controlled client leaves. The observer
    // does not call skipWaiting or otherwise change the worker's lifecycle.
    worker += `\nself.addEventListener("activate", event => event.waitUntil(fetch("/__activated?cache=${cache}").catch(() => {})));\n`;
    return cache;
  }
  release(1);
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const path = url.pathname;
    requests.push(path);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Type",
      path.endsWith(".wasm")
        ? "application/wasm"
        : /\.(m?js)$/.test(path)
          ? "text/javascript"
          : /\/(?:index\.html)?$/.test(path)
            ? "text/html"
            : path.endsWith(".json")
              ? "application/json"
              : path.endsWith(".svg")
                ? "image/svg+xml"
                : "application/octet-stream",
    );
    if (path === "/__activated") {
      activations.add(url.searchParams.get("cache"));
      return res.end("observed");
    }
    if (path === "/sw.js") return res.end(worker);
    const key = path === "/" ? "/index.html" : path;
    if (!bodies.has(key)) {
      res.statusCode = 404;
      return res.end("missing");
    }
    if (key === broken && holdHtml) {
      heldResponses.push(res);
      return;
    }
    if (key === broken) return res.end("incomplete deployment");
    res.end(bodies.get(key));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    activations,
    release,
    get heldCount() {
      return heldResponses.length;
    },
    finishBrokenUpdate() {
      holdHtml = false;
      heldResponses
        .splice(0)
        .forEach((res) => res.end("incomplete deployment"));
    },
    get cache() {
      return cache;
    },
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  };
}
async function prepare(page, url) {
  await page.goto(url);
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {
      timeout: 60000,
    })
    .toBe(true);
  await expect(page.locator(".runtime-badge")).toContainText(
    "Python พร้อมแล้ว",
    { timeout: 60000 },
  );
  await page
    .getByRole("button", { name: "เริ่มการผจญภัย", exact: true })
    .click();
  await page.locator(".encounter-row").first().click();
  await expect(
    page.getByRole("button", { name: "รันโค้ด", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  await writePython(page, '# คาถาที่เก็บไว้\nprint("Moon", "Gate")\nattack(1)');
  await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
  await expect(page.getByRole("progressbar").last()).toHaveAttribute(
    "aria-valuenow",
    "25",
  );
  await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
}
async function update(page) {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    const settled = new Promise((resolve) => {
      registration.addEventListener(
        "updatefound",
        () => {
          const worker = registration.installing;
          const check = () => {
            if (worker.state === "installed") resolve("waiting");
            else if (
              worker.state === "activated" ||
              worker.state === "redundant"
            )
              resolve(worker.state);
          };
          worker.addEventListener("statechange", check);
          check();
        },
        { once: true },
      );
    });
    await registration.update();
    return settled;
  });
}

test("an update reuses verified Python, repairs corrupt cache and preserves offline play", async ({
  page,
  context,
}, info) => {
  const host = await versionedServer();
  try {
    await prepare(page, host.url);
    const old = host.cache;
    await page.evaluate(async (name) => {
      const cache = await caches.open(name);
      await cache.put("/icon.svg", new Response("corrupt icon"));
      await (
        await caches.open("unrelated-app")
      ).put("/marker", new Response("keep"));
    }, old);
    host.requests.length = 0;
    const next = host.release(2);
    expect(await update(page)).toBe("waiting");
    const requests = [...host.requests];
    await writeFile(
      `.verification/offline-update-requests-${info.project.name}.json`,
      JSON.stringify(
        {
          previousCache: old,
          nextCache: next,
          requests,
          pythonRequests: requests.filter((url) => url.startsWith("/python/")),
        },
        null,
        2,
      ),
    );
    expect(requests.filter((url) => url.startsWith("/python/"))).toEqual([]);
    expect(requests.filter((url) => url === "/icon.svg")).toHaveLength(1);
    const keys = await page.evaluate(() => caches.keys());
    expect(keys).toContain(next);
    expect(keys).toContain(old);
    expect(keys).toContain("unrelated-app");
    // A reload alone may keep the old worker alive. Leave the origin so the
    // complete waiting release can activate after its last client closes.
    await page.goto("about:blank");
    await expect.poll(() => host.activations.has(next)).toBe(true);
    await context.setOffline(true);
    await page.goto(host.url);
    await expect(page.locator("html")).toHaveAttribute(
      "data-offline-release",
      "2",
    );
    await expect(page.getByRole("progressbar").last()).toHaveAttribute(
      "aria-valuenow",
      "25",
    );
    await expect(
      page.getByRole("textbox", { name: "เขียนโค้ด Python" }),
    ).toContainText("คาถาที่เก็บไว้");
    await expect(
      page.getByRole("button", { name: "รันโค้ด", exact: true }),
    ).toBeEnabled({ timeout: 60000 });
    await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
    await expect(page.getByRole("progressbar").last()).toHaveAttribute(
      "aria-valuenow",
      "19",
    );
    await page.screenshot({
      path: `.verification/offline-updated-${info.project.name}.png`,
      fullPage: true,
    });
    await info.attach("update network requests", {
      body: JSON.stringify(requests),
      contentType: "application/json",
    });
  } finally {
    await context.setOffline(false);
    await host.close();
  }
});

test("a waiting chunk upgrade preserves an old tab's first editor load offline", async ({
  page,
  context,
}) => {
  const host = await versionedServer();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(host.url);
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {
        timeout: 60000,
      })
      .toBe(true);
    await expect(page.locator(".runtime-badge")).toContainText(
      "Python พร้อมแล้ว",
      {
        timeout: 60000,
      },
    );
    const old = host.cache;
    // The first room has never opened, so the old Editor chunk is still lazy.
    const next = host.release(2);
    expect(await update(page)).toBe("waiting");
    await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
    await expect(page.locator(".settings-save")).toContainText(
      "รุ่นใหม่พร้อมแล้ว",
    );
    await expect(page.locator(".settings-save")).toContainText(
      "ปิดแท็บเกมทั้งหมดและเปิดใหม่",
    );
    await page
      .getByRole("button", { name: "ปิดหน้าต่าง", exact: true })
      .click();
    await context.setOffline(true);
    await page
      .getByRole("button", { name: "เริ่มการผจญภัย", exact: true })
      .click();
    await page.locator(".encounter-row").first().click();
    await expect(
      page.getByRole("button", { name: "รันโค้ด", exact: true }),
    ).toBeEnabled({
      timeout: 60000,
    });
    await writePython(
      page,
      '# แท็บเดิมยังเล่นได้\nprint("Moon", "Gate")\nattack(1)',
    );
    await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
    await expect(page.getByTestId("python-output")).toContainText("Moon Gate");
    await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
    expect(await page.evaluate(() => caches.keys())).toContain(old);
    expect(errors).toEqual([]);
    await context.setOffline(false);
    await page.goto("about:blank");
    await expect.poll(() => host.activations.has(next)).toBe(true);
    await context.setOffline(true);
    await page.goto(host.url);
    await expect(page.locator("html")).toHaveAttribute(
      "data-offline-release",
      "2",
    );
    await expect(
      page.getByRole("button", { name: "รันโค้ด", exact: true }),
    ).toBeEnabled({
      timeout: 60000,
    });
    await expect(
      page.getByRole("textbox", { name: "เขียนโค้ด Python" }),
    ).toContainText("แท็บเดิมยังเล่นได้");
    expect(await page.evaluate(() => caches.keys())).not.toContain(old);
    expect(errors).toEqual([]);
  } finally {
    await context.setOffline(false);
    await host.close();
  }
});

test("an incomplete update never replaces the working offline checkpoint", async ({
  page,
  context,
}) => {
  const host = await versionedServer();
  try {
    await prepare(page, host.url);
    const old = host.cache;
    const failed = host.release(2, true);
    expect(await update(page)).toBe("redundant");
    const keys = await page.evaluate(() => caches.keys());
    expect(keys).toContain(old);
    expect(keys).not.toContain(failed);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute(
      "data-offline-release",
      "1",
    );
    await expect(page.getByRole("progressbar").last()).toHaveAttribute(
      "aria-valuenow",
      "25",
    );
    await expect(
      page.getByRole("button", { name: "รันโค้ด", exact: true }),
    ).toBeEnabled({ timeout: 60000 });
    await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
    await expect(page.getByTestId("python-output")).toContainText(
      "คาถาที่เก็บไว้",
    );
    await expect(page.getByRole("progressbar").last()).toHaveAttribute(
      "aria-valuenow",
      "19",
    );
  } finally {
    await context.setOffline(false);
    await host.close();
  }
});

test("the offline badge respects an active release while a new install fails", async ({
  page,
  context,
}, info) => {
  const host = await versionedServer();
  try {
    await prepare(page, host.url);
    host.release(2, true, true);
    const pending = update(page);
    await expect.poll(() => host.heldCount).toBe(1);
    // A fresh page is served by the complete old worker while the candidate's
    // index response remains pending. Its register() sees both workers.
    const returning = await context.newPage();
    await returning.goto(host.url);
    await expect(returning.locator("html")).toHaveAttribute(
      "data-offline-release",
      "1",
    );
    await returning
      .getByRole("button", { name: "ตั้งค่า", exact: true })
      .click();
    await expect(returning.locator(".settings-save")).toContainText(
      "พร้อมเล่นออฟไลน์",
    );
    host.finishBrokenUpdate();
    expect(await pending).toBe("redundant");
    await context.setOffline(true);
    await returning.reload();
    await expect(
      returning.getByRole("button", { name: "รันโค้ด", exact: true }),
    ).toBeEnabled({ timeout: 60000 });
    await returning
      .getByRole("button", { name: "ตั้งค่า", exact: true })
      .click();
    await expect(returning.locator(".settings-save")).toContainText(
      "พร้อมเล่นออฟไลน์",
    );
    await returning
      .getByRole("button", { name: "ปิดหน้าต่าง", exact: true })
      .click();
    await returning
      .getByRole("button", { name: "รันโค้ด", exact: true })
      .click();
    await expect(returning.getByTestId("python-output")).toContainText(
      "คาถาที่เก็บไว้",
    );
    await returning.screenshot({
      path: `.verification/offline-ready-${info.project.name}.png`,
      fullPage: true,
    });
    await returning.close();
  } finally {
    host.finishBrokenUpdate();
    await context.setOffline(false);
    await host.close();
  }
});

test("an incomplete first install never claims offline readiness", async ({
  page,
}, info) => {
  const host = await versionedServer();
  try {
    host.release(1, "/icon.svg", true);
    await page.goto(host.url);
    // The document's favicon request and the worker may both request this file.
    await expect.poll(() => host.heldCount).toBeGreaterThanOrEqual(1);
    await expect
      .poll(() =>
        page.evaluate(
          async () =>
            (await navigator.serviceWorker.getRegistration())?.installing
              ?.state,
        ),
      )
      .toBe("installing");
    await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
    await expect(page.locator(".settings-save")).not.toContainText(
      "พร้อมเล่นออฟไลน์",
    );
    host.finishBrokenUpdate();
    await expect
      .poll(() =>
        page.evaluate(
          async () =>
            !!(await navigator.serviceWorker.getRegistration())?.installing,
        ),
      )
      .toBe(false);
    await expect.poll(() => page.evaluate(() => caches.keys())).toEqual([]);
    await expect(page.locator(".settings-save")).not.toContainText(
      "พร้อมเล่นออฟไลน์",
    );
    await page.getByRole("dialog").screenshot({
      path: `.verification/offline-incomplete-${info.project.name}.png`,
    });
    expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBe(
      null,
    );
  } finally {
    host.finishBrokenUpdate();
    await host.close();
  }
});
