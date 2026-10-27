import { test, expect, type Page } from "@playwright/test";
import { CHAPTERS, ENCOUNTERS } from "../../src/content";
import { startCombat } from "../../src/engine";
import { freshSave } from "../../src/storage";
import { writePython } from "./input";

const sourceSamples = [
  {
    room: "1-3",
    concept: "sequence",
    bad: "print(1)\nprint(2)\nprint(3)\nskill(1)",
  },
  {
    room: "2-1",
    concept: "variable",
    bad: "bolts = 2\nattack(bolts)",
  },
  {
    room: "2-3",
    concept: "arithmetic",
    bad: "stored = 8\nspent = 5\nprint(stored - spent)\nattack(3)",
  },
  {
    room: "4-2",
    concept: "for",
    bad: "for step in range(2):\n    print(step)\n    attack(3)",
  },
  {
    room: "4-3",
    concept: "while",
    bad: "lock = 0\nwhile lock > 0:\n    lock -= 1\nattack(2)",
  },
  {
    room: "6-3",
    concept: "exception",
    bad: 'try:\n    int("other")\nexcept ValueError:\n    attack(2)',
  },
  {
    room: "5-1",
    concept: "function",
    bad: "def spark():\n    return 2\nattack(spark())",
  },
  {
    room: "5-2",
    concept: "parameter",
    bad: "def gap(readings):\n    return max(readings) - min(readings)\nvalues = [1, 3, 2]\nattack(gap(values))",
  },
  {
    room: "5-3",
    concept: "math",
    bad: "import math\nattack(math.floor(2.5))",
  },
  {
    room: "3-1",
    concept: "list",
    bad: "supplies = [5, 8, 2]\nattack(supplies[2])",
  },
].map((sample) => ({
  ...sample,
  good: ENCOUNTERS.find((room) => room.id === sample.room)!.solutions[2],
  diagnostic: sample.room === "4-3" ? "ยังไม่พบการใช้แนวคิด while" : "Exercise",
}));

const samples = [
  ...sourceSamples,
  // Previously valid single-lesson drafts must reject without committing the
  // checkpoint, then accept a complete combined boss plan through both owners.
  ...["comment", "variable", "list", "for", "function", "class"].map(
    (concept, index) => ({
      room: CHAPTERS[index].encounters[3].id,
      concept,
      bad: CHAPTERS[index].encounters[[0, 1, 1, 2, 2, 2][index]].solutions[0],
      good: CHAPTERS[index].encounters[3].solutions[2],
      diagnostic: `ยังไม่พบการใช้แนวคิด ${concept}`,
    }),
  ),
];

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

test("actual workers enforce mission conditions and accept real alternative and skill answers", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  for (const sample of samples) {
    await page.setViewportSize({
      width: sample.room === "4-2" ? 360 : sample.room === "3-1" ? 390 : 1440,
      height: 900,
    });
    const save = freshSave();
    save.hero = "adventurer";
    save.onboarding = true;
    save.settings.reducedMotion = true;
    save.completed = ENCOUNTERS.slice(
      0,
      ENCOUNTERS.findIndex((e) => e.id === sample.room),
    ).map((e) => e.id);
    save.battle = startCombat(save, sample.room);
    save.drafts[sample.room] = sample.bad;
    await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
    await page.locator("input[type=file]").setInputFiles({
      name: "isolated-lesson-checkpoint.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(save)),
    });
    await page
      .getByRole("button", { name: "ใช้บันทึกจากไฟล์นี้", exact: true })
      .click();
    const check = page.getByRole("button", { name: "ตรวจแผน", exact: true });
    await expect(check).toBeEnabled({ timeout: 60000 });
    const before = await exportedBattle(page);
    await check.click();
    await expect(page.getByTestId("python-output")).toContainText(
      sample.diagnostic,
    );
    await expect(
      page.getByRole("region", { name: "ผลตรวจแผน" }),
    ).not.toBeVisible();
    expect(await exportedBattle(page)).toEqual(before);
    await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
    await expect(page.getByTestId("python-output")).toContainText(
      sample.diagnostic,
    );
    expect(await exportedBattle(page)).toEqual(before);
    if (["5-1", "3-1", "4-2", "6-3"].includes(sample.room)) {
      await expect(page.locator(".toast")).not.toBeVisible();
      await page.screenshot({
        path: `.verification/lesson-execution-${info.project.name}-${sample.concept}.png`,
        fullPage: true,
      });
    }
    await writePython(page, sample.good);
    await check.click();
    const preview = page.getByRole("region", { name: "ผลตรวจแผน" });
    await expect(preview).toBeVisible();
    expect(await exportedBattle(page)).toEqual(before);
    await preview
      .getByRole("button", { name: "รันแผนนี้", exact: true })
      .click();
    await expect(page.getByTestId("python-output")).toContainText("รันสำเร็จ");
    await expect(page.locator(".pixel-scene")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    const after = await exportedBattle(page);
    expect(["active", "won"]).toContain(after.status);
    expect(after.turn).toBe(before.turn + (after.status === "active" ? 1 : 0));
    if (after.status === "won")
      await expect(page.locator(".result-panel.won")).toBeVisible();
    else await expect(check).toBeEnabled();
    expect(after.enemyHp).toBeLessThan(before.enemyHp);
    expect(after.mistakes).toBe(before.mistakes);
    if (sample.room === "4-2") {
      await page.getByRole("button", { name: "ขอคำใบ้", exact: true }).click();
      await page
        .getByRole("button", { name: "คำใบ้ถัดไป", exact: true })
        .click();
      await expect(page.locator(".hint-box")).toContainText(
        ENCOUNTERS.find((room) => room.id === sample.room)!.hints[1],
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      await page.screenshot({
        path: `.verification/lesson-rules-${info.project.name}-skill-for-360.png`,
        fullPage: true,
      });
    }
  }
  expect(errors).toEqual([]);
});
