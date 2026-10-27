import { test, expect, type Page } from "@playwright/test";
import { freshSave } from "../../src/storage";
import { startCombat } from "../../src/engine";
import type { HeroId, SaveGameV1 } from "../../src/types";
import { writePython } from "./input";

function checkpoint(hero: HeroId = "adventurer") {
  const save = freshSave();
  save.hero = hero;
  save.onboarding = true;
  save.settings.reducedMotion = true;
  save.battle = startCombat(save, "1-1");
  save.battle.mistakes = 7; // A valid old save must stay compatible and unpenalized.
  save.gold = 12;
  save.notes = "บันทึกเดิม";
  return save;
}
async function importSave(page: Page, save: SaveGameV1) {
  await page.goto("/");
  await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "isolated-learning-checkpoint.json",
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
async function exported(page: Page) {
  await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "ส่งออกไฟล์", exact: true }).click();
  const stream = await (await pending).createReadStream();
  let json = "";
  for await (const chunk of stream!) json += chunk.toString();
  await page.getByRole("button", { name: "ปิดหน้าต่าง", exact: true }).click();
  return JSON.parse(json) as SaveGameV1;
}
function progress(save: SaveGameV1) {
  const { revision, updatedAt, drafts, ...unchanged } = save;
  return unchanged;
}

test("invalid Run preserves the entire combat checkpoint, rewards and legacy save data", async ({
  page,
}) => {
  const save = checkpoint();
  save.battle!.hp = 90;
  save.battle!.mp = 0;
  save.battle!.potions = save.potions = 0;
  await importSave(page, save);
  const before = await exported(page);
  for (const [code, message] of [
    ['print("Moon", "Gate")\nattack(4)', "พลังต้องเป็นจำนวนเต็ม"],
    [" ", "เริ่มเขียนโค้ด"],
    ["print(\nattack()", "รูปแบบโค้ดยังไม่ถูก"],
    ["if True:\nattack()", "การย่อหน้ายังไม่ถูก"],
    ["attack(1)", "ยังไม่พบ"],
    ['print("Moon", "Gate")\nskill(1)\ndefend()\ndefend()', "ใช้ 4 AP"],
    ['print("Moon", "Gate")\nskill(1)', "MP ไม่พอ"],
    ['print("Moon", "Gate")\nattack(1)\nheal()', "ยาไม่พอ"],
    ['print("คำสั่งมากไป")\nfor i in range(4): attack()', "ออกคำสั่งเกิน"],
    ['print("x" * 9000)\nattack()', "ผลพิมพ์มากเกินไป"],
    ['for i in range(129): print("")\nattack()', "ผลพิมพ์มากเกินไป"],
    ["print(missing)\nattack()", "ยังไม่รู้จักชื่อนี้"],
  ]) {
    await writePython(page, code);
    await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
    await expect(page.getByTestId("python-output")).toContainText(message);
    await expect(
      page.getByRole("button", { name: "รันโค้ด", exact: true }),
    ).toBeEnabled();
    expect(progress(await exported(page)), code).toEqual(progress(before));
    await expect(page.locator(".pixel-scene")).toHaveAttribute(
      "aria-busy",
      "false",
    );
  }
  await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "รันโค้ด", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  expect(progress(await exported(page))).toEqual(progress(before));
  await expect(
    page.getByRole("textbox", { name: "เขียนโค้ด Python" }),
  ).toContainText("missing");
});

test("timeout, Stop, navigation and preview preserve the checkpoint and corrected code still commits", async ({
  page,
}) => {
  await importSave(page, checkpoint());
  const before = await exported(page);
  const run = page.getByRole("button", { name: "รันโค้ด", exact: true });
  await writePython(page, "while True:\n    pass");
  await run.click();
  await expect(page.getByTestId("python-output")).toContainText("3 วินาที");
  await expect(run).toBeEnabled({ timeout: 60000 });
  expect(progress(await exported(page))).toEqual(progress(before));
  await run.click();
  await page.getByRole("button", { name: "หยุด", exact: true }).click();
  await expect(page.getByTestId("python-output")).toContainText("หยุดแล้ว");
  await expect(run).toBeEnabled({ timeout: 60000 });
  expect(progress(await exported(page))).toEqual(progress(before));
  await run.click();
  await page
    .getByRole("button", { name: "แผนที่", exact: true })
    .first()
    .click();
  expect(progress(await exported(page))).toEqual(progress(before));
  await page.locator(".encounter-row").first().click();
  await expect(run).toBeEnabled({ timeout: 60000 });
  await expect(
    page.getByRole("textbox", { name: "เขียนโค้ด Python" }),
  ).toContainText("while True");
  await writePython(page, 'print("Moon", "Gate")\nattack(1)');
  await page.getByRole("button", { name: "ตรวจแผน", exact: true }).click();
  await expect(page.getByRole("region", { name: "ผลตรวจแผน" })).toBeVisible();
  expect(progress(await exported(page))).toEqual(progress(before));
  await run.click();
  await expect(page.getByTestId("python-output")).toContainText("รันสำเร็จ");
  await expect(run).toBeEnabled();
  const after = await exported(page);
  expect(after.battle!.turn).toBe(before.battle!.turn + 1);
  expect(after.battle!.enemyHp).toBe(25);
  expect(after.battle!.mistakes).toBe(7);
  expect(after.gold).toBe(before.gold);
});

for (const [hero, hp, stars, ranges] of [
  ["adventurer", 67, 3, ["67–110", "34–66", "1–33"]],
  ["knight", 84, 2, ["85–140", "43–84", "1–42"]],
  ["wizard", 28, 1, ["58–95", "29–57", "1–28"]],
] as const) {
  test(`visible HP criteria and old learning attempts give the correct victory rating: ${hero}`, async ({
    page,
  }, info) => {
    const save = checkpoint(hero);
    save.battle!.enemyHp = 1;
    save.battle!.hp = hp;
    await importSave(page, save);
    const rules = page.locator(".star-rules");
    await rules.locator("summary").focus();
    await rules.locator("summary").press("Enter");
    await expect(rules).toHaveAttribute("open", "");
    for (const range of ranges) await expect(rules).toContainText(range);
    await expect(rules).toContainText("โค้ดผิดและคำใบ้ไม่หักดาว");
    await rules.locator("summary").press("Space");
    await expect(rules).not.toHaveAttribute("open", "");
    const run = page.getByRole("button", { name: "รันโค้ด", exact: true });
    for (let attempt = 1; attempt <= 4; attempt++) {
      await writePython(page, `print("ลองครั้งที่ ${attempt}")\nattack(4)`);
      await run.click();
      await expect(page.getByTestId("python-output")).toContainText(
        `ลองครั้งที่ ${attempt}`,
      );
      await expect(run).toBeEnabled();
    }
    await writePython(page, 'print("Moon", "Gate")\nattack(1)');
    await run.click();
    const result = page.locator(".result-panel.won");
    await expect(result).toBeVisible();
    await expect(
      result.getByRole("img", {
        name: `รอบนี้ ${stars} ดาว จาก 3`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(result).toContainText(`HP ตอนชนะ ${hp}/${save.battle!.maxHp}`);
    await expect(page.locator(".star-rules")).toHaveCount(1);
    await result.locator(".star-rules summary").focus();
    await result.locator(".star-rules summary").press("Enter");
    await expect(page.locator(".toast")).not.toBeVisible();
    for (const width of [360, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      expect(
        (await result.locator(".star-rules summary").boundingBox())!.height,
      ).toBeGreaterThanOrEqual(44);
      await result.screenshot({
        path: `.verification/fair-stars-${info.project.name}-${hero}-${width}.png`,
      });
    }
    const after = await exported(page);
    expect(after.battle!.mistakes).toBe(7);
    expect(after.stars["1-1"]).toBe(stars);
    expect(after.gold).toBe(42);
    expect(after.completed).toEqual(["1-1"]);
    await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
    await page.reload();
    expect((await exported(page)).stars["1-1"]).toBe(stars);
  });
}
