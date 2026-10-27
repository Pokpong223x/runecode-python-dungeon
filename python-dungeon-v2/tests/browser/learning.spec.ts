import { test, expect, type Page } from "@playwright/test";
import { freshSave } from "../../src/storage";
import { startCombat } from "../../src/engine";
import { writePython } from "./input";

async function enter(page: Page) {
  await page.goto("/");
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
const checkFor = (page: Page) =>
  page.getByRole("button", { name: "ตรวจแผน", exact: true });
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

test("Python errors mark the actual line, jump to it and clear safely on full replacement", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await enter(page);
  const editor = editorFor(page);
  await writePython(page, 'print("Moon", "Gate")\nattack(4)');
  await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
  await expect(editor).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("python-output")).toContainText(
    "พลังต้องเป็นจำนวนเต็ม 1 ถึง 3",
  );
  await expect(
    page.locator('.cm-error-line[data-error-line="2"]'),
  ).toBeVisible();
  await page.screenshot({
    path: `.verification/learning-diagnostic-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "ไปบรรทัด 2", exact: true }).click();
  await expect(editor).toBeFocused();
  expect(
    await page.evaluate(
      () =>
        window.getSelection()?.anchorNode?.parentElement?.closest(".cm-line")
          ?.textContent,
    ),
  ).toBe("attack(4)");
  // Replacing a longer document must not leave an out-of-bounds decoration.
  await writePython(page, "x");
  await expect(page.locator(".cm-error-line")).toHaveCount(0);
  await expect(editor).toHaveAttribute("aria-invalid", "false");
  await expect(page.getByRole("progressbar").last()).toHaveAttribute(
    "aria-valuenow",
    "37",
  );
  expect(errors).toEqual([]);
});

test("checking a real Python plan leaves the full checkpoint intact and forecasts the actual turn", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await enter(page);
  await writePython(page, 'print("Moon", "Gate")\nattack(1)\ndefend()');
  const before = await exportedBattle(page);
  await checkFor(page).click();
  const preview = page.getByRole("region", { name: "ผลตรวจแผน" });
  await expect(preview).toContainText("ยังไม่เสียเทิร์น");
  await expect(preview).toContainText("110 → 106");
  await expect(preview).toContainText("37 → 25");
  await expect(preview).toContainText("2 / 3");
  await expect(page.getByTestId("python-output")).toContainText("ตรวจแผนผ่าน");
  await expect(page.locator(".pixel-scene")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  expect(await exportedBattle(page)).toEqual(before);
  await page.screenshot({
    path: `.verification/learning-preview-${info.project.name}.png`,
    fullPage: true,
  });
  await preview.getByRole("button", { name: "รันแผนนี้", exact: true }).click();
  await expect(preview).not.toBeVisible();
  await expect(page.locator(".pixel-scene")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await expect(checkFor(page)).toBeDisabled();
  await expect(page.locator(".pixel-scene")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(page.getByRole("progressbar").first()).toHaveAttribute(
    "aria-valuenow",
    "106",
  );
  await expect(page.getByRole("progressbar").last()).toHaveAttribute(
    "aria-valuenow",
    "25",
  );
  await expect(page.getByTestId("python-output")).toContainText("รันสำเร็จ");
});

test("practice errors and AP rejection do not change mistakes, resources or turns", async ({
  page,
}) => {
  await enter(page);
  const before = await exportedBattle(page);
  for (const [code, message] of [
    ["attack(1)", "ยังไม่พบ"],
    ['print("Moon", "Gate")\nskill(1)\ndefend()\ndefend()', "ใช้ 4 AP"],
    ['print("Moon", "Gate")\nattack(4)', "พลังต้องเป็นจำนวนเต็ม"],
  ]) {
    await writePython(page, code);
    await checkFor(page).click();
    await expect(page.getByTestId("python-output")).toContainText(message);
    await expect(
      page.getByRole("region", { name: "ผลตรวจแผน" }),
    ).not.toBeVisible();
    expect(await exportedBattle(page)).toEqual(before);
  }
});

test("edited code, navigation and canceled practice cannot leave a stale forecast", async ({
  page,
}) => {
  await enter(page);
  const before = await exportedBattle(page);
  const editor = editorFor(page);
  await writePython(page, 'print("Moon", "Gate")\nattack(1)');
  await checkFor(page).click();
  const preview = page.getByRole("region", { name: "ผลตรวจแผน" });
  await expect(preview).toBeVisible();
  await writePython(page, 'print("เปลี่ยนแผน")\ndefend()');
  await expect(preview).not.toBeVisible();
  await writePython(page, "while True:\n    pass");
  await checkFor(page).click();
  await page.getByRole("button", { name: "หยุด", exact: true }).click();
  await expect(page.getByTestId("python-output")).toContainText("หยุดแล้ว");
  await expect(checkFor(page)).toBeEnabled({ timeout: 60000 });
  expect(await exportedBattle(page)).toEqual(before);
  await writePython(page, 'print("Moon", "Gate")\nattack(1)');
  await checkFor(page).click();
  await expect(preview).toBeVisible();
  await page
    .getByRole("button", { name: "แผนที่", exact: true })
    .first()
    .click();
  await page.locator(".encounter-row").first().click();
  await expect(preview).not.toBeVisible();
  await expect(page.getByRole("progressbar").last()).toHaveAttribute(
    "aria-valuenow",
    "37",
  );
});

test("practice controls and forecast fit phones with a short keyboard viewport", async ({
  page,
}, info) => {
  await enter(page);
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 500 });
    await writePython(page, 'print("Moon", "Gate")\nattack(1)');
    await checkFor(page).click();
    const preview = page.getByRole("region", { name: "ผลตรวจแผน" });
    await expect(preview).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    expect(
      await preview.evaluate((el) => el.scrollWidth > el.clientWidth),
    ).toBe(false);
    const box = await checkFor(page).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({
      path: `.verification/learning-preview-${info.project.name}-${width}.png`,
      fullPage: true,
    });
    await preview
      .getByRole("button", { name: "แก้ไขโค้ด", exact: true })
      .click();
    await expect(editorFor(page)).toBeFocused();
    await preview
      .getByRole("button", { name: "ปิดผลตรวจแผน", exact: true })
      .click();
  }
});

test("a losing forecast warns without killing the player or consuming the room", async ({
  page,
}) => {
  await page.goto("/");
  const save = freshSave();
  save.hero = "adventurer";
  save.onboarding = true;
  save.battle = startCombat(save, "1-1");
  save.battle.hp = 4;
  save.drafts["1-1"] = 'print("Moon", "Gate")\nattack(1)';
  await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "practice-checkpoint.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(save)),
  });
  await page
    .getByRole("button", { name: "ใช้บันทึกจากไฟล์นี้", exact: true })
    .click();
  await expect(checkFor(page)).toBeEnabled({ timeout: 60000 });
  await checkFor(page).click();
  const preview = page.getByRole("region", { name: "ผลตรวจแผน" });
  await expect(preview).toContainText("แผนนี้ทำให้ HP หมด");
  await expect(preview).toContainText("4 → 0");
  await expect(page.getByRole("progressbar").first()).toHaveAttribute(
    "aria-valuenow",
    "4",
  );
  expect((await exportedBattle(page)).status).toBe("active");
});
