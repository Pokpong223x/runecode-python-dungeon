import { test, expect, type Page } from "@playwright/test";
import { validateSave } from "../../src/storage";

for (const newer of [false, true])
  test(`initial loading distinguishes ${newer ? "newer" : "identical"} broadcast checkpoints`, async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
    const other = await context.newPage();
    await other.addInitScript(() => {
      const audit = window as unknown as {
        releaseBootRead?: () => void;
        bootBroadcastSeen?: boolean;
      };
      const observer = new BroadcastChannel("runecode-save-updates");
      observer.onmessage = () => {
        audit.bootBroadcastSeen = true;
      };
      const descriptor = Object.getOwnPropertyDescriptor(
        IDBRequest.prototype,
        "onsuccess",
      )!;
      let held = false;
      Object.defineProperty(IDBRequest.prototype, "onsuccess", {
        configurable: true,
        get: descriptor.get,
        set(handler: ((event: Event) => void) | null) {
          const request = this as IDBRequest;
          descriptor.set!.call(
            this,
            handler &&
              ((event: Event) => {
                if (
                  !held &&
                  request.source instanceof IDBObjectStore &&
                  request.source.name === "game" &&
                  request.source.transaction.mode === "readonly"
                ) {
                  held = true;
                  audit.releaseBootRead = () => handler.call(request, event);
                } else handler.call(request, event);
              }),
          );
        },
      });
    });
    await other.goto("/");
    await expect
      .poll(() =>
        other.evaluate(
          () =>
            typeof (window as unknown as { releaseBootRead?: () => void })
              .releaseBootRead,
        ),
      )
      .toBe("function");
    // Reloading emits the same saved revision without any user mutation.
    await page.reload();
    await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
    if (newer) {
      await page
        .getByRole("button", { name: "เริ่มการผจญภัย", exact: true })
        .click();
      await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
    }
    const owner = await rawSave(page);
    await expect
      .poll(() =>
        other.evaluate(
          () =>
            (window as unknown as { bootBroadcastSeen?: boolean })
              .bootBroadcastSeen,
        ),
      )
      .toBe(true);
    await other.waitForTimeout(100);
    await other.evaluate(() =>
      (window as unknown as { releaseBootRead: () => void }).releaseBootRead(),
    );
    await expect(
      other.getByRole("button", { name: "เริ่มการผจญภัย", exact: true }),
    ).toBeVisible();
    await expect(other.locator(".banner.error")).toHaveCount(newer ? 1 : 0);
    if (!newer)
      await expect(other.locator(".footer")).toContainText("บันทึกแล้ว");
    expect(await rawSave(page)).toEqual(owner);
  });

async function rawSave(page: Page, replacement?: unknown): Promise<unknown> {
  return page.evaluate(
    ({ replacement }) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("runecode-save", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(
            "game",
            replacement === undefined ? "readonly" : "readwrite",
          );
          const store = tx.objectStore("game");
          const operation =
            replacement === undefined
              ? store.get("save")
              : store.put(replacement, "save");
          tx.oncomplete = () => {
            db.close();
            resolve(operation.result);
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
    { replacement },
  );
}

test("corrupt stored data stays untouched until an explicit confirmed reset", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
  const corrupt = {
    version: 1,
    hero: "wizard",
    notes: "ข้อมูลเดิมที่ยังต้องเก็บ",
    revision: "broken",
  };
  await rawSave(page, corrupt);
  await page.reload();
  await expect(page.locator(".banner.error")).toContainText(
    "ยังไม่ได้เขียนทับ",
  );
  expect(await rawSave(page)).toEqual(corrupt);
  await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  await page.getByRole("button", { name: "เริ่มเกมใหม่", exact: true }).click();
  await page
    .getByRole("button", { name: "เก็บการเดินทางเดิมไว้", exact: true })
    .click();
  expect(await rawSave(page)).toEqual(corrupt);
  await page.getByRole("button", { name: "เริ่มเกมใหม่", exact: true }).click();
  await page
    .getByRole("button", { name: "ยืนยันเริ่มใหม่", exact: true })
    .click();
  await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
  const reset = await rawSave(page);
  expect(validateSave(reset)).toBe(true);
  expect(reset).toMatchObject({
    hero: null,
    gold: 0,
    battle: null,
    completed: [],
    notes: "",
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "เริ่มการผจญภัย", exact: true }),
  ).toBeEnabled();
  expect(errors).toEqual([]);
});

test("canceling a reset preserves progress and a confirmed reset persists on reload", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "เริ่มการผจญภัย", exact: true })
    .click();
  await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
  const before = await rawSave(page);
  await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  await page.getByRole("button", { name: "เริ่มเกมใหม่", exact: true }).click();
  await page
    .getByRole("button", { name: "เก็บการเดินทางเดิมไว้", exact: true })
    .click();
  expect(await rawSave(page)).toEqual(before);
  await page.getByRole("button", { name: "เริ่มเกมใหม่", exact: true }).click();
  await page
    .getByRole("button", { name: "ยืนยันเริ่มใหม่", exact: true })
    .click();
  await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
  const reset = await rawSave(page);
  expect(validateSave(reset)).toBe(true);
  expect(reset).toMatchObject({ hero: null, completed: [], battle: null });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "เริ่มการผจญภัย", exact: true }),
  ).toBeEnabled();
  expect(await rawSave(page)).toEqual(reset);
});
