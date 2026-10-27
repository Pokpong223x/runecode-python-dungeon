import { test, expect, type Page } from "@playwright/test";
import { writePython } from "./input";
import { freshSave } from "../../src/storage";
import { startCombat } from "../../src/engine";

async function enter(page: Page, hero = "นักผจญภัย") {
  await page.goto("/");
  await page
    .locator(".hero-card")
    .filter({ has: page.getByRole("heading", { name: hero, exact: true }) })
    .click();
  await page
    .getByRole("button", { name: "เริ่มการผจญภัย", exact: true })
    .click();
  await page.locator(".encounter-row").first().click();
  await expect(
    page.getByRole("button", { name: "รันโค้ด", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
}
const editorFor = (page: Page) =>
  page.getByRole("textbox", { name: "เขียนโค้ด Python" });
const launchFor = (page: Page) =>
  page.getByRole("button", { name: "รายละเอียดสกิล", exact: true });
test("player skills share the code zone, enemy info stays with the stage and inline insertion works", async ({
  page,
}, info) => {
  await enter(page);
  const controls = page.getByRole("region", { name: "สกิลฝั่งผู้เล่น" });
  const enemy = page.getByRole("region", { name: "ท่าถัดไปฝั่งศัตรู" });
  for (const width of [1440, 768, 390, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({
      path: `.verification/code-side-${info.project.name}-${width}.png`,
      fullPage: true,
    });
    const p = await controls.boundingBox(),
      e = await enemy.boundingBox();
    const combat = await page.locator(".combat-column").boundingBox();
    const coding = await page.locator(".coding-column").boundingBox();
    const workspace = await page.locator(".code-workspace").boundingBox();
    await expect(page.locator(".coding-column > .player-controls")).toHaveCount(
      1,
    );
    await expect(page.locator(".combat-column > .enemy-tactics")).toHaveCount(
      1,
    );
    expect(p!.y).toBeGreaterThanOrEqual(workspace!.y + workspace!.height);
    expect(e!.x).toBeGreaterThanOrEqual(combat!.x);
    expect(e!.x + e!.width).toBeLessThanOrEqual(combat!.x + combat!.width + 1);
    if (width > 1020)
      expect(p!.x).toBeGreaterThanOrEqual(combat!.x + combat!.width);
    expect(p!.x).toBeGreaterThanOrEqual(coding!.x);
    expect(p!.x + p!.width).toBeLessThanOrEqual(coding!.x + coding!.width + 1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    expect(
      await controls.evaluate((el) => el.scrollWidth > el.clientWidth),
    ).toBe(false);
    if (width <= 680)
      expect(
        await page
          .locator(".execution-bar")
          .evaluate((el) => getComputedStyle(el).position),
      ).toBe("static");
    for (const card of await controls.locator(".skill-choice").all()) {
      const b = await card.boundingBox();
      const art = card.locator(".skill-art");
      await expect(art).toBeVisible();
      const artBox = await art.boundingBox();
      expect(artBox!.width).toBeGreaterThanOrEqual(40);
      expect(artBox!.height).toBeGreaterThanOrEqual(40);
      expect(artBox!.x).toBeGreaterThanOrEqual(b!.x);
      expect(artBox!.x + artBox!.width).toBeLessThanOrEqual(b!.x + b!.width);
      expect(b!.height).toBeGreaterThanOrEqual(44);
      expect(b!.width).toBeGreaterThanOrEqual(44);
    }
  }
  const editor = editorFor(page);
  await writePython(page, 'print("Moon", "Gate")');
  await editor.press("Control+End");
  await controls.getByRole("button", { name: /^ฟันสองจังหวะ/ }).click();
  await controls
    .getByRole("button", { name: "เขียนโค้ดด้วย skill(1)", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(editor).toBeFocused();
  await expect(page.locator(".execution-bar")).toHaveCSS("position", "sticky");
  const runBar = await page.locator(".execution-bar").boundingBox();
  const mission = await page.locator(".mission").boundingBox();
  expect(runBar!.y).toBeGreaterThanOrEqual(mission!.y + mission!.height - 1);
  await expectCode(page, 'print("Moon", "Gate")\nskill(1)');
  await expect(page.getByRole("progressbar").last()).toHaveAttribute(
    "aria-valuenow",
    "37",
  );
  await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
  await expect(page.locator(".pixel-scene")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await expect(
    controls.getByRole("button", {
      name: "เขียนโค้ดด้วย skill(1)",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(page.locator(".pixel-scene")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(page.getByRole("progressbar").last()).toHaveAttribute(
    "aria-valuenow",
    "9",
  );
});
async function expectCode(page: Page, code: string) {
  await expect
    .poll(async () =>
      (await editorFor(page).locator(".cm-line").allTextContents()).join("\n"),
    )
    .toBe(code);
}

for (const [hero, skill, damage, mp] of [
  ["นักผจญภัย", "ฟันสองจังหวะ", 28, 13],
  ["อัศวิน", "กระแทกโล่", 21, 14],
  ["พ่อมด", "อัคคีรูน", 32, 20],
] as const) {
  test(`skill book previews, preserves code, undoes, saves and casts: ${hero}`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await enter(page, hero);
    const editor = editorFor(page);
    const original = '# แผนของฉัน\nprint("Moon", "Gate")';
    await writePython(page, original);
    await editor.press("Control+End");
    await launchFor(page).click();
    const dialog = page.getByRole("dialog", { name: "สกิลและคำสั่ง" });
    await dialog
      .getByRole("button", { name: new RegExp(`${skill} skill`) })
      .click();
    await expect(dialog.getByRole("heading", { name: skill })).toBeVisible();
    await expect(dialog.locator(".skill-detail .skill-art")).toHaveAttribute(
      "data-skill-art",
      hero === "นักผจญภัย"
        ? "adventurer"
        : hero === "อัศวิน"
          ? "knight"
          : "wizard",
    );
    for (const art of await dialog.locator(".skill-choice .skill-art").all())
      await expect(art).toBeVisible();
    await expect(dialog.locator(".skill-effect")).toHaveText(
      `ตัวอย่างพลัง 1 · สร้าง ${damage} ดาเมจ`,
    );
    await dialog.getByRole("button", { name: /ใช้ยา heal/ }).click();
    await expect(
      dialog.getByRole("button", { name: "แทรก heal()", exact: true }),
    ).toBeDisabled();
    await expect(dialog.locator(".skill-warning")).toContainText("HP เต็ม");
    await dialog
      .getByRole("button", { name: new RegExp(`${skill} skill`) })
      .click();
    await page.screenshot({
      path: `.verification/skill-book-${info.project.name}-${hero}.png`,
      fullPage: true,
    });
    await expect(page.getByRole("progressbar").last()).toHaveAttribute(
      "aria-valuenow",
      "37",
    );
    await dialog
      .getByRole("button", { name: "เขียนโค้ดด้วย skill(1)", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(editor).toBeFocused();
    await expectCode(page, `${original}\nskill(1)`);
    await editor.press("Control+z");
    await expectCode(page, original);
    await launchFor(page).click();
    await page.keyboard.press("Escape");
    await expect(launchFor(page)).toBeFocused();
    await launchFor(page).press("Enter");
    await dialog
      .getByRole("button", { name: new RegExp(`${skill} skill`) })
      .click();
    await dialog
      .getByRole("button", { name: "เขียนโค้ดด้วย skill(1)", exact: true })
      .click();
    await expectCode(page, `${original}\nskill(1)`);
    await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
    await page.reload();
    await expectCode(page, `${original}\nskill(1)`);
    await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
    await expect(page.locator(".pixel-scene")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await expect(launchFor(page)).toBeDisabled();
    await expect(page.locator(".pixel-scene")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await expect(page.getByRole("progressbar").last()).toHaveAttribute(
      "aria-valuenow",
      String(37 - damage),
    );
    await expect(page.locator(".resources")).toContainText(`MP ${mp}/`);
    expect(errors).toEqual([]);
  });
}

test("skill book explains unavailable resources, preserves indentation and fits phone/short viewports", async ({
  page,
}, info) => {
  await page.goto("/");
  const save = freshSave();
  save.hero = "wizard";
  save.onboarding = true;
  save.potions = 0;
  save.battle = startCombat(save, "1-1");
  save.battle.hp = 65;
  save.battle.mp = 0;
  save.drafts["1-1"] =
    'print("Moon", "Gate")\nattack(1)\nif hp > 0:\n    # ตั้งรับหลังโจมตี';
  await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "skills-checkpoint.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(save)),
  });
  await page.getByRole("button", { name: "ใช้บันทึกจากไฟล์นี้" }).click();
  const editor = editorFor(page);
  await expectCode(page, save.drafts["1-1"]);
  await editor.press("Control+End");
  await page.getByRole("button", { name: "เปิดหน้าสกิล", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: /^อัคคีรูน/ }),
  ).toBeDisabled();
  await expect(dialog.locator(".skill-unavailable").first()).toContainText(
    "MP ไม่พอ",
  );
  for (const width of [360, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.screenshot({
      path: `.verification/skill-book-${info.project.name}-${width}.png`,
      fullPage: true,
    });
    expect(await dialog.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(
      false,
    );
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    for (const card of await dialog.locator(".skill-choice").all()) {
      const bounds = await card.boundingBox();
      expect(bounds!.width).toBeGreaterThanOrEqual(44);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
    }
  }
  await page.setViewportSize({ width: 390, height: 500 });
  await dialog.getByRole("button", { name: /ใช้ยา heal/ }).click();
  await expect(dialog.locator(".skill-warning")).toContainText("ยาหมด");
  await expect(
    dialog.getByRole("button", { name: "แทรก heal()", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: /ป้องกัน defend/ }).click();
  await dialog
    .getByRole("button", { name: "แทรก defend()", exact: true })
    .click();
  await expectCode(page, `${save.drafts["1-1"]}\n    defend()`);
  await expect(editor).toBeFocused();
  await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
  await expect(page.getByTestId("python-output")).toContainText("รันสำเร็จ");
});

test("skill insertion cannot bypass Python lessons or combined AP validation", async ({
  page,
}) => {
  await enter(page);
  const editor = editorFor(page);
  await writePython(page, "");
  await launchFor(page).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^โจมตีปกติ/ })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "เขียนโค้ดด้วย attack(1)", exact: true })
    .click();
  await expectCode(page, "attack(1)");
  await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
  await expect(page.getByTestId("python-output")).toContainText("ยังไม่พบ");
  await expect(page.getByRole("progressbar").last()).toHaveAttribute(
    "aria-valuenow",
    "37",
  );
  await writePython(
    page,
    'print("Moon", "Gate")\nattack(1)\ndefend()\ndefend()',
  );
  await editor.press("Control+End");
  await launchFor(page).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^ฟันสองจังหวะ/ })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "เขียนโค้ดด้วย skill(1)", exact: true })
    .click();
  await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
  await expect(page.getByTestId("python-output")).toContainText("ใช้ 4 AP");
  await expect(page.getByRole("progressbar").last()).toHaveAttribute(
    "aria-valuenow",
    "37",
  );
  await expect(page.locator(".resources")).toContainText("MP 16/16");
});
