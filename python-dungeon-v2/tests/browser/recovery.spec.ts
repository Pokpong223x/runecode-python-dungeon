import { test, expect } from "@playwright/test";
import { writePython } from "./input";
import { ENCOUNTERS } from "../../src/content";

test("a changed checkpoint never renders with the previous saved label", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const testWindow = window as unknown as Window & {
      firstMapSaveLabel: string | null;
    };
    testWindow.firstMapSaveLabel = null;
    new MutationObserver(() => {
      if (
        testWindow.firstMapSaveLabel === null &&
        document.querySelector("h1")?.textContent === "เส้นทางของนักโค้ด"
      )
        testWindow.firstMapSaveLabel =
          document.querySelector(".footer")?.textContent ?? "";
    }).observe(document, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
  await page.goto("/");
  await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
  await page
    .getByRole("button", { name: "เริ่มการผจญภัย", exact: true })
    .click();
  const firstLabel = await page.evaluate(
    () =>
      (window as unknown as Window & { firstMapSaveLabel: string | null })
        .firstMapSaveLabel,
  );
  expect(firstLabel).toContain("กำลังบันทึก");
  await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "เส้นทางของนักโค้ด", exact: true }),
  ).toBeVisible();
});

test("a delayed older save cannot announce the latest checkpoint as saved", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const testWindow = window as unknown as Window & {
      heldSaveCommits: Array<() => void>;
    };
    testWindow.heldSaveCommits = [];
    const descriptor = Object.getOwnPropertyDescriptor(
      IDBTransaction.prototype,
      "oncomplete",
    )!;
    Object.defineProperty(IDBTransaction.prototype, "oncomplete", {
      configurable: true,
      get: descriptor.get,
      set(handler: ((event: Event) => void) | null) {
        descriptor.set!.call(
          this,
          handler &&
            ((event: Event) => {
              if (this.db.name === "runecode-save" && this.mode === "readwrite")
                testWindow.heldSaveCommits.push(() =>
                  handler.call(this, event),
                );
              else handler.call(this, event);
            }),
        );
      },
    });
  });
  await page.goto("/");
  const heldCount = () =>
    page.evaluate(
      () =>
        (window as unknown as Window & { heldSaveCommits: Array<() => void> })
          .heldSaveCommits.length,
    );
  await expect.poll(heldCount).toBe(1);
  await page
    .getByRole("button", { name: "เริ่มการผจญภัย", exact: true })
    .click();
  await page.evaluate(() =>
    (
      window as unknown as Window & { heldSaveCommits: Array<() => void> }
    ).heldSaveCommits[0](),
  );
  await expect.poll(heldCount).toBe(2);
  await expect(page.locator(".footer")).toContainText("กำลังบันทึก");
  await page.evaluate(() =>
    (
      window as unknown as Window & { heldSaveCommits: Array<() => void> }
    ).heldSaveCommits[1](),
  );
  await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "เส้นทางของนักโค้ด", exact: true }),
  ).toBeVisible();
});
test("active battle and draft survive reload; mobile has complete navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "เริ่มการผจญภัย", exact: true })
    .click();
  await page.locator(".encounter-row").first().click();
  await expect(
    page.getByRole("button", { name: "รันโค้ด", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  const editor = page.getByRole("textbox", { name: "เขียนโค้ด Python" });
  await writePython(
    page,
    '# คาถาที่ฉันเขียน\nprint("Moon", "Gate")\nattack(1)',
  );
  await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
  await expect(page.getByRole("progressbar").last()).toHaveAttribute(
    "aria-valuenow",
    "25",
  );
  await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: ENCOUNTERS[0].title }),
  ).toBeVisible();
  await expect(editor).toContainText("คาถาที่ฉันเขียน");
  await expect(page.getByRole("progressbar").last()).toHaveAttribute(
    "aria-valuenow",
    "25",
  );
  await page
    .getByRole("button", { name: "แผนที่", exact: true })
    .first()
    .click();
  await page.locator(".encounter-row").first().click();
  await expect(page.getByRole("progressbar").last()).toHaveAttribute(
    "aria-valuenow",
    "25",
  );
  await page.getByRole("button", { name: "สมุดบทเรียน", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "ปิดหน้าต่าง" }).click();
  await page.getByRole("button", { name: "ร้านค้า", exact: true }).click();
  await expect(page.locator(".shop-wallet")).toBeVisible();
  await page.getByRole("button", { name: "ปิดหน้าต่าง" }).click();
  await page.setViewportSize({ width: 390, height: 420 });
  await editor.scrollIntoViewIfNeeded();
  await editor.click();
  await page.getByRole("button", { name: "แทรก ↹" }).click();
  await expect(editor).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("invalid import preserves save; valid import requires confirmation", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "เริ่มการผจญภัย", exact: true })
    .click();
  await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":999}'),
  });
  await expect(page.locator(".toast")).toContainText("ไม่ถูกต้อง");
  await expect(page.getByRole("dialog")).toContainText("ตั้งค่าและบันทึก");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "ส่งออกไฟล์", exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  let json = "";
  for await (const chunk of stream!) json += chunk.toString();
  const candidate = JSON.parse(json);
  candidate.gold = 99;
  await page.locator("input[type=file]").setInputFiles({
    name: "save.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(candidate)),
  });
  await expect(page.getByRole("dialog")).toContainText("นำเข้าบันทึกการผจญภัย");
  await expect(page.locator(".gold-count")).toContainText("0");
  await page.getByRole("button", { name: "ใช้บันทึกจากไฟล์นี้" }).click();
  await expect(page.locator(".gold-count")).toContainText("99");
});
test("newer save in another tab prevents stale writes", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "เริ่มการผจญภัย", exact: true })
    .click();
  await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
  const other = await context.newPage();
  await other.goto("/");
  await expect(
    other.getByRole("heading", { name: "เส้นทางของนักโค้ด", exact: true }),
  ).toBeVisible();
  await other.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  await other.locator(".settings-row").first().getByRole("button").click();
  await expect(other.locator(".footer")).toContainText("บันทึกแล้ว");
  await expect(page.locator(".banner.error")).toContainText("อีกแท็บ");
  await expect(page.locator(".footer")).toContainText("หยุดบันทึก");
  await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  await page.locator(".settings-row").nth(1).getByRole("button").click();
  await expect(page.locator(".footer")).toContainText("หยุดบันทึก");
  await other.reload();
  await other.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  await expect(
    other.locator(".settings-row").first().getByRole("button"),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    other.locator(".settings-row").nth(1).getByRole("button"),
  ).toHaveAttribute("aria-pressed", "false");
});
