import { test, expect } from "@playwright/test";

test("chapter mist is visible, drifts slowly and stays still with reduced motion", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  test.skip(
    !!process.env.TEST_URL,
    "Ambient review fixture is development-only",
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install();
  await page.setViewportSize({ width: 800, height: 530 });
  for (const chapter of [1, 2, 3, 4, 5, 6]) {
    await page.goto(`/tests/fixtures/atmosphere.html?chapter=${chapter}`);
    await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
    const now = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(new Date(now + 200));
    const before = await page.locator("canvas").screenshot();
    await page.clock.runFor(8000);
    const after = await page.locator("canvas").screenshot({
      path: `.verification/mist-${info.project.name}-${chapter}.png`,
    });
    expect(after).not.toEqual(before);
    await page.clock.resume();
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/tests/fixtures/atmosphere.html?chapter=1");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(new Date(now + 200));
  const before = await page.locator("canvas").screenshot();
  await page.clock.runFor(8000);
  expect(await page.locator("canvas").screenshot()).toEqual(before);
  await page.getByRole("button", { name: "Toggle mist" }).click();
  await page.clock.runFor(80);
  expect(await page.locator("canvas").screenshot()).not.toEqual(before);
  expect(errors).toEqual([]);
});
