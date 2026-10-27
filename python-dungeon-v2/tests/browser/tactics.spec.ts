import { test, expect, type Page } from "@playwright/test";
import { ENCOUNTERS } from "../../src/content";
import { intentFor, startCombat } from "../../src/engine";
import { freshSave } from "../../src/storage";
import type { SaveGameV1 } from "../../src/types";
import { writePython } from "./input";

async function importCheckpoint(page: Page, save: SaveGameV1) {
  await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "tactics-checkpoint.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(save)),
  });
  await page
    .getByRole("button", { name: "ใช้บันทึกจากไฟล์นี้", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "รันโค้ด", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  await expect(page.locator(".pixel-scene canvas")).toBeVisible();
}
function checkpoint() {
  const save = freshSave();
  save.hero = "adventurer";
  save.onboarding = true;
  save.completed = ENCOUNTERS.slice(0, 3).map((e) => e.id);
  save.battle = startCombat(save, "1-4");
  return save;
}
async function cast(page: Page, code: string) {
  // Preserve the exact action sequence being measured while meeting the
  // expanded first-boss print/sequence/comment mission.
  await writePython(
    page,
    `# อ่านท่าบอสก่อนลงมือ\nprint("ทดสอบแผนรับมือ")\n${code}`,
  );
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

test("boss stages follow real damage, persist on reload and clear after victory", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const save = checkpoint();
  save.battle!.enemyHp = 70;
  await importCheckpoint(page, save);
  const enemy = page.getByRole("region", { name: "ท่าถัดไปฝั่งศัตรู" });
  await expect(enemy.getByLabel("บอส ช่วงที่ 1 จาก 3")).toBeVisible();
  await cast(page, "skill()\ndefend()");
  await expect(enemy.getByLabel("บอส ช่วงที่ 2 จาก 3")).toBeVisible();
  await expect(enemy.getByTestId("enemy-intent")).toHaveText("ตั้งโล่");
  await expect(page.getByRole("progressbar").last()).toHaveAttribute(
    "aria-valuenow",
    "42",
  );
  await page.screenshot({
    path: `.verification/tactics-phase2-${info.project.name}.png`,
    fullPage: true,
  });
  await page.reload();
  await expect(enemy.getByLabel("บอส ช่วงที่ 2 จาก 3")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "รันโค้ด", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  await cast(page, "skill()\ndefend()");
  await expect(enemy.getByLabel("บอส ช่วงที่ 3 จาก 3")).toBeVisible();
  await expect(enemy.getByTestId("enemy-intent")).toHaveText("พิษเงา");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: `.verification/tactics-phase3-${info.project.name}-390.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await cast(page, "skill()\ndefend()");
  await expect(page.locator(".result-panel.won")).toBeVisible();
  await expect(enemy.getByTestId("enemy-intent")).toHaveText("ศัตรูพ่ายแพ้");
  await expect(enemy.locator(".boss-phase")).toHaveCount(0);
});

test("poison is grouped with the player, survives reload and expires after two counters", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");
  const save = checkpoint();
  save.battle!.turn = 5;
  save.battle!.intent = intentFor(
    "1-4",
    5,
    save.battle!.enemyHp,
    save.battle!.maxEnemyHp,
  );
  await importCheckpoint(page, save);
  const effect = page.getByRole("status", { name: "สถานะผู้เล่น" });
  await expect(effect).toHaveCount(0);
  await cast(page, "attack()\ndefend()");
  await expect(effect).toContainText("เหลือ 2 เทิร์น");
  await expect(
    page.locator(".coding-column .player-controls .player-effect"),
  ).toBeVisible();
  await expect(page.locator(".combat-column .player-effect")).toHaveCount(0);
  await expect(page.getByRole("progressbar").first()).toHaveAttribute(
    "aria-valuenow",
    "105",
  );
  await page.screenshot({
    path: `.verification/tactics-poison-${info.project.name}-360.png`,
    fullPage: true,
  });
  await page.reload();
  await expect(effect).toContainText("เหลือ 2 เทิร์น");
  await expect(
    page.getByRole("button", { name: "ตรวจแผน", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  await page.getByRole("button", { name: "ตรวจแผน", exact: true }).click();
  await expect(page.getByRole("region", { name: "ผลตรวจแผน" })).toContainText(
    "105 → 101",
  );
  await expect(effect).toContainText("เหลือ 2 เทิร์น");
  await page.getByRole("button", { name: "รันแผนนี้", exact: true }).click();
  await expect(page.locator(".pixel-scene")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await expect(page.locator(".pixel-scene")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(effect).toContainText("เหลือ 1 เทิร์น");
  await expect(page.getByRole("progressbar").first()).toHaveAttribute(
    "aria-valuenow",
    "101",
  );
  await cast(page, "attack()\ndefend()");
  await expect(effect).toHaveCount(0);
});

test("heavy and shield advice matches actual class rules without obscuring controls", async ({
  page,
}) => {
  await page.goto("/");
  const save = checkpoint();
  save.battle!.turn = 2;
  save.battle!.intent = intentFor(
    "1-4",
    2,
    save.battle!.enemyHp,
    save.battle!.maxEnemyHp,
  );
  await importCheckpoint(page, save);
  const enemy = page.getByRole("region", { name: "ท่าถัดไปฝั่งศัตรู" });
  await expect(enemy).toContainText("defend() จะรับดาเมจจากท่านี้ 9 HP");
  await cast(page, "attack()\ndefend()");
  await expect(page.getByRole("progressbar").first()).toHaveAttribute(
    "aria-valuenow",
    "101",
  );
  save.hero = "wizard";
  save.battle = startCombat(save, "1-4");
  save.battle.turn = 3;
  save.battle.intent = intentFor(
    "1-4",
    3,
    save.battle.enemyHp,
    save.battle.maxEnemyHp,
  );
  await importCheckpoint(page, save);
  await expect(enemy).toContainText("skill() ของพ่อมดทะลุโล่ได้");
});
