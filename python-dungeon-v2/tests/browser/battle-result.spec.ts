import { test, expect, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { startCombat } from "../../src/engine";
import { freshSave } from "../../src/storage";
import type { SaveGameV1 } from "../../src/types";

const ownCode = 'print("Moon", "Gate")\nattack(1)';

// Isolated near-terminal fixtures exercise presentation, not campaign proof.
async function enter(page: Page, outcome: "won" | "lost", reduced = true) {
  const save = freshSave();
  save.hero = "adventurer";
  save.onboarding = true;
  save.gold = outcome === "lost" ? 87 : 0;
  save.settings.reducedMotion = reduced;
  save.battle = {
    ...startCombat(save, "1-1"),
    hp: outcome === "lost" ? 1 : 101,
    enemyHp: outcome === "won" ? 1 : 37,
  };
  save.drafts["1-1"] = ownCode;
  await page.goto("/");
  await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "isolated-result-presentation.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(save)),
  });
  await page
    .getByRole("button", { name: "ใช้บันทึกจากไฟล์นี้", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "รันโค้ด", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
  await expect(page.locator(".toast")).toHaveText("");
}

async function exportedSave(page: Page): Promise<SaveGameV1> {
  await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "ส่งออกไฟล์", exact: true }).click();
  const stream = await (await pending).createReadStream();
  let json = "";
  for await (const chunk of stream!) json += chunk.toString();
  await page.getByRole("button", { name: "ปิดหน้าต่าง", exact: true }).click();
  return JSON.parse(json);
}

test("victory result is near code, reveals its next action and supports native keyboard at every width", async ({
  page,
}, info) => {
  const geometry: unknown[] = [];
  for (const viewport of [
    { width: 390, height: 500 },
    { width: 360, height: 800 },
    { width: 768, height: 900 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    await enter(page, "won");
    await page
      .getByRole("textbox", { name: "เขียนโค้ด Python" })
      .press("Control+Enter");
    const result = page.getByRole("region", { name: "ผลการต่อสู้" });
    await expect(result).toBeVisible();
    await expect(
      page.locator(".coding-column > .result-panel.won"),
    ).toHaveCount(1);
    const title = result.getByRole("heading", {
      name: "อีกหนึ่งก้าวของนักโค้ด!",
      exact: true,
    });
    const next = result.getByRole("button", {
      name: "ไปห้องถัดไป",
      exact: true,
    });
    await expect(title).toBeFocused();
    await expect(title).toBeInViewport();
    await expect(next).toBeInViewport({ ratio: 1 });
    await expect(page.locator(".scene-frame .pixel-scene")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    expect(
      await result
        .locator("p")
        .first()
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(16);
    for (const button of await result.getByRole("button").all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    geometry.push(
      await page.evaluate((viewport) => {
        const box = (selector: string) => {
          const rect = document
            .querySelector(selector)!
            .getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom, height: rect.height };
        };
        return {
          viewport,
          origin: location.origin,
          scrollY,
          result: box(".result-panel"),
          heading: box(".result-panel h2"),
          primary: box(".result-panel .primary"),
          focused: document.activeElement?.tagName,
        };
      }, viewport),
    );
    await writeFile(
      `.verification/result-after-${info.project.name}.json`,
      JSON.stringify(geometry, null, 2),
    );
    await page.screenshot({
      path: `.verification/battle-result-win-${info.project.name}-${viewport.width}.png`,
    });
    const after = await exportedSave(page);
    expect(after.completed).toEqual(["1-1"]);
    expect(after.gold).toBe(30);
    expect(after.stars["1-1"]).toBe(3);
    expect(after.battle!.enemyHp).toBe(0);
    expect(after.battle!.hp).toBe(101);
    expect(after.drafts["1-1"]).toBe(ownCode);
    await expect(
      page.getByRole("button", { name: "ตั้งค่า", exact: true }),
    ).toBeFocused();
    // Return deliberately to the result: closing settings must not replay reveal.
    await title.focus();
    await page.keyboard.press("Tab");
    await expect(next).toBeFocused();
    await next.press("Enter");
    await expect(
      page.getByRole("heading", {
        name: "Notes Beside the Sword",
        exact: true,
      }),
    ).toBeVisible();
    await expect(result).toHaveCount(0);
  }
});

test("defeat reveals retry without a penalty and preserves the original draft", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 500 });
  await enter(page, "lost");
  await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
  const result = page.getByRole("region", { name: "ผลการต่อสู้" });
  const title = result.getByRole("heading", {
    name: "พักหายใจ แล้วลองอีกครั้ง",
    exact: true,
  });
  const retry = result.getByRole("button", {
    name: "ลองห้องนี้อีกครั้ง",
    exact: true,
  });
  await expect(title).toBeFocused();
  await expect(title).toBeInViewport();
  await expect(retry).toBeInViewport({ ratio: 1 });
  await page.screenshot({
    path: `.verification/battle-result-loss-${info.project.name}-390.png`,
  });
  const after = await exportedSave(page);
  expect(after.battle!.status).toBe("lost");
  expect(after.battle!.hp).toBe(0);
  expect(after.gold).toBe(87);
  expect(after.completed).toEqual([]);
  expect(after.stars).toEqual({});
  expect(after.drafts["1-1"]).toBe(ownCode);
  await title.focus();
  await page.keyboard.press("Tab");
  await expect(retry).toBeFocused();
  await retry.press("Enter");
  await expect(
    page.getByRole("button", { name: "รันโค้ด", exact: true }),
  ).toBeEnabled();
  await expect(result).toHaveCount(0);
  const restarted = await exportedSave(page);
  expect(restarted.gold).toBe(87);
  expect(restarted.drafts["1-1"]).toBe(ownCode);
  expect(restarted.battle!.hp).toBe(restarted.battle!.maxHp);
  expect(restarted.battle!.mp).toBe(restarted.battle!.maxMp);
  expect(restarted.battle!.turn).toBe(1);
});

test("a result completed behind settings cannot steal focus or replay reveal after closing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 500 });
  await enter(page, "won", false);
  await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
  await expect(page.locator(".scene-frame .pixel-scene")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  const settings = page.getByRole("button", { name: "ตั้งค่า", exact: true });
  await settings.click();
  const close = page.getByRole("button", { name: "ปิดหน้าต่าง", exact: true });
  await close.focus();
  const y = await page.evaluate(() => scrollY);
  await expect(page.locator(".result-panel.won")).toBeAttached();
  await expect(close).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBe(y);
  await page.keyboard.press("Escape");
  await expect(settings).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBe(y);
  await settings.click();
  await page.keyboard.press("Escape");
  await expect(settings).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBe(y);
  await expect(page.locator(".coding-column > .result-panel.won")).toHaveCount(
    1,
  );
});
