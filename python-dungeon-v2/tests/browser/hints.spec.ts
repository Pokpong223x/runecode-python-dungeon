import { test, expect, type Page } from "@playwright/test";
import { ENCOUNTERS } from "../../src/content";
import { LEARNING_EXAMPLES } from "../../src/learningExamples";
import { startCombat } from "../../src/engine";
import { freshSave } from "../../src/storage";
import type { SaveGameV1 } from "../../src/types";
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
    name: "isolated-hint-checkpoint.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(save)),
  });
  await page
    .getByRole("button", { name: "ใช้บันทึกจากไฟล์นี้", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "รันโค้ด", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
}

async function exportedSave(page: Page): Promise<SaveGameV1> {
  await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "ส่งออกไฟล์", exact: true }).click();
  const stream = await (await pending).createReadStream();
  let json = "";
  for await (const chunk of stream!) json += chunk.toString();
  await page.getByRole("button", { name: "ปิดหน้าต่าง", exact: true }).click();
  return JSON.parse(json);
}

async function showExample(page: Page) {
  await page.getByRole("button", { name: "ขอคำใบ้", exact: true }).click();
  await page.getByRole("button", { name: "คำใบ้ถัดไป", exact: true }).click();
  await page.getByRole("button", { name: "คำใบ้ถัดไป", exact: true }).click();
  const hints = page.getByRole("complementary", { name: /คำใบ้ 3\/3/ });
  await expect(hints).toBeVisible();
  return hints;
}

test("hint navigation and prediction use the keyboard without changing code or any saved field", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 500 });
  await page.goto("/");
  const ownCode = '# แผนที่ฉันคิดเอง\nprint("Moon", "Gate")\nattack(1)';
  await importRoom(page, "1-1", ownCode);
  const before = await exportedSave(page);
  const trigger = page.locator(".hint-button");
  await trigger.focus();
  await trigger.press("Enter");
  let hints = page.getByRole("complementary", { name: /คำใบ้ 1\/3/ });
  await expect(hints.getByRole("status")).toContainText("ชี้แนวคิด");
  await hints.getByRole("button", { name: "ปิดคำใบ้", exact: true }).click();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveText("ขอคำใบ้");

  hints = await showExample(page);
  const code = hints.getByRole("region", { name: "โค้ดตัวอย่างฝึก" });
  const output = hints.getByRole("region", { name: "ผลลัพธ์ตัวอย่าง" });
  const prediction = hints.locator(".hint-prediction > summary");
  await expect(code).toHaveText(LEARNING_EXAMPLES.print.code);
  await expect(output).not.toBeVisible();
  await code.focus();
  await code.press("Control+Enter");
  await expect(
    page.getByRole("button", { name: "รันโค้ด", exact: true }),
  ).toBeEnabled();
  await prediction.focus();
  await prediction.press("Enter");
  await expect(output).toHaveText(LEARNING_EXAMPLES.print.output.join("\n"));
  await prediction.press("Space");
  await expect(output).not.toBeVisible();
  await hints
    .getByRole("button", { name: "คำใบ้ก่อนหน้า", exact: true })
    .click();
  hints = page.getByRole("complementary", { name: /คำใบ้ 2\/3/ });
  await expect(hints.getByRole("status")).toContainText("ลองสังเกต");
  await hints
    .getByRole("button", { name: "คำใบ้ก่อนหน้า", exact: true })
    .click();
  await expect(trigger).toBeFocused();
  await expect(
    page.getByRole("complementary", { name: /คำใบ้ 1\/3/ }),
  ).toBeVisible();
  await trigger.press("Enter");
  await trigger.press("Enter");
  hints = page.getByRole("complementary", { name: /คำใบ้ 3\/3/ });
  await expect(hints.locator(".hint-prediction")).not.toHaveAttribute(
    "open",
    "",
  );
  await page.getByRole("button", { name: "ซ่อนคำใบ้", exact: true }).click();
  await expect(page.locator(".hint-box")).toHaveCount(0);
  expect(await exportedSave(page)).toEqual(before);

  await showExample(page);
  await page.reload();
  await expect(page.locator(".hint-box")).toHaveCount(0);
  const editor = page.getByRole("textbox", { name: "เขียนโค้ด Python" });
  await expect(editor).toContainText("แผนที่ฉันคิดเอง");
  expect(await exportedSave(page)).toEqual(before);
  await expect(
    page.getByRole("button", { name: "รันโค้ด", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  await editor.press("Control+Enter");
  await expect(page.getByTestId("python-output")).toContainText("รันสำเร็จ");
  await expect(
    page.getByRole("button", { name: "รันโค้ด", exact: true }),
  ).toBeEnabled();
  const after = await exportedSave(page);
  expect(after.battle!.turn).toBe(before.battle!.turn + 1);
  expect(after.battle!.enemyHp).toBeLessThan(before.battle!.enemyHp);
  expect(after.battle!.mistakes).toBe(before.battle!.mistakes);
  expect(after.drafts["1-1"]).toBe(ownCode);
  expect(errors).toEqual([]);
});

test("neutral examples fit all viewport groups, keep player ownership and never replace a draft", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const ownCode = '# ร่างที่ฉันเก็บไว้\nprint("ฉันจะลองเอง")';
  for (const sample of [
    { room: "1-3", width: 360, height: 800 },
    { room: "3-3", width: 390, height: 800 },
    { room: "4-3", width: 390, height: 500 },
    { room: "5-2", width: 768, height: 1000 },
    { room: "6-3", width: 1440, height: 1000 },
    { room: "6-4", width: 390, height: 800 },
  ]) {
    await page.setViewportSize({ width: sample.width, height: sample.height });
    await importRoom(page, sample.room, ownCode);
    const before = await exportedSave(page);
    const room = ENCOUNTERS.find((encounter) => encounter.id === sample.room)!;
    const example = LEARNING_EXAMPLES[room.contract.concepts[0]];
    const hints = await showExample(page);
    const code = hints.getByRole("region", { name: "โค้ดตัวอย่างฝึก" });
    await expect(code).toHaveText(example.code);
    expect(await code.innerText()).not.toMatch(
      /(?:attack|defend|skill|heal|focus)\s*\(/,
    );
    await expect(hints).toContainText(example.question);
    await expect(hints).toContainText(room.hints[2]);
    for (const element of [code, hints.locator(":scope > p")])
      expect(
        await element.evaluate((el) =>
          parseFloat(getComputedStyle(el).fontSize),
        ),
      ).toBeGreaterThanOrEqual(16);
    expect(
      await code.evaluate((el) => getComputedStyle(el).fontFamily),
    ).toMatch(/Consolas|Menlo|monospace/);
    for (const button of await hints.getByRole("button").all())
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const prediction = hints.locator(".hint-prediction > summary");
    expect((await prediction.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await prediction.click();
    await expect(
      hints.getByRole("region", { name: "ผลลัพธ์ตัวอย่าง" }),
    ).toHaveText(example.output.join("\n"));
    await prediction.click();
    expect(
      await hints.evaluate((el) => Boolean(el.closest(".coding-column"))),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (sample.width === 1440) {
      const scene = (await page.locator(".pixel-scene").boundingBox())!;
      expect((await hints.boundingBox())!.x).toBeGreaterThanOrEqual(
        scene.x + scene.width,
      );
    }
    await expect(page.locator(".toast")).not.toBeVisible();
    await hints.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `.verification/hint-${info.project.name}-${sample.room}-${sample.width}.png`,
    });
    expect(await exportedSave(page)).toEqual(before);
    await expect(
      page.getByRole("textbox", { name: "เขียนโค้ด Python" }),
    ).toContainText("ฉันจะลองเอง");
  }
  // A new imported room starts with a closed hint even after the prior room's
  // example was open; this transient help state never enters SaveGameV1.
  await importRoom(page, "1-1", ownCode);
  await expect(page.locator(".hint-box")).toHaveCount(0);
  await writePython(page, 'print("ลองเองต่อ")\nattack()');
  await expect(
    page.getByRole("textbox", { name: "เขียนโค้ด Python" }),
  ).toContainText("ลองเองต่อ");
  expect(errors).toEqual([]);
});
