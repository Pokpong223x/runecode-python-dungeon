import { test, expect, type Page } from "@playwright/test";
import { ENCOUNTERS, HEROES } from "../../src/content";
import { startCombat } from "../../src/engine";
import { freshSave, validateSave } from "../../src/storage";
import type { HeroId, SaveGameV1 } from "../../src/types";
import { writePython } from "./input";

function completedSave(hero: HeroId, perfect = false) {
  const save = freshSave();
  save.hero = hero;
  save.onboarding = true;
  save.completed = ENCOUNTERS.map((e) => e.id);
  save.stars = Object.fromEntries(ENCOUNTERS.map((e) => [e.id, 3]));
  if (!perfect) save.stars["1-1"] = 1;
  save.gold = 1000;
  save.battle = { ...startCombat(save, "6-4"), status: "won", enemyHp: 0 };
  save.drafts["1-1"] = 'print("แผนที่ฉันปรับแล้ว")\nskill()\nattack()';
  return save;
}
async function importSave(page: Page, save: SaveGameV1) {
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "บทสรุปการผจญภัย" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "completed-journey.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(save)),
  });
  await page
    .getByRole("button", { name: "ใช้บันทึกจากไฟล์นี้", exact: true })
    .click();
}

for (const hero of Object.keys(HEROES) as HeroId[]) {
  test(`completed journey remains useful, responsive and exportable: ${hero}`, async ({
    page,
  }, info) => {
    await importSave(page, completedSave(hero));
    const summary = page.getByRole("region", { name: "บทสรุปการผจญภัย" });
    await expect(summary).toContainText(HEROES[hero].name);
    await expect(summary).toContainText("24 / 24");
    await expect(summary).toContainText("6 / 6");
    await expect(summary).toContainText("70 / 72");
    for (const width of [1440, 360, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(() =>
        [...document.querySelectorAll("body *")]
          .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
          .slice(0, 10)
          .map((el) => ({
            tag: el.tagName,
            class: el.className,
            right: el.getBoundingClientRect().right,
          })),
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        JSON.stringify(overflow),
      ).toBe(true);
      expect(
        await summary.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      for (const button of await summary.getByRole("button").all())
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await summary.screenshot({
        path: `.verification/campaign-${info.project.name}-${hero}-${width}.png`,
      });
    }
    const journal = summary.getByRole("button", {
      name: "เปิดสมุดบทเรียน",
      exact: true,
    });
    await journal.click();
    await expect(
      page.getByRole("dialog", { name: "สมุดของนักโค้ด" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(journal).toBeFocused();
    const download = page.waitForEvent("download");
    await summary
      .getByRole("button", { name: "ส่งออกบันทึก", exact: true })
      .click();
    const stream = await (await download).createReadStream();
    let json = "";
    for await (const chunk of stream!) json += chunk.toString();
    const exported = JSON.parse(json);
    expect(validateSave(exported)).toBe(true);
    expect(exported.hero).toBe(hero);
    expect(exported.completed).toHaveLength(24);
    expect(exported.stars["1-1"]).toBe(1);
    await page.reload();
    await expect(summary).toContainText("70 / 72");
  });
}

test("practice improves saved stars without paying first-clear gold twice", async ({
  page,
}) => {
  await importSave(page, completedSave("adventurer"));
  const summary = page.getByRole("region", { name: "บทสรุปการผจญภัย" });
  await summary
    .getByRole("button", { name: "ฝึกเก็บดาว", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: ENCOUNTERS[0].title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "รันโค้ด", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  // Old drafts remain importable; selecting normal attack updates the old mixed plan.
  const tools = page.getByRole("region", { name: "สกิลฝั่งผู้เล่น" });
  await expect(
    tools.locator(".skill-mode-help[data-offense-mode]"),
  ).toHaveAttribute("data-offense-mode", "mixed");
  await tools.getByRole("button", { name: /^โจมตีปกติ/ }).click();
  // Old drafts remain untouched by migration, but must meet the restored exercise.
  await page.getByRole("button", { name: "ตรวจแผน", exact: true }).click();
  await expect(page.getByTestId("python-output")).toContainText(
    "Use one offensive command per plan",
  );
  await writePython(page, ENCOUNTERS[0].solutions[0]);
  // One attack each turn; the second enemy turn halves that hit with its shield.
  for (let turn = 0; turn < 4; turn++) {
    await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
    await expect(page.locator(".pixel-scene")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await expect(page.locator(".pixel-scene")).toHaveAttribute(
      "aria-busy",
      "false",
    );
  }
  await expect(page.locator(".result-panel.won")).toBeVisible();
  await expect(page.locator(".star-caption")).toContainText(
    "รอบนี้ 3/3 · สถิติดีที่สุด 3/3",
  );
  await expect(page.locator(".gold-count")).toContainText("1,000");
  await page.getByRole("button", { name: "กลับแผนที่", exact: true }).click();
  await expect(summary).toContainText("72 / 72");
  await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
  await page.reload();
  await expect(summary).toContainText("72 / 72");
});

test("a low-HP replay explains this run while preserving the best score", async ({
  page,
}) => {
  const save = completedSave("adventurer", true);
  save.battle = { ...startCombat(save, "1-1"), hp: 25, enemyHp: 1 };
  await importSave(page, save);
  const run = page.getByRole("button", { name: "รันโค้ด", exact: true });
  await expect(run).toBeEnabled({ timeout: 60000 });
  await writePython(page, 'print("Moon", "Gate")\nskill(1)\ndefend()');
  await run.click();
  await expect(page.locator(".result-panel.won")).toBeVisible();
  await expect(page.locator(".star-caption")).toContainText(
    "รอบนี้ 1/3 · สถิติดีที่สุด 3/3",
  );
  await expect(page.locator(".gold-count")).toContainText("1,000");
});
