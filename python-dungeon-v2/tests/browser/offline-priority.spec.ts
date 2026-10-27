import { test, expect } from "@playwright/test";

test("the first Python load finishes before background offline installation starts", async ({
  page,
  context,
  baseURL,
}) => {
  test.skip(!baseURL?.includes(":4173"), "requires production offline assets");
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
    await route.continue().catch(() => {});
  });
  try {
    await page.goto("/");
    await pending;
    await expect(page.locator(".runtime-badge")).toContainText(
      "กำลังเตรียม Python",
    );
    expect(
      await page.evaluate(
        async () => !!(await navigator.serviceWorker.getRegistration()),
      ),
    ).toBe(false);
    await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
    await expect(page.locator(".settings-save")).not.toContainText(
      "พร้อมเล่นออฟไลน์",
    );
    release();
    await expect(page.locator(".runtime-badge")).toContainText(
      "Python พร้อมแล้ว",
      {
        timeout: 60000,
      },
    );
    await expect(page.locator(".settings-save")).toContainText(
      "พร้อมเล่นออฟไลน์",
      {
        timeout: 60000,
      },
    );
  } finally {
    release();
  }
});
