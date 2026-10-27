import { test, expect, type Page } from "@playwright/test";
import { freshSave } from "../../src/storage";
import { startCombat } from "../../src/engine";
import { HERO_SKILLS, skillCommand } from "../../src/skills";
import type { HeroId, SaveGameV1 } from "../../src/types";
import { writePython } from "./input";

async function enter(page: Page, hero: HeroId, mp?: number, motion = false) {
  const save = freshSave();
  save.hero = hero;
  save.onboarding = true;
  save.settings.reducedMotion = !motion;
  save.completed = ["1-1", "1-2", "1-3"];
  save.battle = startCombat(save, "1-4");
  save.battle.enemyHp = save.battle.maxEnemyHp = 180;
  save.battle.intent = {
    kind: "heavy",
    damage: 20,
    label: "โจมตีหนัก!",
    description: "โจมตีหนัก",
  };
  if (mp !== undefined) save.battle.mp = mp;
  save.drafts["1-4"] = 'print("เลือกท่า") # ทดสอบกลยุทธ์\nattack()\ndefend()';
  await page.goto("/");
  await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "isolated-skill-tactics.json",
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
const toolsFor = (page: Page) =>
  page.getByRole("region", { name: "สกิลฝั่งผู้เล่น" });
const checkpoint = ({ revision, updatedAt, drafts, ...save }: SaveGameV1) =>
  save;
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

for (const hero of Object.keys(HERO_SKILLS) as HeroId[]) {
  for (const skill of HERO_SKILLS[hero]) {
    test(`${hero} ${skill.id}: selects, previews, persists and casts the actual skill`, async ({
      page,
    }, info) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.setViewportSize({
        width: hero === "wizard" ? 390 : hero === "knight" ? 768 : 1440,
        height: 900,
      });
      await enter(page, hero);
      const before = await stored(page);
      const choice = toolsFor(page).getByRole("button", {
        name: new RegExp(`^${skill.name}`),
      });
      await choice.click();
      const source = `print("เลือกท่า") # ทดสอบกลยุทธ์\n${skillCommand(skill.id)}()\ndefend()`;
      await expectCode(page, source);
      await expect(choice).toHaveAttribute("aria-pressed", "true");
      expect(checkpoint(await stored(page))).toEqual(checkpoint(before));
      await page.reload();
      await expectCode(page, source);
      await expect(choice).toHaveAttribute("aria-pressed", "true");
      await expect(
        page.getByRole("button", { name: "ตรวจแผน", exact: true }),
      ).toBeEnabled({ timeout: 60000 });
      await page.getByRole("button", { name: "ตรวจแผน", exact: true }).click();
      const preview = page.getByRole("region", { name: "ผลตรวจแผน" });
      await expect(preview).toContainText(skill.name);
      await expect(preview).toContainText("3 / 3");
      expect(checkpoint(await stored(page))).toEqual(checkpoint(before));
      await page.screenshot({
        path: `.verification/multi-skill-${info.project.name}-${hero}-${skill.id}.png`,
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await preview
        .getByRole("button", { name: "รันแผนนี้", exact: true })
        .click();
      await expect(page.getByTestId("python-output")).toContainText(
        "รันสำเร็จ",
      );
      await expect(page.locator(".pixel-scene")).toHaveAttribute(
        "aria-busy",
        "false",
      );
      const after = await stored(page);
      expect(after.battle!.enemyHp).toBe(
        before.battle!.enemyHp -
          Math.round(before.battle!.attack * skill.multiplier),
      );
      expect(after.battle!.mp).toBe(
        before.battle!.mp -
          skill.mp +
          (skill.refund ?? 0) +
          (hero === "knight" && !skill.stun ? 2 : 0),
      );
      expect(after.battle!.hp).toBe(before.battle!.hp - (skill.stun ? 0 : 7));
      expect(errors).toEqual([]);
    });
  }
}

test("switching a full draft cannot silently truncate the learner's source", async ({
  page,
}) => {
  await enter(page, "wizard");
  const prefix = 'print("',
    suffix = '")\nstun()';
  const source =
    prefix + "x".repeat(16000 - prefix.length - suffix.length) + suffix;
  await writePython(page, source);
  const before = checkpoint(await stored(page));
  await toolsFor(page)
    .getByRole("button", { name: /^โจมตีปกติ/ })
    .click();
  await expect(page.getByText(/ยังเปลี่ยนท่าอัตโนมัติไม่ได้/)).toBeVisible();
  expect((await stored(page)).drafts["1-4"]).toBe(source);
  expect(checkpoint(await stored(page))).toEqual(before);
});

test("AP feedback locates repeated skill calls and their loop without changing the checkpoint", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 650 });
  await enter(page, "wizard");
  const source =
    'print("แผน") # ทดสอบกลยุทธ์\ndef plan():\n    stun()\nfor i in range(2):\n    plan()\ndefend()';
  await writePython(page, source);
  const before = checkpoint(await stored(page));
  for (const action of ["ตรวจแผน", "รันโค้ด"]) {
    await page.getByRole("button", { name: action, exact: true }).click();
    const feedback = page.getByTestId("python-output");
    await expect(feedback).toContainText("ใช้ 5 AP");
    await expect(feedback.locator(".ap-breakdown")).toHaveAttribute("open", "");
    const row = feedback.locator('[data-ap-line="3"]');
    await expect(row).toContainText("2 ครั้ง × 2 AP = 4 AP");
    await expect(row).toContainText("ไม่เกิน 1 ครั้ง");
    await expect(
      page.locator('.cm-error-line[data-error-line="3"]'),
    ).toHaveCount(1);
    expect(checkpoint(await stored(page))).toEqual(before);
  }
  await page.screenshot({
    path: `.verification/ap-budget-${info.project.name}-390.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "แก้จำนวนรอบ · ลูปบรรทัด 4", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "เขียนโค้ด Python" }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () =>
        window.getSelection()?.anchorNode?.parentElement?.closest(".cm-line")
          ?.textContent,
    ),
  ).toBe("for i in range(2):");
  await writePython(page, source.replace("range(2)", "range(1)"));
  await expect(page.locator(".ap-breakdown")).toHaveCount(0);
  await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
  await expect(page.getByTestId("python-output")).toContainText("รันสำเร็จ");
});

test("fourth-command evidence is bounded and names the actual while-loop line", async ({
  page,
}) => {
  await enter(page, "adventurer");
  const before = checkpoint(await stored(page));
  await writePython(
    page,
    'print("วน") # ทดสอบกลยุทธ์\ni = 0\nwhile i < 9:\n    attack()\n    i += 1',
  );
  await page.getByRole("button", { name: "ตรวจแผน", exact: true }).click();
  const feedback = page.getByTestId("python-output");
  await expect(feedback).toContainText("อย่างน้อย 4 / 3 AP");
  await expect(feedback.locator('[data-ap-line="4"]')).toContainText(
    "4 ครั้ง × 1 AP = 4 AP",
  );
  await expect(
    feedback.getByRole("button", { name: "แก้จำนวนรอบ · ลูปบรรทัด 3" }),
  ).toBeVisible();
  expect(checkpoint(await stored(page))).toEqual(before);
});

test("skill costs disable only unavailable choices, and switching variants respects Undo and aliases", async ({
  page,
}) => {
  await enter(page, "wizard", 4);
  const tools = toolsFor(page);
  await expect(tools.getByRole("button", { name: /^อัคคีรูน/ })).toBeEnabled();
  await expect(tools.getByRole("button", { name: /^มหาอัคคี/ })).toBeDisabled();
  await expect(
    tools.getByRole("button", { name: /^พันธนาการเหมันต์/ }),
  ).toBeDisabled();
  await enter(page, "adventurer");
  const source =
    '# stun() คงเดิม\nprint("pierce()")\nmove = attack\nmove()\ndefend()';
  await writePython(page, source);
  await tools.getByRole("button", { name: /^แทงทะลวง/ }).click();
  await expectCode(page, source.replace("move = attack", "move = pierce"));
  await tools.getByRole("button", { name: /^ด้ามดาบหยุดท่า/ }).click();
  await expectCode(page, source.replace("move = attack", "move = stun"));
  const editor = page.getByRole("textbox", { name: "เขียนโค้ด Python" });
  await editor.focus();
  await editor.press("Control+z");
  await expectCode(page, source.replace("move = attack", "move = pierce"));
  await expect(
    tools.getByRole("button", { name: /^แทงทะลวง/ }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("a skill from another class reports the calling line without committing", async ({
  page,
}) => {
  await enter(page, "knight");
  const before = checkpoint(await stored(page));
  await writePython(page, 'print("ลองท่า") # ทดสอบกลยุทธ์\nburst()');
  await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
  await expect(page.getByTestId("python-output")).toContainText(
    "ไม่ใช่ของอาชีพ",
  );
  await expect(page.locator('.cm-error-line[data-error-line="2"]')).toHaveCount(
    1,
  );
  expect(checkpoint(await stored(page))).toEqual(before);
});

for (const hero of Object.keys(HERO_SKILLS) as HeroId[]) {
  test(`${hero}: all three details fit a 360px short dialog and return to the selected editor command`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 360, height: 500 });
    await enter(page, hero);
    await page
      .getByRole("button", { name: "รายละเอียดสกิล", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "สกิลและคำสั่ง" });
    for (const skill of HERO_SKILLS[hero]) {
      await dialog
        .getByRole("button", { name: new RegExp(`^${skill.name}`) })
        .click();
      await expect(
        dialog.getByRole("heading", { name: skill.name, exact: true }),
      ).toBeVisible();
      await expect(dialog.locator(".skill-code-preview code")).toHaveText(
        `${skillCommand(skill.id)}(1)`,
      );
      expect(
        await dialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      const detail = dialog.locator(".skill-detail");
      expect(
        await detail.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
    }
    await dialog.locator(".skill-detail").screenshot({
      path: `.verification/multi-skill-dialog-${info.project.name}-${hero}-360.png`,
    });
    const skill = HERO_SKILLS[hero][2];
    await dialog
      .getByRole("button", {
        name: `เขียนโค้ดด้วย ${skillCommand(skill.id)}(1)`,
        exact: true,
      })
      .click();
    await expect(dialog).not.toBeVisible();
    await expectCode(
      page,
      `print("เลือกท่า") # ทดสอบกลยุทธ์\n${skillCommand(skill.id)}()\ndefend()`,
    );
  });
}
