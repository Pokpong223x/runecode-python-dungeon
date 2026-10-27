import { expect, test, type Page } from "@playwright/test";
import { freshSave } from "../../src/storage";
import { startCombat } from "../../src/engine";
import { HERO_TRAITS } from "../../src/heroTraits";
import type { HeroId, SaveGameV1 } from "../../src/types";
import { writePython as writeRawPython } from "./input";

// Combined-action mechanics belong in the boss's open strategy challenge.
const bossSource = (code: string) => `# ทดสอบแผนอาชีพ\n${code}`;
const writePython = (page: Page, code: string) =>
  writeRawPython(page, bossSource(code));

async function enter(
  page: Page,
  hero: HeroId,
  source: string,
  reduced: boolean,
) {
  const save = freshSave();
  save.hero = hero;
  save.onboarding = true;
  save.settings.reducedMotion = reduced;
  save.completed = ["1-1", "1-2", "1-3"];
  save.battle = {
    ...startCombat(save, "1-4"),
    // Preserve the direct counter used to prove the knight's actual restoration.
    intent: startCombat(save, "1-1").intent,
    mp: 10,
    enemyHp: 200,
    maxEnemyHp: 200,
  };
  save.drafts["1-4"] = bossSource(source);
  await page.goto("/");
  await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "isolated-hero-traits.json",
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

for (const reduced of [false, true]) {
  for (const [hero, body, enemyHp, mp, count] of [
    [
      "adventurer",
      'attack()\nprint("ต่อเนื่อง")\nattack()\nattack()',
      157,
      10,
      2,
    ],
    ["knight", "skill()\nfocus()", 179, 11, 1],
    ["wizard", "focus()\nskill()", 159, 9, 1],
  ] as const) {
    test(`${hero}: passive preview, playback and reload (${reduced ? "reduced" : "motion"})`, async ({
      page,
    }, info) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewportSize({ width: reduced ? 360 : 1440, height: 900 });
      await page.emulateMedia({
        reducedMotion: reduced ? "reduce" : "no-preference",
      });
      const code = `print("แผนอาชีพ")\n${body}`;
      await enter(page, hero, code, reduced);
      const before = (await stored(page)).battle!;
      const tools = page.getByRole("region", { name: "สกิลฝั่งผู้เล่น" });
      const summary = tools.locator(".hero-trait summary");
      await expect(summary).toHaveText(`พลังอาชีพ · ${HERO_TRAITS[hero].name}`);
      await summary.focus();
      await summary.press("Enter");
      await expect(tools.locator(".hero-trait")).toHaveAttribute("open", "");
      await expect(tools.locator(".hero-trait")).toContainText(
        HERO_TRAITS[hero].tip,
      );
      expect((await stored(page)).battle).toEqual(before);
      await summary.press("Enter");
      await page.getByRole("button", { name: "ตรวจแผน", exact: true }).click();
      const preview = page.getByRole("region", { name: "ผลตรวจแผน" });
      await expect(
        preview
          .getByRole("list", { name: "พลังอาชีพที่จะทำงาน" })
          .locator("li"),
      ).toHaveCount(count);
      await expect(preview).toContainText(`${mp} MP`);
      await expect(preview).toContainText(`200 → ${enemyHp}`);
      expect((await stored(page)).battle).toEqual(before);
      await page.screenshot({
        path: `.verification/hero-traits-${info.project.name}-${hero}-${reduced ? "360" : "1440"}.png`,
        fullPage: true,
      });
      await page.evaluate(() => {
        const cues: string[] = [];
        const observer = new MutationObserver(() =>
          cues.push(document.querySelector(".scene-cue")?.textContent ?? ""),
        );
        observer.observe(document.querySelector(".scene-frame")!, {
          subtree: true,
          childList: true,
          characterData: true,
        });
        Object.assign(window, { traitProbe: { cues, observer } });
      });
      await preview
        .getByRole("button", { name: "รันแผนนี้", exact: true })
        .click();
      await expect(page.locator(".pixel-scene")).toHaveAttribute(
        "aria-busy",
        "true",
      );
      await expect(page.locator(".pixel-scene")).toHaveAttribute(
        "aria-busy",
        "false",
      );
      const after = (await stored(page)).battle!;
      expect(after).toMatchObject({ enemyHp, mp, turn: 2 });
      await expect(page.locator(".mp-track")).toHaveAttribute(
        "aria-valuenow",
        String(mp),
      );
      const cues = await page.evaluate(() => {
        const probe = (
          window as typeof window & {
            traitProbe: { cues: string[]; observer: MutationObserver };
          }
        ).traitProbe;
        probe.observer.disconnect();
        return probe.cues.join(" ");
      });
      expect(cues).toContain(
        hero === "adventurer"
          ? "คอมโบ 2"
          : hero === "knight"
            ? "โล่คืนพลัง"
            : "พลังสกิล +25%",
      );
      await page.reload();
      await expect(
        page.getByRole("button", { name: "รันโค้ด", exact: true }),
      ).toBeEnabled({ timeout: 60000 });
      expect((await stored(page)).battle).toEqual(after);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
    });
  }
}

test("reordered wizard commands remove the stale bonus forecast, and invalid plans preserve the checkpoint", async ({
  page,
}) => {
  await enter(page, "wizard", 'print("แผน")\nfocus()\nskill()', true);
  const before = (await stored(page)).battle;
  await page.getByRole("button", { name: "ตรวจแผน", exact: true }).click();
  const preview = page.getByRole("region", { name: "ผลตรวจแผน" });
  await expect(preview.locator(".forecast-traits")).toContainText("+25%");
  await writePython(page, 'print("แผน")\nskill()\nfocus()');
  await expect(preview).not.toBeVisible();
  await page.getByRole("button", { name: "ตรวจแผน", exact: true }).click();
  await expect(preview).toBeVisible();
  await expect(preview.locator(".forecast-traits")).toHaveCount(0);
  await expect(preview).toContainText("200 → 168");
  for (const [code, message] of [
    ['print("ผิด AP")\nfocus()\nskill()\ndefend()', "ใช้ 4 AP"],
    ["focus()\nskill()", "ยังไม่พบ"],
    ['print("ผิดท่า")\nattack()\nskill()', "เลือกโจมตีปกติหรือสกิล"],
  ]) {
    await writePython(page, code);
    await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
    await expect(page.getByTestId("python-output")).toContainText(message);
    expect((await stored(page)).battle).toEqual(before);
  }
});
