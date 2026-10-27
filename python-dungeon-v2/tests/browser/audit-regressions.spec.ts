import { test, expect, type Page } from "@playwright/test";
import { freshSave } from "../../src/storage";
import { startCombat } from "../../src/engine";
import type { SaveGameV1 } from "../../src/types";
import { writePython } from "./input";
import { mechanicsSave, mechanicsSource } from "./mechanics";

async function stored(page: Page): Promise<SaveGameV1> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("runecode-save", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("game", "readonly");
          const read = tx.objectStore("game").get("save");
          tx.oncomplete = () => {
            db.close();
            resolve(read.result);
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
  );
}

async function importSave(page: Page, save: SaveGameV1) {
  await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "audit.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(save)),
  });
  await page.getByRole("button", { name: "ใช้บันทึกจากไฟล์นี้" }).click();
  await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
}

test("a stale tab cannot overwrite newer progress even when its local revision is higher", async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    delete (window as any).BroadcastChannel;
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "เริ่มการผจญภัย", exact: true })
    .click();
  await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.locator(".footer")).toContainText("บันทึกแล้ว");
  await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  await page.evaluate(() => {
    const originalSet = window.setTimeout.bind(window);
    const originalClear = window.clearTimeout.bind(window);
    const held = new Map<number, () => void>();
    let next = -1;
    window.setTimeout = ((
      callback: TimerHandler,
      delay?: number,
      ...args: unknown[]
    ) => {
      if (delay !== 450 || typeof callback !== "function")
        return originalSet(callback, delay, ...args);
      const id = next--;
      held.set(id, () => callback(...args));
      return id;
    }) as typeof window.setTimeout;
    window.clearTimeout = (id) => {
      if (typeof id === "number") held.delete(id);
      originalClear(id);
    };
    (window as unknown as { releaseAuditSaves: () => void }).releaseAuditSaves =
      () => {
        window.setTimeout = originalSet;
        window.clearTimeout = originalClear;
        for (const callback of held.values()) callback();
        held.clear();
      };
  });
  const motion = page.locator(".settings-row").nth(1).getByRole("button");
  await motion.click();
  await motion.click();
  await motion.click();
  await other.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  await other.locator(".settings-row").first().getByRole("button").click();
  await expect(other.locator(".footer")).toContainText("บันทึกแล้ว");
  const newer = await stored(other);
  expect(newer.settings.sound).toBe(true);
  await page.evaluate(() =>
    (
      window as unknown as { releaseAuditSaves: () => void }
    ).releaseAuditSaves(),
  );
  await expect(page.locator(".banner.error")).toContainText("อีกแท็บ");
  expect(await stored(other)).toEqual(newer);
});

test("shop reserves survive a turn, a victory, reload and entering the next room", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const save = freshSave();
  save.hero = "adventurer";
  save.gold = 100;
  save.settings.reducedMotion = true;
  save.battle = startCombat(save, "1-1");
  save.battle.hp -= 40;
  await importSave(page, save);
  const run = page.getByRole("button", { name: "รันโค้ด", exact: true });
  await expect(run).toBeEnabled({ timeout: 60000 });
  await page.getByRole("button", { name: "ร้านค้า", exact: true }).click();
  await page.locator(".shop-item").first().getByRole("button").click();
  await expect(page.locator(".shop-item").first()).toContainText("4 ขวด");
  await page.screenshot({
    path: `.verification/audit-shop-${info.project.name}-390.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "ปิดหน้าต่าง", exact: true }).click();
  await writePython(page, 'print("Moon", "Gate")\nheal()\nattack(1)');
  await run.click();
  await expect(run).toBeEnabled();
  await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
  expect((await stored(page)).potions).toBe(3);
  expect((await stored(page)).battle!.potions).toBe(2);
  await page.reload();
  await expect(run).toBeEnabled({ timeout: 60000 });
  await writePython(page, 'print("Moon", "Gate")\nskill(1)\ndefend()');
  await run.click();
  await expect(run).toBeEnabled();
  await writePython(page, 'print("Moon", "Gate")\nattack(1)\ndefend()');
  await run.click();
  await expect(page.getByRole("button", { name: /ห้องถัดไป/ })).toBeVisible();
  expect((await stored(page)).potions).toBe(3);
  await page.getByRole("button", { name: /ห้องถัดไป/ }).click();
  await expect(run).toBeEnabled();
  await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
  expect((await stored(page)).battle!.potions).toBe(3);
});

test("malformed active saves are rejected without changing the stored checkpoint", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "เริ่มการผจญภัย", exact: true })
    .click();
  await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
  const before = await stored(page);
  await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  for (const patch of [
    { hp: 0 },
    { enemyHp: 0 },
    { encounterId: ["1-1"] },
    { status: "won" },
    { potions: 100 },
  ]) {
    const incoming = structuredClone(before);
    incoming.battle = { ...startCombat(incoming, "1-1"), ...patch } as any;
    await page.locator('input[type="file"]').setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(incoming)),
    });
    await expect(page.locator(".toast")).toContainText("ไม่ถูกต้อง");
    await expect(page.getByRole("dialog")).toContainText("ตั้งค่าและบันทึก");
    expect(await stored(page)).toEqual(before);
  }
});

test("real worker isolates math and preserves Python print formatting", async ({
  page,
}, info) => {
  await page.goto("/");
  await importSave(page, mechanicsSave("adventurer"));
  const check = page.getByRole("button", { name: "ตรวจแผน", exact: true });
  await expect(check).toBeEnabled({ timeout: 60000 });
  const before = (await stored(page)).battle;
  await writePython(page, "import math\nmath.pi = 0\nattack()");
  await check.click();
  await expect(page.getByTestId("python-output")).toContainText("ยังไม่พบ");
  await writePython(
    page,
    mechanicsSource(
      'import math\nprint("Rune", end="")\nprint("Code", math.ceil(math.pi), sep=None, end=None)\nattack()',
    ),
  );
  await check.click();
  await expect(
    page.getByRole("region", { name: "ข้อความที่พิมพ์", exact: true }),
  ).toHaveText("RuneCode 4");
  await expect(page.getByRole("region", { name: "ผลตรวจแผน" })).toBeVisible();
  expect((await stored(page)).battle).toEqual(before);
  await page.screenshot({
    path: `.verification/audit-python-${info.project.name}.png`,
    fullPage: true,
  });
});
