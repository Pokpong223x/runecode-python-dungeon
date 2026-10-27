import { test, expect, type Page } from "@playwright/test";
import type { HeroId, SaveGameV1 } from "../../src/types";
import { writePython as writeRawPython } from "./input";
import { mechanicsSave, mechanicsSource } from "./mechanics";

const writePython = (page: Page, code: string) =>
  writeRawPython(page, mechanicsSource(code));

const scene = (page: Page) => page.locator(".pixel-scene");
const marker = (page: Page) => page.locator(".cm-executing-line");
async function expectCode(page: Page, code: string) {
  await expect
    .poll(async () =>
      (
        await page
          .getByRole("textbox", { name: "เขียนโค้ด Python" })
          .locator(".cm-line")
          .allTextContents()
      ).join("\n"),
    )
    .toBe(mechanicsSource(code));
}
async function enter(
  page: Page,
  code: string,
  hero: HeroId = "wizard",
  mp?: number,
  reduced = false,
) {
  const save = mechanicsSave(hero, reduced);
  if (mp !== undefined) save.battle.mp = mp;
  save.drafts["1-4"] = mechanicsSource(code);
  await page.goto("/");
  await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "isolated-focus.json",
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

async function watchSteps(page: Page) {
  await page.evaluate(() => {
    const root = document.querySelector(".battle-layout")!;
    const steps: Array<{
      line: string | null;
      mp: string | null;
      busy: string | null;
    }> = [];
    const observer = new MutationObserver(() => {
      steps.push({
        line:
          document
            .querySelector(".cm-executing-line")
            ?.getAttribute("data-executing-line") ?? null,
        mp:
          document.querySelector(".mp-track")?.getAttribute("aria-valuenow") ??
          null,
        busy:
          document.querySelector(".pixel-scene")?.getAttribute("aria-busy") ??
          null,
      });
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    Object.assign(root, { playbackProbe: { steps, observer } });
  });
}
async function readSteps(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector(".battle-layout") as Element & {
      playbackProbe: {
        steps: Array<{
          line: string | null;
          mp: string | null;
          busy: string | null;
        }>;
        observer: MutationObserver;
      };
    };
    root.playbackProbe.observer.disconnect();
    return root.playbackProbe.steps;
  });
}

for (const [hero, max, afterFocus, after] of [
  ["adventurer", 16, 16, 16],
  ["knight", 16, 15, 16],
  ["wizard", 24, 23, 23],
] as const) {
  test(`focus inserts with Undo, previews and highlights actual mana beats: ${hero}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({
      width: hero === "wizard" ? 360 : 1440,
      height: 950,
    });
    const code = 'print("สกิลแล้วฟื้นมานา")\nskill()';
    await enter(page, code, hero);
    const editor = page.getByRole("textbox", { name: "เขียนโค้ด Python" });
    await editor.press("ControlOrMeta+End");
    const tools = page.getByRole("region", { name: "สกิลฝั่งผู้เล่น" });
    await tools.getByRole("button", { name: /^ตั้งสมาธิ/ }).click();
    await expect(tools).toContainText("MP เต็มตอนนี้");
    await tools
      .getByRole("button", { name: "แทรก focus()", exact: true })
      .click();
    await expectCode(page, `${code}\nfocus()`);
    await editor.press("ControlOrMeta+z");
    await expectCode(page, code);
    await editor.press("ControlOrMeta+End");
    await tools
      .getByRole("button", { name: "แทรก focus()", exact: true })
      .click();
    const before = (await stored(page)).battle;
    await page.getByRole("button", { name: "ตรวจแผน", exact: true }).click();
    const preview = page.getByRole("region", { name: "ผลตรวจแผน" });
    await expect(preview).toContainText("ตั้งสมาธิ");
    await expect(preview).toContainText(`${after} MP`);
    await expect(marker(page)).toHaveCount(0);
    expect((await stored(page)).battle).toEqual(before);
    await watchSteps(page);
    await preview
      .getByRole("button", { name: "รันแผนนี้", exact: true })
      .click();
    await expect(marker(page)).toHaveAttribute("data-executing-line", "2");
    await expect(marker(page)).toHaveAttribute("data-executing-line", "3");
    await expect(page.locator(".scene-cue")).toContainText("ตั้งสมาธิ");
    await expect(page.locator(".editor-playback-label")).toContainText(
      "focus()",
    );
    await page.locator(".battle-layout").screenshot({
      path: `.verification/focus-playback-${info.project.name}-${hero}.png`,
    });
    await expect(scene(page)).toHaveAttribute("aria-busy", "false");
    const steps = await readSteps(page);
    expect(
      steps.some(
        (step) =>
          step.line === "2" &&
          step.mp === String(max - (hero === "adventurer" ? 3 : 4)),
      ),
    ).toBe(true);
    expect(
      steps.some((step) => step.line === "3" && step.mp === String(afterFocus)),
    ).toBe(true);
    await expect(marker(page)).toHaveCount(0);
    await expect(page.locator(".mp-value")).toHaveText(`${after}/${max}`);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.reload();
    await expect(page.locator(".mp-value")).toHaveText(`${after}/${max}`);
    await expect(marker(page)).toHaveCount(0);
  });
}

test("low mana focus uses actual alias/function lines and works in reduced motion", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const code =
    'print("ฟื้นก่อนใช้")\nrestore = focus\ndef gather():\n    restore()\nfor step in range(1):\n    gather()\nskill()';
  await enter(page, code, "wizard", 1, true);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await watchSteps(page);
  await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
  await expect(marker(page)).toHaveAttribute("data-executing-line", "4");
  await expect(page.locator(".editor-playback-label")).toContainText(
    "บรรทัด 4",
  );
  await page.locator(".code-workspace").screenshot({
    path: `.verification/focus-alias-${info.project.name}-390.png`,
  });
  await expect(scene(page)).toHaveAttribute("aria-busy", "false");
  const steps = await readSteps(page);
  expect(steps.some((step) => step.line === "4" && step.mp === "4")).toBe(true);
  expect(steps.some((step) => step.line === "7" && step.mp === "0")).toBe(true);
  await expect(page.locator(".mp-value")).toHaveText("0/24");
  await expect(marker(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("invalid focus plans locate the command and preserve the full checkpoint", async ({
  page,
}) => {
  await enter(page, 'print("ก่อนเริ่ม")\nattack()', "wizard", 1, true);
  for (const [body, message, line] of [
    ["skill()\nfocus()", "MP ไม่พอ", 2],
    ["focus()\nfocus()", "ครั้งเดียว", 3],
    ["focus()\nskill()\ndefend()", "4 AP", 4],
    ["focus(1)", "focus() ไม่รับค่า", 2],
  ] as const) {
    await writePython(page, `print("ตรวจเงื่อนไข")\n${body}`);
    const before = await stored(page);
    for (const action of ["ตรวจแผน", "รันโค้ด"]) {
      await page.getByRole("button", { name: action, exact: true }).click();
      await expect(page.getByTestId("python-output")).toContainText(message);
      await expect(
        page.locator(`.cm-error-line[data-error-line="${line}"]`),
      ).toHaveCount(1);
      await expect(marker(page)).toHaveCount(0);
      const after = await stored(page);
      expect(after.battle).toEqual(before.battle);
      expect(after.gold).toBe(before.gold);
      expect(after.completed).toEqual(before.completed);
    }
  }
});

test("editing and restoring a draft never reattaches stale highlights; navigation cancels playback", async ({
  page,
}) => {
  const code = 'print("แผนเดิม")\nskill()\nfocus()';
  await enter(page, code);
  await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
  await expect(marker(page)).toHaveAttribute("data-executing-line", "2");
  await writePython(page, 'print("แผนถัดไป")\nattack()');
  await expect(marker(page)).toHaveCount(0);
  await writePython(page, code);
  const editor = page.getByRole("textbox", { name: "เขียนโค้ด Python" });
  const scroll = await page.evaluate(() => scrollY);
  await expect(scene(page)).toHaveAttribute("aria-busy", "false");
  await expect(marker(page)).toHaveCount(0);
  await expect(editor).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBe(scroll);
  await writePython(page, 'print("ตั้งรับรอบต่อไป")\nfocus()\ndefend()');
  await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
  await expect(marker(page)).toHaveAttribute("data-executing-line", "2");
  await page
    .getByRole("button", { name: "แผนที่", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "เส้นทางของนักโค้ด" }),
  ).toBeVisible();
  await page.locator(".encounter-row").nth(3).click();
  await expect(marker(page)).toHaveCount(0);
  await expect(page.locator(".mp-value")).toHaveText("24/24");
});

test("full mana focus is explained in a short dialog and rejected without a turn", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 360, height: 500 });
  await enter(
    page,
    'print("ลองตั้งสมาธิ")\nfocus()',
    "wizard",
    undefined,
    true,
  );
  const before = (await stored(page)).battle;
  await page
    .getByRole("button", { name: "รายละเอียดสกิล", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /^ตั้งสมาธิ/ }).click();
  await expect(dialog).toContainText("MP เต็มตอนนี้");
  await expect(
    dialog.getByRole("button", { name: "แทรก focus()", exact: true }),
  ).toBeEnabled();
  expect(await dialog.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
    false,
  );
  await dialog.locator(".skill-detail").screenshot({
    path: `.verification/focus-dialog-${info.project.name}-360.png`,
  });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
  await expect(page.getByTestId("python-output")).toContainText("MP เต็มแล้ว");
  await expect(page.locator('.cm-error-line[data-error-line="2"]')).toHaveCount(
    1,
  );
  await expect(marker(page)).toHaveCount(0);
  expect((await stored(page)).battle).toEqual(before);
});

test("changing motion preference releases highlights without replaying committed mana", async ({
  page,
}) => {
  await enter(page, 'print("เปลี่ยนการเคลื่อนไหว")\nskill()\nfocus()');
  await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
  await expect(marker(page)).toHaveAttribute("data-executing-line", "2");
  await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  await page
    .locator(".settings-row")
    .filter({ hasText: "ลดการเคลื่อนไหว" })
    .getByRole("button")
    .click();
  await page.getByRole("button", { name: "ปิดหน้าต่าง", exact: true }).click();
  await expect(scene(page)).toHaveAttribute("aria-busy", "false");
  await expect(marker(page)).toHaveCount(0);
  await expect(page.locator(".mp-value")).toHaveText("23/24");
  await page.waitForTimeout(1200);
  await expect(scene(page)).toHaveAttribute("aria-busy", "false");
  await expect(marker(page)).toHaveCount(0);
  const checkpoint = (await stored(page)).battle!;
  expect(checkpoint.mp).toBe(23);
  expect(checkpoint.turn).toBe(2);
});
