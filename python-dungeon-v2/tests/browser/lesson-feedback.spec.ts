import { test, expect, type Page } from "@playwright/test";
import { ENCOUNTERS } from "../../src/content";
import { startCombat } from "../../src/engine";
import { freshSave } from "../../src/storage";
import type { CombatState } from "../../src/types";
import { writePython } from "./input";

async function importRoom(page: Page, room: string, code: string) {
  const save = freshSave();
  save.hero = "adventurer";
  save.onboarding = true;
  save.settings.reducedMotion = true;
  save.completed = ENCOUNTERS.slice(
    0,
    ENCOUNTERS.findIndex((e) => e.id === room),
  ).map((e) => e.id);
  save.battle = startCombat(save, room);
  save.drafts[room] = code;
  await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "isolated-correction-checkpoint.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(save)),
  });
  await page
    .getByRole("button", { name: "ใช้บันทึกจากไฟล์นี้", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "รันโค้ด", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
}

async function exportedBattle(page: Page): Promise<CombatState> {
  await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "ส่งออกไฟล์", exact: true }).click();
  const stream = await (await pending).createReadStream();
  let json = "";
  for await (const chunk of stream!) json += chunk.toString();
  await page.getByRole("button", { name: "ปิดหน้าต่าง", exact: true }).click();
  return JSON.parse(json).battle;
}

async function commitCorrection(page: Page, good: string, before: CombatState) {
  await writePython(page, good);
  await page.getByRole("button", { name: "ตรวจแผน", exact: true }).click();
  const preview = page.getByRole("region", { name: "ผลตรวจแผน" });
  await expect(preview).toBeVisible();
  expect(await exportedBattle(page)).toEqual(before);
  await preview.getByRole("button", { name: "รันแผนนี้", exact: true }).click();
  await expect(page.getByTestId("python-output")).toContainText("รันสำเร็จ");
  await expect(
    page.getByRole("button", { name: "ตรวจแผน", exact: true }),
  ).toBeEnabled();
  const after = await exportedBattle(page);
  expect(after.turn).toBe(before.turn + 1);
  expect(after.enemyHp).toBeLessThan(before.enemyHp);
  expect(after.mistakes).toBe(before.mistakes);
}

test("Thai concept correction points to the actual declaration and never invents an absent line", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 500 });
  await page.goto("/");
  await importRoom(
    page,
    "5-1",
    'print("พร้อม")\ndef spark():\n    return 3\nattack(3)',
  );
  const before = await exportedBattle(page);
  await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
  const diagnostic = page.locator(".diagnostic-message");
  const editor = page.getByRole("textbox", { name: "เขียนโค้ด Python" });
  await expect(diagnostic).toContainText("บอดียังไม่ถูกเรียก");
  await expect(diagnostic).toBeInViewport({ ratio: 1 });
  await expect(editor).not.toBeFocused();
  await expect(page.locator('.cm-error-line[data-error-line="2"]')).toHaveCount(
    1,
  );
  await expect(page.locator(".toast")).not.toBeVisible();
  await page.screenshot({
    path: `.verification/lesson-feedback-${info.project.name}-function-390.png`,
  });
  await page.getByRole("button", { name: "ไปบรรทัด 2", exact: true }).click();
  await expect(editor).toBeFocused();
  expect(
    await page.evaluate(
      () =>
        window.getSelection()?.anchorNode?.parentElement?.closest(".cm-line")
          ?.textContent,
    ),
  ).toBe("def spark():");
  expect(await exportedBattle(page)).toEqual(before);

  await writePython(page, "attack(2)");
  await page.getByRole("button", { name: "ตรวจแผน", exact: true }).click();
  await expect(diagnostic).toContainText(
    "สร้างฟังก์ชันด้วย def แล้วเรียกใช้งาน",
  );
  await expect(diagnostic.getByRole("button")).toHaveCount(0);
  await expect(page.locator(".cm-error-line")).toHaveCount(0);
  expect(await exportedBattle(page)).toEqual(before);
  await commitCorrection(
    page,
    "def spark():\n    return 3\ncast = spark\nattack(cast())\ndefend()",
    before,
  );
  await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
  await page.reload();
  await expect(editor).toContainText("cast = spark");
  expect(errors).toEqual([]);
});

test("Thai return and runtime explanations retain original lines and recover through real Python", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  for (const sample of [
    {
      room: "5-2",
      name: "return",
      bad: "def power(amount):\n    if amount > 0:\n        return amount * 2\nprint(power(0))\nattack()",
      good: "def boost(number):\n    return number + 1\nattack(boost(1))\ndefend()",
      line: 3,
      text: "return ยังไม่ทำงาน",
      width: 1440,
    },
    {
      room: "3-1",
      name: "index",
      bad: 'bag = ["ดาบ", "โล่"]\nprint("พร้อม")\nprint(bag[2])\nattack()',
      good: "supplies = list((4, 7, 2))\nprint(supplies[-1])\nattack(supplies[2])\ndefend()",
      line: 3,
      text: "ดัชนีเริ่มจาก 0",
      width: 390,
    },
    {
      room: "3-2",
      name: "attribute",
      bad: "point = (2, 3)\npoint.append(4)\nattack()",
      good: "bearings = tuple([8, 5, 3])\nprint(bearings[2])\nattack(bearings[2])\ndefend()",
      line: 2,
      text: "คุณสมบัติหรือเมธอด",
      width: 1440,
    },
  ]) {
    await page.setViewportSize({
      width: sample.width,
      height: sample.width === 390 ? 500 : 1000,
    });
    await importRoom(page, sample.room, sample.bad);
    const before = await exportedBattle(page);
    await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
    const diagnostic = page.locator(".diagnostic-message");
    await expect(diagnostic).toContainText(sample.text);
    await expect(diagnostic).toBeInViewport({ ratio: 1 });
    await expect(
      page.locator(`.cm-error-line[data-error-line="${sample.line}"]`),
    ).toHaveCount(1);
    await expect(page.locator(".toast")).not.toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.verification/lesson-feedback-${info.project.name}-${sample.name}-${sample.width}.png`,
    });
    await page
      .getByRole("button", { name: `ไปบรรทัด ${sample.line}`, exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "เขียนโค้ด Python" }),
    ).toBeFocused();
    expect(await exportedBattle(page)).toEqual(before);
    await commitCorrection(page, sample.good, before);
  }
  expect(errors).toEqual([]);
});
