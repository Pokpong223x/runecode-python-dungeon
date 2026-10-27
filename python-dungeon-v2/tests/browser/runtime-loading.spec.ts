import { test, expect, type Page } from "@playwright/test";
import { writePython } from "./input";

test.use({ serviceWorkers: "block", reducedMotion: "reduce" });
test.beforeEach(({ baseURL }) => {
  test.skip(!baseURL?.includes(":4173"), "requires production runtime assets");
});

async function saved(page: Page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("runecode-save", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("game", "readonly");
          const read = transaction.objectStore("game").get("save");
          let value: unknown;
          read.onsuccess = () => {
            value = read.result;
          };
          transaction.oncomplete = () => {
            database.close();
            resolve(value);
          };
          transaction.onabort = transaction.onerror = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
  );
}

for (const [elapsed, expires] of [
  [61_000, false],
  [241_000, true],
] as const) {
  test(`first Python download ${expires ? "eventually expires and retries" : "survives a healthy slow connection"} without changing the checkpoint`, async ({
    page,
    context,
  }, info) => {
    let release!: () => void;
    let requested!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      requested = resolve;
    });
    await context.route("**/python/python_stdlib.zip", async (route) => {
      requested();
      await gate;
      // A timed-out worker's original request may already have been aborted.
      await route.continue().catch(() => {});
    });
    try {
      await page.clock.install();
      await page.goto("/");
      await page
        .getByRole("button", { name: "เริ่มการผจญภัย", exact: true })
        .click();
      await page.locator(".encounter-row").first().click();
      await pending;
      await expect(page.locator(".cm-content")).toBeVisible({
        timeout: 60_000,
      });
      await writePython(page, 'print("Moon", "Gate")\nattack(1)');
      await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
      const before = await saved(page);
      await page.clock.fastForward(elapsed);
      const badge = page.locator(".runtime-badge");
      const retry = page.getByRole("button", {
        name: "โหลด Python ใหม่",
        exact: true,
      });
      if (expires) {
        await expect(badge).toContainText("โหลด Python นานเกินไป");
        await expect(retry).toBeVisible();
      } else {
        await expect(badge).toContainText("กำลังเตรียม Python");
        await expect(retry).toHaveCount(0);
      }
      expect(await saved(page)).toEqual(before);
      await badge.screenshot({
        path: `.verification/runtime-loading-${info.project.name}-${expires ? "expired" : "waiting"}.png`,
      });
      release();
      if (expires) await retry.click();
      await expect(badge).toContainText("Python พร้อมแล้ว", {
        timeout: 60_000,
      });
      expect(await saved(page)).toEqual(before);
      await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
      await expect(page.getByTestId("python-output")).toContainText(
        "Moon Gate",
      );
      await expect(page.getByRole("progressbar").last()).toHaveAttribute(
        "aria-valuenow",
        "25",
      );
    } finally {
      release();
    }
  });
}
