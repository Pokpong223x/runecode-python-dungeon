import { test, expect, type Page } from "@playwright/test";
import { writePython } from "./input";
import { ENCOUNTERS } from "../../src/content";
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
async function write(page: Page, code: string) {
  await writePython(page, code);
}
test("real Python, errors, win, persistence, shop and notebook", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await enter(page);
  await page.screenshot({
    path: ".verification/battle-desktop.png",
    fullPage: true,
  });
  const before = await page
    .getByRole("progressbar")
    .last()
    .getAttribute("aria-valuenow");
  await write(page, "attack(1)");
  await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
  await expect(page.getByTestId("python-output")).toContainText("ยังไม่พบ");
  expect(
    await page.getByRole("progressbar").last().getAttribute("aria-valuenow"),
  ).toBe(before);
  await write(page, ENCOUNTERS[0].solutions[2]);
  await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
  await expect(page.getByRole("progressbar").last()).toHaveAttribute(
    "aria-valuenow",
    "9",
  );
  await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
  await expect(page.locator(".result-panel.won")).toBeVisible();
  await expect(page.locator(".gold-count")).toContainText("30");
  await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "เส้นทางของนักโค้ด" }),
  ).toBeVisible();
  await expect(page.locator(".chapter-dots").first()).toContainText("1/4");
  await page
    .getByRole("button", { name: "ร้านค้านักเดินทาง", exact: true })
    .click();
  await page.getByRole("button", { name: "25 เหรียญ", exact: true }).click();
  await expect(page.locator(".shop-wallet")).toContainText("5");
  await page.getByRole("button", { name: "ปิดหน้าต่าง" }).click();
  await page.getByRole("button", { name: "สมุดบทเรียน", exact: true }).click();
  await page.getByLabel("บันทึกและคาถาของฉัน").fill('print("บันทึกของฉัน")');
  await page.getByRole("button", { name: "ปิดหน้าต่าง" }).click();
  expect(errors).toEqual([]);
});
test("infinite loop and stop leave combat untouched, runtime recovers", async ({
  page,
}) => {
  await enter(page);
  const before = await page
    .getByRole("progressbar")
    .last()
    .getAttribute("aria-valuenow");
  await write(page, "while True:\n    pass");
  await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
  await expect(page.getByTestId("python-output")).toContainText("3 วินาที");
  expect(
    await page.getByRole("progressbar").last().getAttribute("aria-valuenow"),
  ).toBe(before);
  await expect(
    page.getByRole("button", { name: "รันโค้ด", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  await write(page, "while True:\n    pass");
  await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
  await page.getByRole("button", { name: "หยุด", exact: true }).click();
  await expect(page.getByTestId("python-output")).toContainText("หยุดแล้ว");
  expect(
    await page.getByRole("progressbar").last().getAttribute("aria-valuenow"),
  ).toBe(before);
});
test("responsive scenes and editor, keyboard and dialogs", async ({
  page,
}, info) => {
  await enter(page);
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({
      path: `.verification/battle-${width}.png`,
      fullPage: true,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    expect(overflow, `${width}px horizontal overflow`).toBe(false);
    expect(
      await page
        .locator(".cm-editor")
        .evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
    ).toBeGreaterThanOrEqual(16);
  }
  await write(page, ENCOUNTERS[0].solutions[2]);
  await page
    .getByRole("textbox", { name: "เขียนโค้ด Python" })
    .press("Control+Enter");
  await expect(page.getByRole("progressbar").last()).toHaveAttribute(
    "aria-valuenow",
    "9",
  );
  await expect(
    page.getByRole("button", { name: "รันโค้ด", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("textbox", { name: "เขียนโค้ด Python" })
    .press("Control+Enter");
  await expect(page.locator(".result-panel.won")).toBeVisible();
  await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("button", { name: "แผนที่", exact: true })
    .first()
    .click();
  for (const width of [360, 390, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const art = page.locator(".region-art");
    await art.locator("canvas").waitFor();
    // Project the scene's actual actor anchors through the rendered canvas.
    // This fails on the former desktop framing, whose feet fell below the crop.
    const geometry = await art.evaluate((element) => {
      const frame = element.getBoundingClientRect();
      const canvas = element.querySelector("canvas")!;
      const box = canvas.getBoundingClientRect();
      const style = getComputedStyle(canvas);
      let sx = box.width / 800,
        sy = box.height / 450,
        x = box.left,
        y = box.top;
      if (style.objectFit === "cover") {
        sx = sy = Math.max(sx, sy);
        const [px, py] = style.objectPosition
          .split(" ")
          .map((v) => parseFloat(v) / 100);
        x += (box.width - 800 * sx) * px;
        y += (box.height - 450 * sy) * py;
      }
      return {
        feet: frame.bottom - (y + 350 * sy),
        head: y + 230 * sy - frame.top,
        heroLeft: x + 150 * sx - frame.left,
        enemyRight: frame.right - (x + 670 * sx),
        overflow: element.scrollWidth > element.clientWidth,
      };
    });
    expect(geometry.feet, `${width}px actor feet clipped`).toBeGreaterThan(10);
    expect(geometry.head, `${width}px actor head clipped`).toBeGreaterThan(10);
    expect(geometry.heroLeft).toBeGreaterThan(0);
    expect(geometry.enemyRight).toBeGreaterThan(0);
    expect(geometry.overflow).toBe(false);
    await art.screenshot({
      path: `.verification/map-framed-${info.project.name}-${width}.png`,
    });
  }
});
