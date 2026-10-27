import { test, expect, type Page } from "@playwright/test";
import { CHAPTERS, ENCOUNTERS, HEROES } from "../../src/content";
import { startCombat, intentFor } from "../../src/engine";
import { freshSave } from "../../src/storage";
import { writePython } from "./input";
import { mechanicsSave, mechanicsSource } from "./mechanics";
import type { HeroId } from "../../src/types";

async function enter(page: Page, hero = "นักผจญภัย") {
  await page.goto("/");
  const heroId = (Object.keys(HEROES) as HeroId[]).find(
    (id) => HEROES[id].name === hero,
  )!;
  const reduced = await page.evaluate(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const save = mechanicsSave(heroId, reduced);
  await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "isolated-animation.json",
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

async function cast(page: Page, code: string) {
  await writePython(page, mechanicsSource(code));
  await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
}

for (const hero of ["นักผจญภัย", "อัศวิน", "พ่อมด"]) {
  test(`staged skills, healing and victory: ${hero}`, async ({
    browser,
  }, info) => {
    const context = await browser.newContext({
      baseURL: info.project.use.baseURL,
      viewport: { width: 1440, height: 1000 },
      recordVideo: process.env.RECORD_ANIMATIONS
        ? {
            dir: ".verification/animation-recordings",
            size: { width: 1440, height: 1000 },
          }
        : undefined,
    });
    const page = await context.newPage();
    const video = page.video();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      await enter(page, hero);
      const scene = page.locator(".pixel-scene");
      const resting = await scene.screenshot();
      await page.waitForTimeout(500);
      expect(await scene.screenshot()).not.toEqual(resting);

      await cast(page, 'print("ตั้งรับ")\ndefend()');
      await expect(scene).toHaveAttribute("aria-busy", "true");
      await expect(scene).toHaveAttribute("aria-busy", "false");

      await cast(page, 'print("สกิลประจำอาชีพ")\nskill()\nheal()');
      await expect(scene).toHaveAttribute("aria-busy", "true");
      await page.waitForTimeout(hero === "พ่อมด" ? 510 : 400);
      await page.screenshot({
        path: `.verification/skill-${info.project.name}-${hero}.png`,
        fullPage: true,
      });
      await expect(scene).toHaveAttribute("aria-busy", "false");

      // The run control waits for contact/recovery before accepting another turn.
      await cast(page, 'print("ปิดฉาก")\nattack()\nattack()\nattack()');
      await expect(scene).toHaveAttribute("aria-busy", "true");
      await expect(scene).toHaveAttribute("aria-busy", "false");
      if (!(await page.locator(".result-panel.won").isVisible()))
        await page
          .getByRole("button", { name: "รันโค้ด", exact: true })
          .click();
      await expect(page.locator(".result-panel.won")).toBeVisible();
      await expect(scene).toHaveAttribute("aria-busy", "false");
      await page.screenshot({
        path: `.verification/animation-${info.project.name}-${hero}.png`,
        fullPage: true,
      });
      expect(errors).toEqual([]);
    } finally {
      await context.close();
      await video?.saveAs(
        `.verification/animation-${info.project.name}-${hero}.webm`,
      );
    }
  });
}

test("reduced motion is still, preferences do not replay turns, navigation cancels presentation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  const scene = page.locator(".pixel-scene");
  const resting = await scene.screenshot();
  await page.waitForTimeout(500);
  expect(await scene.screenshot()).toEqual(resting);
  await cast(page, 'print("โล่")\ndefend()');
  await expect(scene).toHaveAttribute("aria-busy", "true");
  await expect(scene).toHaveAttribute("aria-busy", "false");
  await page.waitForTimeout(600); // Allow the static result labels to clear.
  const settled = await scene.screenshot();
  await page.waitForTimeout(500);
  expect(await scene.screenshot()).toEqual(settled);

  await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  await page
    .locator(".settings-row")
    .filter({ hasText: "ลดการเคลื่อนไหว" })
    .getByRole("button")
    .click();
  await page.getByRole("button", { name: "ปิดหน้าต่าง" }).click();
  await expect(page.locator(".pixel-scene canvas")).toBeVisible();
  await expect(scene).toHaveAttribute("aria-busy", "false");
  await cast(page, 'print("เดินทางต่อ")\nattack()');
  await expect(scene).toHaveAttribute("aria-busy", "true");
  await page.waitForTimeout(310);
  await page.screenshot({
    path: ".verification/animation-mobile-battle.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "แผนที่", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "เส้นทางของนักโค้ด" }),
  ).toBeVisible();
  await expect(scene).toHaveAttribute("aria-busy", "false");
  await page.screenshot({
    path: ".verification/animation-mobile-map.png",
    fullPage: true,
  });
});

test("HP changes at contact, duplicate shortcuts are ignored during playback, checkpoints remain real", async ({
  page,
}) => {
  await enter(page);
  const samples = page.evaluate(
    () =>
      new Promise<{ elapsed: number; hp: string | null }>((resolve) => {
        const scene = document.querySelector(".pixel-scene")!;
        const meter = document.querySelectorAll('[role="progressbar"]')[1];
        const initial = meter.getAttribute("aria-valuenow");
        let start = 0;
        const observer = new MutationObserver(() => {
          if (!start && scene.getAttribute("aria-busy") === "true")
            start = performance.now();
          const hp = meter.getAttribute("aria-valuenow");
          if (start && hp !== initial) {
            observer.disconnect();
            resolve({ elapsed: performance.now() - start, hp });
          }
        });
        observer.observe(document.querySelector(".combat-panel")!, {
          subtree: true,
          attributes: true,
          attributeFilter: ["aria-busy", "aria-valuenow"],
        });
      }),
  );
  await cast(page, 'print("หนึ่งคำสั่ง")\nattack()');
  await expect(
    page.getByRole("button", { name: "รันโค้ด", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "เขียนโค้ด Python" })
    .press("Control+Enter");
  const contact = await samples;
  expect(contact.elapsed).toBeGreaterThan(150);
  expect(contact.hp).toBe("25");
  await expect(page.locator(".pixel-scene")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(page.getByRole("progressbar").last()).toHaveAttribute(
    "aria-valuenow",
    "25",
  );
  await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
  await page.reload();
  await expect(page.getByRole("progressbar").last()).toHaveAttribute(
    "aria-valuenow",
    "25",
  );
});

test("every boss silhouette can charge, strike and recover without renderer errors", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  for (const chapter of CHAPTERS) {
    const encounter = chapter.encounters[3];
    const save = freshSave();
    save.hero = "adventurer";
    save.onboarding = true;
    save.completed = ENCOUNTERS.map((e) => e.id);
    save.battle = startCombat(save, encounter.id);
    // A valid resumed heavy turn exercises contact for all six enemy rigs.
    save.battle.turn = 2;
    save.battle.intent = intentFor(
      encounter.id,
      2,
      save.battle.enemyHp,
      save.battle.maxEnemyHp,
    );
    await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
    await page.locator("input[type=file]").setInputFiles({
      name: "animation-checkpoint.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(save)),
    });
    await page.getByRole("button", { name: "ใช้บันทึกจากไฟล์นี้" }).click();
    await expect(
      page.getByRole("heading", { name: encounter.title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "รันโค้ด", exact: true }),
    ).toBeEnabled({ timeout: 60000 });
    await cast(page, encounter.solutions[0]);
    await expect(page.getByTestId("python-output")).toContainText("รันสำเร็จ");
    await expect(page.getByRole("progressbar").first()).not.toHaveAttribute(
      "aria-valuenow",
      String(save.battle.hp),
    );
    await page.screenshot({
      path: `.verification/boss-motion-${info.project.name}-${chapter.id}.png`,
      fullPage: true,
    });
    await expect(page.locator(".pixel-scene")).toHaveAttribute(
      "aria-busy",
      "false",
    );
  }
  expect(errors).toEqual([]);
});
