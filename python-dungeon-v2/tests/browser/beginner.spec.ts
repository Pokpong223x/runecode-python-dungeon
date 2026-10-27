import { test, expect } from "@playwright/test";
import { ENCOUNTERS } from "../../src/content";
import { freshSave } from "../../src/storage";
import { startCombat } from "../../src/engine";
import { writePython } from "./input";

test("later beginner lessons provide a scaffold that works after one small fill", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 850 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  for (const [id, answer] of [
    ["5-1", "3"],
    ["5-2", "1"],
    ["5-3", "2.9"],
    ["6-1", "3"],
    ["6-2", "2"],
    ["6-3", "2"],
  ]) {
    const room = ENCOUNTERS.find((room) => room.id === id)!;
    const save = freshSave();
    save.hero = "adventurer";
    save.onboarding = true;
    save.settings.reducedMotion = true;
    save.completed = ENCOUNTERS.slice(0, ENCOUNTERS.indexOf(room)).map(
      (room) => room.id,
    );
    save.battle = startCombat(save, id);
    await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
    await page.locator("input[type=file]").setInputFiles({
      name: "beginner-scaffold.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(save)),
    });
    await page
      .getByRole("button", { name: "ใช้บันทึกจากไฟล์นี้", exact: true })
      .click();
    const check = page.getByRole("button", { name: "ตรวจแผน", exact: true });
    await expect(check).toBeEnabled({ timeout: 60000 });
    // No saved draft: later chapters must display the supplied starter too.
    await expect
      .poll(() => page.locator(".cm-line").allTextContents())
      .toEqual(room.starter.split("\n"));
    expect(room.starter.match(/\.\.\./g)).toHaveLength(1);
    await writePython(page, room.starter.replace("...", answer));
    await check.click();
    await expect(page.getByRole("region", { name: "ผลตรวจแผน" })).toBeVisible();
    await expect(page.getByTestId("python-output")).toContainText(
      "ตรวจแผนผ่าน",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (id === "6-2")
      await page.screenshot({
        path: `.verification/beginner-${info.project.name}-method-390.png`,
        fullPage: true,
      });
  }
  expect(errors).toEqual([]);
});
