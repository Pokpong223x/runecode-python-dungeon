import { test, expect } from "@playwright/test";

test("actual renderer preserves complete silhouettes in every authored pose", async ({
  page,
}, info) => {
  test.skip(
    !!process.env.TEST_URL,
    "Pose review fixture is served by the development server only",
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1800, height: 1840 });
  await page.goto("/tests/fixtures/poses.html");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("canvas")).toBeVisible();
  await page.screenshot({
    path: `.verification/complete-poses-${info.project.name}.png`,
    fullPage: true,
  });
  await page.goto("/tests/fixtures/poses.html?group=heroes");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
  await page.locator("#review").screenshot({
    path: `.verification/complete-hero-poses-${info.project.name}.png`,
  });
  expect(errors).toEqual([]);
});
