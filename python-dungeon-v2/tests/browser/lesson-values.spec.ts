import { test, expect, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { ENCOUNTERS } from "../../src/content";
import { startCombat } from "../../src/engine";
import { freshSave } from "../../src/storage";
import { writePython } from "./input";

const samples = [
  {
    room: "2-2",
    concept: "string",
    bad: 'label = "Moon"\nlabel = 99\nprint(label)\nattack(2)',
    good: 'label: str = "Moon ".strip()\nprint(label)\nattack(2)\ndefend()',
    output: "Moon",
  },
  {
    room: "3-1",
    concept: "list",
    bad: 'supplies = [4, 7, 2]\nsupplies = "abc"\nprint(len(supplies))\nattack(len(supplies))',
    good: "supplies = list((4, 7, 2))\nprint(supplies[2])\nattack(supplies[2])\ndefend()",
    output: "2",
  },
  {
    room: "3-2",
    concept: "tuple",
    bad: "bearings = (8, 5, 3)\nbearings = [8, 5, 3]\nprint(bearings[2])\nattack(bearings[2])",
    good: "bearings = tuple([8, 5, 3])\nprint(bearings[2])\nattack(bearings[2])\ndefend()",
    output: "3",
  },
  {
    room: "3-3",
    concept: "set",
    bad: 'signals = {"sun", "moon", "sun"}\nsignals = {"sun": 1, "moon": 2}\nprint(len(signals))\nattack(len(signals))',
    good: 'signals = set(["sun", "moon", "sun"])\nprint(len(signals))\nattack(len(signals))\ndefend()',
    output: "2",
  },
];

async function exportedBattle(page: Page) {
  await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "ส่งออกไฟล์", exact: true }).click();
  const stream = await (await pending).createReadStream();
  let json = "";
  for await (const chunk of stream!) json += chunk.toString();
  await page.getByRole("button", { name: "ปิดหน้าต่าง", exact: true }).click();
  return JSON.parse(json).battle;
}

test("workers accept computed strings and constructed collections using their real types", async ({
  page,
}, info) => {
  const errors: string[] = [];
  const evidence: object[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  for (const sample of samples) {
    const width = sample.room === "2-2" || sample.room === "3-3" ? 390 : 1440;
    await page.setViewportSize({ width, height: 900 });
    const save = freshSave();
    save.hero = "adventurer";
    save.onboarding = true;
    save.settings.reducedMotion = true;
    save.completed = ENCOUNTERS.slice(
      0,
      ENCOUNTERS.findIndex((e) => e.id === sample.room),
    ).map((e) => e.id);
    save.battle = startCombat(save, sample.room);
    save.drafts[sample.room] = sample.bad;
    await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
    await page.locator("input[type=file]").setInputFiles({
      name: "isolated-value-checkpoint.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(save)),
    });
    await page
      .getByRole("button", { name: "ใช้บันทึกจากไฟล์นี้", exact: true })
      .click();
    const check = page.getByRole("button", { name: "ตรวจแผน", exact: true });
    const output = page.getByTestId("python-output");
    const preview = page.getByRole("region", { name: "ผลตรวจแผน" });
    await expect(check).toBeEnabled({ timeout: 60000 });
    const before = await exportedBattle(page);
    await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
    await expect(output).toContainText(
      `ยังไม่พบการใช้แนวคิด ${sample.concept}`,
    );
    await expect(check).toBeEnabled();
    await expect(preview).not.toBeVisible();
    expect(await exportedBattle(page)).toEqual(before);

    await writePython(page, sample.good);
    await check.click();
    await expect(preview).toBeVisible();
    await expect(output).toContainText("ตรวจแผนผ่าน");
    await expect(output).toContainText(sample.output);
    expect(await exportedBattle(page)).toEqual(before);
    await expect(page.locator(".toast")).not.toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.verification/lesson-values-${info.project.name}-${sample.concept}-${width}.png`,
      fullPage: true,
    });
    await preview
      .getByRole("button", { name: "รันแผนนี้", exact: true })
      .click();
    await expect(output).toContainText("รันสำเร็จ");
    await expect(check).toBeEnabled();
    const after = await exportedBattle(page);
    expect(after.turn).toBe(before.turn + 1);
    expect(after.enemyHp).toBeLessThan(before.enemyHp);
    expect(after.mistakes).toBe(before.mistakes);
    evidence.push({
      room: sample.room,
      concept: sample.concept,
      code: sample.good,
      output: sample.output,
      invalidCheckpointUnchanged: true,
      previewCheckpointUnchanged: true,
      before,
      after,
    });
  }
  expect(errors).toEqual([]);
  await writeFile(
    `.verification/lesson-values-${info.project.name}.json`,
    JSON.stringify(evidence, null, 2),
  );
});
