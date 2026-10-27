import { test, expect } from "@playwright/test";
import { freshSave } from "../../src/storage";
import { startCombat } from "../../src/engine";
import { HERO_SKILLS, skillCommand } from "../../src/skills";
import type { HeroId } from "../../src/types";

for (const hero of Object.keys(HERO_SKILLS) as HeroId[]) {
  test(`${hero}: tactical skills render contact and interruption with complete actors`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({
      width: hero === "wizard" ? 390 : 1440,
      height: 900,
    });
    const save = freshSave();
    save.hero = hero;
    save.onboarding = true;
    save.settings.reducedMotion = false;
    save.battle = startCombat(save, "1-1");
    save.battle.enemyHp = save.battle.maxEnemyHp = 180;
    save.drafts["1-1"] = 'print("Moon", "Gate")\nattack(1)\ndefend()';
    await page.goto("/");
    await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
    await page.locator("input[type=file]").setInputFiles({
      name: "isolated-skill-motion.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(save)),
    });
    await page
      .getByRole("button", { name: "ใช้บันทึกจากไฟล์นี้", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "รันโค้ด", exact: true }),
    ).toBeEnabled({ timeout: 60000 });
    const tools = page.getByRole("region", { name: "สกิลฝั่งผู้เล่น" });
    for (const skill of HERO_SKILLS[hero].slice(1)) {
      await tools
        .getByRole("button", { name: new RegExp(`^${skill.name}`) })
        .click();
      await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
      await expect(page.locator(".pixel-scene")).toHaveAttribute(
        "aria-busy",
        "true",
      );
      await expect(page.locator(".scene-cue")).toContainText(skill.name);
      await expect(page.locator(".scene-cue")).toContainText(
        `${skillCommand(skill.id)}(1)`,
      );
      await expect(
        tools.getByRole("button", { name: new RegExp(`^${skill.name}`) }),
      ).toBeDisabled();
      await page.waitForTimeout(hero === "wizard" ? 610 : 460);
      await page.locator(".scene-frame").screenshot({
        path: `.verification/skill-motion-${info.project.name}-${hero}-${skill.id}.png`,
      });
      if (skill.stun) {
        await expect(page.locator(".scene-cue")).toContainText(
          "ขัดจังหวะสำเร็จ",
        );
        await expect(page.locator(".scene-cue")).toContainText("ข้ามการตอบโต้");
      }
      await expect(page.locator(".pixel-scene")).toHaveAttribute(
        "aria-busy",
        "false",
      );
    }
    expect(errors).toEqual([]);
  });
}
