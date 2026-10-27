import { test, expect } from "@playwright/test";
import { writePython } from "./input";

test("capture every hero through anticipation, contact and recovery at desktop and phone widths", async ({
  browser,
}, info) => {
  test.setTimeout(120000);
  for (const [hero, slug] of [
    ["นักผจญภัย", "adventurer"],
    ["อัศวิน", "knight"],
    ["พ่อมด", "wizard"],
  ]) {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({
        baseURL: info.project.use.baseURL,
        viewport: { width, height: 1000 },
      });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      try {
        await page.clock.install();
        await page.goto("/");
        await page
          .locator(".hero-card")
          .filter({
            has: page.getByRole("heading", { name: hero, exact: true }),
          })
          .click();
        await page
          .getByRole("button", { name: "เริ่มการผจญภัย", exact: true })
          .click();
        await page.locator(".encounter-row").first().click();
        const run = page.getByRole("button", { name: "รันโค้ด", exact: true });
        await expect(run).toBeEnabled({ timeout: 60000 });
        await writePython(page, 'print("Moon", "Gate")\nskill(1)\nheal()');
        const now = await page.evaluate(() => Date.now());
        await page.clock.pauseAt(new Date(now + 250));
        await run.click();
        await expect(page.locator(".pixel-scene")).toHaveAttribute(
          "aria-busy",
          "true",
        );
        let elapsed = 0;
        for (const at of [80, 160, 280, 400, 500, 700, 1000, 1500]) {
          await page.clock.runFor(at - elapsed);
          elapsed = at;
          await page.locator(".scene-frame").screenshot({
            path: `.verification/intact-${info.project.name}-${slug}-${width}-${at}.png`,
            animations: "disabled",
          });
        }
        await page.clock.runFor(4000);
        await expect(page.locator(".pixel-scene")).toHaveAttribute(
          "aria-busy",
          "false",
        );
        expect(errors).toEqual([]);
      } finally {
        await context.close();
      }
    }
  }
});
