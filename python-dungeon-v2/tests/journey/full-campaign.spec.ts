import { test, expect, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { ENCOUNTERS, HEROES } from "../../src/content";
import { validateSave } from "../../src/storage";
import type { HeroId, SaveGameV1 } from "../../src/types";
import { writePython } from "../browser/input";

/** Observe the real committed database; never inject or edit a checkpoint. */
async function storedSave(page: Page): Promise<SaveGameV1> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("runecode-save", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("game", "readonly");
          const read = transaction.objectStore("game").get("save");
          let value: unknown;
          read.onsuccess = () => {
            value = read.result;
          };
          transaction.oncomplete = () => {
            database.close();
            resolve(value as SaveGameV1);
          };
          transaction.onabort = transaction.onerror = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
  );
}

const widths: Record<HeroId, number> = {
  adventurer: 1440,
  knight: 768,
  wizard: 390,
};

for (const hero of Object.keys(HEROES) as HeroId[]) {
  test(`fresh full campaign without imports or upgrades: ${hero}`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const completed: Array<{
      room: string;
      turns: number;
      hp: number;
      maxHp: number;
      mp: number;
      stars: number;
      gold: number;
    }> = [];
    const startedAt = new Date().toISOString();
    let build: string | null = null;
    const evidence = `.verification/full-campaign-${info.project.name}-${hero}.json`;
    let gold = 0;
    try {
      await page.setViewportSize({ width: widths[hero], height: 900 });
      await page.goto("/");
      build = await page.locator('script[type="module"]').getAttribute("src");
      await expect(
        page.getByRole("button", { name: "เริ่มการผจญภัย", exact: true }),
      ).toBeVisible();
      await page
        .locator(".hero-card")
        .filter({
          has: page.getByRole("heading", {
            name: HEROES[hero].name,
            exact: true,
          }),
        })
        .click();
      await page
        .getByRole("button", { name: "เริ่มการผจญภัย", exact: true })
        .click();
      await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
      expect((await storedSave(page)).completed).toEqual([]);
      await page
        .getByRole("button", { name: "เดินทางต่อ", exact: true })
        .click();

      for (const [index, room] of ENCOUNTERS.entries()) {
        await test.step(`${room.id} ${room.title}`, async () => {
          await expect(
            page.getByRole("heading", { name: room.title, exact: true }),
          ).toBeVisible();
          const run = page.getByRole("button", {
            name: "รันโค้ด",
            exact: true,
          });
          await expect(run).toBeEnabled({ timeout: 60000 });
          await expect(page.locator(".coding-column .cm-editor")).toBeVisible();
          await expect(page.locator(".scene-frame canvas")).toBeVisible();
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          await writePython(page, room.solutions[0]);
          await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
          const initial = await storedSave(page);
          expect(initial.hero).toBe(hero);
          expect(initial.upgrades).toEqual({ attack: 0, hp: 0 });
          expect(initial.completed).toEqual(
            ENCOUNTERS.slice(0, index).map((e) => e.id),
          );
          expect(initial.battle!.encounterId).toBe(room.id);
          expect(initial.battle!.hp).toBe(initial.battle!.maxHp);
          expect(initial.battle!.mp).toBe(HEROES[hero].mp);
          expect(initial.drafts[room.id]).toBe(room.solutions[0]);

          if (room.boss && [1, 3, 6].includes(room.chapter)) {
            await page.screenshot({
              path: `.verification/journey-${info.project.name}-${hero}-${room.id}-before.png`,
              fullPage: true,
            });
          }
          let checkpoint = initial;
          let turns = 0;
          while (checkpoint.battle!.status === "active" && turns < 20) {
            const before = checkpoint.battle!;
            await run.click();
            await expect(page.getByTestId("python-output")).toContainText(
              "รันสำเร็จ",
            );
            await expect
              .poll(
                async () => {
                  const battle = (await storedSave(page)).battle!;
                  return (
                    battle.status !== "active" || battle.turn > before.turn
                  );
                },
                { message: `${hero} ${room.id}: the real turn must commit` },
              )
              .toBe(true);
            checkpoint = await storedSave(page);
            expect(validateSave(checkpoint)).toBe(true);
            expect(checkpoint.battle!.enemyHp).toBeLessThan(before.enemyHp);
            expect(checkpoint.battle!.mp).toBeGreaterThanOrEqual(0);
            expect(checkpoint.battle!.hp).toBeGreaterThan(0);
            expect(checkpoint.battle!.status).not.toBe("lost");
            turns++;
            if (checkpoint.battle!.status === "active") {
              await expect(run).toBeEnabled();
              // Genuine in-room reloads, including a later function lesson.
              if (turns === 1 && ["2-2", "5-2"].includes(room.id)) {
                await page.reload();
                await expect(run).toBeEnabled({ timeout: 60000 });
                expect((await storedSave(page)).battle).toEqual(
                  checkpoint.battle,
                );
                expect(
                  (
                    await page.locator(".cm-content .cm-line").allTextContents()
                  ).join("\n"),
                ).toBe(room.solutions[0]);
              }
            }
          }
          expect(checkpoint.battle!.status).toBe("won");
          expect(checkpoint.battle!.enemyHp).toBe(0);
          await expect(page.locator(".result-panel.won")).toBeVisible();
          gold += room.boss ? 65 + room.chapter * 5 : 25 + room.chapter * 5;
          expect(checkpoint.gold).toBe(gold);
          expect(checkpoint.completed).toEqual(
            ENCOUNTERS.slice(0, index + 1).map((e) => e.id),
          );
          expect(checkpoint.stars[room.id]).toBeGreaterThanOrEqual(1);
          await expect(page.locator(".gold-count")).toHaveText(
            gold.toLocaleString(),
          );
          completed.push({
            room: room.id,
            turns,
            hp: checkpoint.battle!.hp,
            maxHp: checkpoint.battle!.maxHp,
            mp: checkpoint.battle!.mp,
            stars: checkpoint.stars[room.id],
            gold,
          });
          await writeFile(
            evidence,
            JSON.stringify(
              {
                startedAt,
                build,
                browser: info.project.name,
                hero,
                width: widths[hero],
                reducedMotion: true,
                completed,
                errors,
              },
              null,
              2,
            ),
          );

          if (room.id === "6-4") {
            await page
              .getByRole("button", { name: "ชมการเดินทางของคุณ", exact: true })
              .click();
          } else if (room.boss) {
            await page
              .getByRole("button", { name: "กลับแผนที่", exact: true })
              .click();
            await page.reload();
            await expect(
              page.getByRole("heading", {
                name: "เส้นทางของนักโค้ด",
                exact: true,
              }),
            ).toBeVisible();
            expect((await storedSave(page)).completed).toEqual(
              ENCOUNTERS.slice(0, index + 1).map((e) => e.id),
            );
            await page
              .getByRole("button", { name: "เดินทางต่อ", exact: true })
              .click();
          } else {
            await page
              .getByRole("button", { name: "ไปห้องถัดไป", exact: true })
              .click();
          }
        });
      }
      const summary = page.getByRole("region", { name: "บทสรุปการผจญภัย" });
      await expect(summary).toContainText("24 / 24");
      await expect(summary).toContainText("6 / 6");
      await expect(summary).toContainText(HEROES[hero].name);
      const download = page.waitForEvent("download");
      await summary
        .getByRole("button", { name: "ส่งออกบันทึก", exact: true })
        .click();
      const stream = await (await download).createReadStream();
      let json = "";
      for await (const chunk of stream!) json += chunk.toString();
      const exported = JSON.parse(json) as SaveGameV1;
      expect(validateSave(exported)).toBe(true);
      expect(exported.completed).toHaveLength(24);
      expect(exported.gold).toBe(gold);
      expect(exported.hero).toBe(hero);
      expect(exported.upgrades).toEqual({ attack: 0, hp: 0 });
      expect(Object.keys(exported.drafts)).toHaveLength(24);
      await page.reload();
      await expect(summary).toContainText("24 / 24");
      expect(await storedSave(page)).toEqual(exported);
      await page.screenshot({
        path: `.verification/journey-${info.project.name}-${hero}-complete.png`,
        fullPage: true,
      });
      expect(errors).toEqual([]);
    } finally {
      await writeFile(
        evidence,
        JSON.stringify(
          {
            startedAt,
            build,
            endedAt: new Date().toISOString(),
            browser: info.project.name,
            hero,
            width: widths[hero],
            reducedMotion: true,
            completed,
            errors,
          },
          null,
          2,
        ),
      );
    }
  });
}
