import { test, expect, type Page } from "@playwright/test";
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

test("short viewport reveals actionable errors beside Run without opening the editor keyboard", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 500 });
  await enter(page);
  for (const width of [390, 360, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 500 });
    await writePython(page, 'print("Moon", "Gate")\nattack(4)');
    const submit = page.getByRole("button", {
      name: width === 360 ? "ตรวจแผน" : "รันโค้ด",
      exact: true,
    });
    const enemy = await page
      .getByRole("progressbar")
      .last()
      .getAttribute("aria-valuenow");
    await submit.click();
    const diagnostic = page.locator(".diagnostic-message");
    await expect(diagnostic).toContainText("พลังต้องเป็นจำนวนเต็ม 1 ถึง 3");
    await expect(diagnostic).toBeInViewport({ ratio: 1 });
    if (width !== 360) await expect(submit).toBeFocused();
    // Check plan is natively disabled while running and may lose focus then;
    // revealing feedback must never refocus the editor or open its keyboard.
    await expect(
      page.getByRole("textbox", { name: "เขียนโค้ด Python" }),
    ).not.toBeFocused();
    await expect(page.getByRole("progressbar").last()).toHaveAttribute(
      "aria-valuenow",
      enemy!,
    );
    const gap = await page.evaluate(
      () =>
        document.querySelector(".output-box")!.getBoundingClientRect().top -
        document.querySelector(".code-workspace")!.getBoundingClientRect()
          .bottom,
    );
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThanOrEqual(24);
    expect(
      await diagnostic
        .locator("p")
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(16);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({
      path: `.verification/feedback-${info.project.name}-${width}.png`,
    });
    await page.getByRole("button", { name: "ไปบรรทัด 2", exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "เขียนโค้ด Python" }),
    ).toBeFocused();
    await expect(
      page.locator('.cm-error-line[data-error-line="2"]'),
    ).toBeVisible();
  }
});

test("long output scrolls within its own frame while the correction stays readable", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await enter(page);
  await writePython(
    page,
    'for i in range(64):\n    print("บันทึกรูน" * 6, i)\nattack(4)',
  );
  await page.getByRole("button", { name: "ตรวจแผน", exact: true }).click();
  const diagnostic = page.locator(".diagnostic-message");
  await expect(diagnostic).toContainText("พลังต้องเป็นจำนวนเต็ม 1 ถึง 3");
  await expect(diagnostic).toBeInViewport({ ratio: 1 });
  const stdout = page.getByRole("region", { name: "ข้อความที่พิมพ์" });
  await expect(stdout.locator("pre")).toHaveCount(64);
  expect((await stdout.boundingBox())!.height).toBeLessThanOrEqual(240);
  expect(await stdout.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );
  await stdout.focus();
  await stdout.press("PageDown");
  await expect
    .poll(() => stdout.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: `.verification/feedback-output-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "ไปบรรทัด 3", exact: true }).click();
  await writePython(page, 'for i in range(1000):\n    print("")\nattack()');
  await page.getByRole("button", { name: "ตรวจแผน", exact: true }).click();
  await expect(diagnostic).toContainText("ผลพิมพ์มากเกินไป");
  await expect(diagnostic).not.toContainText("3 วินาที");
  await expect(stdout.locator("pre")).toHaveCount(128);
  await expect(
    page.getByRole("button", { name: "รันโค้ด", exact: true }),
  ).toBeEnabled();
});

test("background runtime feedback cannot scroll a modal or steal its focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 500 });
  await enter(page);
  await writePython(page, "while True:\n    pass");
  await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
  const settings = page.getByRole("button", { name: "ตั้งค่า", exact: true });
  await settings.click();
  const close = page.getByRole("button", { name: "ปิดหน้าต่าง", exact: true });
  await close.focus();
  const y = await page.evaluate(() => scrollY);
  await expect(page.getByTestId("python-output")).toContainText("3 วินาที");
  await expect(close).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBe(y);
  await page.keyboard.press("Escape");
  await expect(settings).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBe(y);
});
