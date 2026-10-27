import { test, expect } from "@playwright/test";
import { writePython } from "./input";
test("production cache supports cold reload and real Python offline", async ({
  page,
  context,
  baseURL,
}) => {
  test.skip(
    !baseURL?.includes(":4173"),
    "requires production preview with generated service worker",
  );
  await page.goto("/");
  await expect(page.locator(".runtime-badge")).toContainText(
    "Python พร้อมแล้ว",
    { timeout: 60000 },
  );
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const keys = await caches.keys();
        return keys.filter((k) => k.startsWith("runecode-")).length;
      }),
    )
    .toBeGreaterThan(0);
  await context.setOffline(true);
  await page.reload();
  await page
    .getByRole("button", { name: "เริ่มการผจญภัย", exact: true })
    .click();
  await page.locator(".encounter-row").first().click();
  await expect(
    page.getByRole("button", { name: "รันโค้ด", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  await writePython(page, 'print("Moon", "Gate")\nattack(1)');
  await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
  await expect(page.getByRole("progressbar").last()).toHaveAttribute(
    "aria-valuenow",
    "25",
  );
  await expect(page.getByTestId("python-output")).toContainText("Moon Gate");
});
test("Python loading failure offers retry and preserves the page", async ({
  page,
  context,
}) => {
  // Route the worker entry as well: WebKit does not intercept every worker import.
  const workerEntry =
    /(?:python\.worker[^/]*\.js|python\.worker\.ts(?:\?.*)?)$/;
  await context.route(workerEntry, (route) => route.abort());
  await context.route("**/python/pyodide.mjs", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator(".runtime-badge.failed")).toContainText(
    /ไม่สำเร็จ|หยุดทำงาน/,
    {
      timeout: 20000,
    },
  );
  await expect(
    page.getByRole("button", { name: "โหลด Python ใหม่" }),
  ).toBeVisible();
  await context.unroute("**/python/pyodide.mjs");
  await context.unroute(workerEntry);
  await page.getByRole("button", { name: "โหลด Python ใหม่" }).click();
  await expect(page.locator(".runtime-badge")).toContainText(
    "Python พร้อมแล้ว",
    { timeout: 60000 },
  );
});
test("unavailable storage keeps the game and export usable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", {
      get() {
        throw new Error("พื้นที่จัดเก็บถูกปิด");
      },
    });
  });
  await page.goto("/");
  await expect(page.locator(".banner.error")).toBeVisible();
  await page
    .getByRole("button", { name: "เริ่มการผจญภัย", exact: true })
    .click();
  await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "ส่งออกไฟล์", exact: true }).click();
  expect((await download).suggestedFilename()).toContain("runecode-");
});
