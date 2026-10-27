import { test, expect, type Page } from "@playwright/test";
import { freshSave } from "../../src/storage";
import { startCombat } from "../../src/engine";
import { HEROES } from "../../src/content";
import type { HeroId, SaveGameV1 } from "../../src/types";
import { writePython } from "./input";

const draft =
  '# attack() ในคอมเมนต์\nprint("skill() / attack()")\nmove = attack\ndef combo():\n    move()\ncombo()\ndefend()';
async function enter(page: Page, hero: HeroId, mp?: number) {
  const save = freshSave();
  save.hero = hero;
  save.onboarding = true;
  save.settings.reducedMotion = true;
  save.completed = ["1-1", "1-2", "1-3"];
  // Boss strategy permits combinations while preserving this fixture's counter.
  save.battle = {
    ...startCombat(save, "1-4"),
    intent: startCombat(save, "1-1").intent,
  };
  if (mp !== undefined) save.battle.mp = mp;
  save.drafts["1-4"] = draft;
  await page.goto("/");
  await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "isolated-offense.json",
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
async function stored(page: Page): Promise<SaveGameV1> {
  await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("runecode-save", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("game", "readonly");
          const read = tx.objectStore("game").get("save");
          read.onsuccess = () => resolve(read.result);
          tx.oncomplete = () => db.close();
        };
      }),
  );
}
async function expectCode(page: Page, source: string) {
  await expect
    .poll(async () =>
      (
        await page
          .getByRole("textbox", { name: "เขียนโค้ด Python" })
          .locator(".cm-line")
          .allTextContents()
      ).join("\n"),
    )
    .toBe(source);
}
const checkpoint = ({ revision, updatedAt, drafts, ...save }: SaveGameV1) =>
  save;

for (const hero of Object.keys(HEROES) as HeroId[]) {
  test(`exclusive attack choice changes code, undoes, persists and casts: ${hero}`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({
      width: hero === "wizard" ? 390 : 1440,
      height: 900,
    });
    await enter(page, hero);
    const tools = page.getByRole("region", { name: "สกิลฝั่งผู้เล่น" });
    const attack = tools.getByRole("button", { name: /^โจมตีปกติ/ });
    const skill = tools.getByRole("button", {
      name: new RegExp(`^${HEROES[hero].skill}`),
    });
    const before = await stored(page);
    const skillCode = draft.replace("move = attack", "move = skill");
    await skill.click();
    await expectCode(page, skillCode);
    await expect(skill).toBeFocused(); // Selecting a mode does not summon the phone keyboard.
    await expect(skill).toHaveAttribute("aria-pressed", "true");
    await expect(attack).toHaveAttribute("aria-pressed", "false");
    expect(checkpoint(await stored(page))).toEqual(checkpoint(before));
    await attack.focus();
    await attack.press("Space");
    await expectCode(page, draft);
    const editor = page.getByRole("textbox", { name: "เขียนโค้ด Python" });
    await editor.focus();
    await editor.press("Control+z");
    await expectCode(page, skillCode);
    await expect(skill).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expectCode(page, skillCode);
    await expect(skill).toHaveAttribute("aria-pressed", "true");
    await expect(
      tools.getByRole("button", {
        name: "เขียนโค้ดด้วย skill(1)",
        exact: true,
      }),
    ).toBeEnabled();
    await tools
      .getByRole("button", { name: "เขียนโค้ดด้วย skill(1)", exact: true })
      .click();
    await expectCode(page, skillCode); // Repeated confirmation cannot add another 2-AP skill.
    await expect(editor).toBeFocused();
    await expect(
      page.getByRole("button", { name: "รันโค้ด", exact: true }),
    ).toBeEnabled({ timeout: 60000 });
    await page.screenshot({
      path: `.verification/offense-${info.project.name}-${hero}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "รันโค้ด", exact: true }),
    ).toBeEnabled({ timeout: 60000 });
    await editor.press("Control+Enter");
    await expect(page.getByTestId("python-output")).toContainText("รันสำเร็จ");
    await expect(page.locator(".pixel-scene")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    const after = await stored(page);
    expect(after.battle!.turn).toBe(2);
    expect(after.battle!.enemyHp).toBeLessThan(before.battle!.enemyHp);
    expect(after.battle!.mp).toBe(
      before.battle!.mp -
        (hero === "adventurer" ? 3 : hero === "knight" ? 2 : 4),
    );
    expect(errors).toEqual([]);
  });
}

test("manual mixed actions, aliases and excess skill loops are rejected without changing the checkpoint", async ({
  page,
}) => {
  await enter(page, "wizard");
  const before = checkpoint(await stored(page));
  const run = page.getByRole("button", { name: "รันโค้ด", exact: true });
  for (const source of [
    '# แผน\nprint("แผน")\nattack()\nskill()',
    '# แผน\nprint("แผน")\nhit = skill\nhit()\nattack()',
  ]) {
    await writePython(page, source);
    await page.getByRole("button", { name: "ตรวจแผน", exact: true }).click();
    await expect(page.getByTestId("python-output")).toContainText(
      "อย่างใดอย่างหนึ่ง",
    );
    expect(checkpoint(await stored(page))).toEqual(before);
    await run.click();
    await expect(page.getByTestId("python-output")).toContainText(
      "อย่างใดอย่างหนึ่ง",
    );
    expect(checkpoint(await stored(page))).toEqual(before);
  }
  await writePython(
    page,
    '# แผน\nprint("วนสองรอบ")\nfor i in range(2):\n    attack()',
  );
  await page
    .getByRole("region", { name: "สกิลฝั่งผู้เล่น" })
    .getByRole("button", { name: /^อัคคีรูน/ })
    .click();
  await expectCode(
    page,
    '# แผน\nprint("วนสองรอบ")\nfor i in range(2):\n    skill()',
  );
  await run.click();
  await expect(page.getByTestId("python-output")).toContainText("ใช้ 4 AP");
  expect(checkpoint(await stored(page))).toEqual(before);
  await writePython(page, 'print("แผนไม่ครบ")\nif True:\nattack()');
  const broken = (await stored(page)).drafts["1-4"];
  await page
    .getByRole("region", { name: "สกิลฝั่งผู้เล่น" })
    .getByRole("button", { name: /^อัคคีรูน/ })
    .click();
  await expectCode(page, broken);
  await expect(page.getByText(/ยังเปลี่ยนท่าอัตโนมัติไม่ได้/)).toBeVisible();
});

test("MP blocks skill selection, but normal attack remains available on a narrow viewport", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await enter(page, "wizard", 0);
  const tools = page.getByRole("region", { name: "สกิลฝั่งผู้เล่น" });
  await expect(tools.getByRole("button", { name: /^อัคคีรูน/ })).toBeDisabled();
  const attack = tools.getByRole("button", { name: /^โจมตีปกติ/ });
  await expect(tools.locator(".skill-unavailable").first()).toBeVisible();
  await expect(attack).toBeEnabled();
  await attack.click();
  await expectCode(page, draft);
  await page.screenshot({
    path: `.verification/offense-no-mp-${info.project.name}-360.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
  await expect(page.getByTestId("python-output")).toContainText("รันสำเร็จ");
});
