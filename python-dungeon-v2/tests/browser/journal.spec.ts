import { test, expect, type Page } from "@playwright/test";
import { CHAPTERS, ENCOUNTERS } from "../../src/content";
import { startCombat } from "../../src/engine";
import { freshSave, validateSave } from "../../src/storage";
import { writePython } from "./input";

const ownCode =
  'def my_plan():\n    print("บันทึกของฉัน")\n    attack()\nmy_plan()\n# ยังเป็นร่าง';
function journalSave() {
  const save = freshSave();
  save.hero = "wizard";
  save.onboarding = true;
  save.completed = ENCOUNTERS.filter((e) => e.chapter < 4).map((e) => e.id);
  save.stars = Object.fromEntries(save.completed.map((id) => [id, 2]));
  save.battle = startCombat(save, "4-1");
  save.drafts["4-1"] = ownCode;
  save.drafts["1-1"] = 'print("จำได้แล้ว")\nattack()';
  save.notes = "ฉันกำลังทบทวนเงื่อนไข";
  return save;
}
async function setup(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "journal-fixture.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(journalSave())),
  });
  await page
    .getByRole("button", { name: "ใช้บันทึกจากไฟล์นี้", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "รันโค้ด", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  await page.getByRole("button", { name: "สมุดบทเรียน", exact: true }).click();
  return page.getByRole("dialog", { name: "สมุดของนักโค้ด" });
}
async function exportSave(page: Page) {
  await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "ส่งออกไฟล์", exact: true }).click();
  const stream = await (await pending).createReadStream();
  let text = "";
  for await (const chunk of stream!) text += chunk.toString();
  await page.keyboard.press("Escape");
  return JSON.parse(text);
}
async function expectEditorSource(page: Page, source: string) {
  await expect
    .poll(() => page.locator(".cm-line").allTextContents())
    .toEqual(source.split("\n"));
}

test("journal finds concepts, shows truthful progress and persists notes without changing combat", async ({
  page,
}, info) => {
  const journal = await setup(page);
  await expect(journal).toContainText("ผ่านแล้ว 9 / 18 บทเรียน");
  await expect(journal.locator(".journal-chapter[open]")).toContainText(
    CHAPTERS[3].title,
  );
  await expect(journal.locator(".journal-example pre:visible")).toHaveCount(0);
  await expect(journal.locator(".journal-own-code:visible > p")).toBeVisible();
  const query = journal.getByRole("searchbox", {
    name: "ค้นหาบทเรียนหรือแนวคิด",
  });
  await query.fill(
    `  ${ENCOUNTERS.find((room) => room.id === "3-1")!.title.toUpperCase()} `,
  );
  await expect(journal.getByRole("article")).toHaveCount(1);
  await expect(journal.getByRole("article")).toContainText(
    ENCOUNTERS.find((room) => room.id === "3-1")!.title,
  );
  await query.fill("ตัวแปร");
  await expect(journal.getByRole("article").first()).toBeVisible();
  await journal.getByRole("button", { name: "ล้างคำค้นหา" }).click();
  await journal.getByRole("checkbox", { name: "เฉพาะบทเรียนที่ผ่าน" }).check();
  await expect(journal.getByRole("article")).toHaveCount(9);
  await query.fill("class");
  await expect(
    journal.getByText("ยังไม่มีบทเรียนที่ผ่านตรงกับคำค้นนี้"),
  ).toBeVisible();
  await journal.getByRole("button", { name: "ดูบทเรียนทั้งหมด" }).click();
  await expect(query).toHaveValue("");
  await expect(journal.getByRole("checkbox")).not.toBeChecked();
  await query.fill("while");
  await expect(journal.getByRole("article")).toHaveCount(1);
  await journal
    .getByRole("textbox", { name: "บันทึกและคาถาของฉัน" })
    .fill("while ต้องเปลี่ยนค่าที่ตรวจ มิฉะนั้นวนไม่จบ\n    # เว้นวรรคยังอยู่");
  await journal.screenshot({
    path: `.verification/journal-search-${info.project.name}.png`,
  });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "สมุดบทเรียน", exact: true }),
  ).toBeFocused();
  await expectEditorSource(page, ownCode);
  await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
  const exported = await exportSave(page);
  expect(validateSave(exported)).toBe(true);
  expect(exported.battle).toEqual(journalSave().battle);
  expect(exported.drafts["4-1"]).toBe(ownCode);
  await page.reload();
  await page.getByRole("button", { name: "สมุดบทเรียน", exact: true }).click();
  await expect(journal.getByRole("searchbox")).toHaveValue("");
  await expect(
    journal.getByRole("textbox", { name: "บันทึกและคาถาของฉัน" }),
  ).toHaveValue(exported.notes);
});

test("draft and example copying preserves exact source and never replaces the current editor", async ({
  page,
  context,
  browserName,
}) => {
  // Chromium exercises the real clipboard. Other engines use a controlled write
  // sink because Playwright does not expose their clipboard permission grants.
  if (browserName === "chromium")
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  else
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            (window as unknown as { copiedText: string }).copiedText = text;
          },
        },
      });
    });
  const journal = await setup(page);
  // The active room's own draft is visible without opening an example.
  const draft = journal.locator(".journal-own-code:visible");
  await draft.getByRole("button", { name: "คัดลอกโค้ดล่าสุดของคุณ" }).click();
  await expect(draft.getByRole("status")).toContainText("คัดลอกแล้ว");
  // Windows clipboard uses CRLF; indentation and all source characters survive.
  const copied = async () =>
    (await page.evaluate(() => navigator.clipboard.readText())).replace(
      /\r\n/g,
      "\n",
    );
  if (browserName === "chromium") expect(await copied()).toBe(ownCode);
  else
    expect(
      await page.evaluate(
        () => (window as unknown as { copiedText: string }).copiedText,
      ),
    ).toBe(ownCode);
  const active = draft.locator("..");
  await active.locator(".journal-example > summary").click();
  await active.getByRole("button", { name: "คัดลอกตัวอย่าง Python" }).click();
  if (browserName === "chromium")
    expect(await copied()).toBe(CHAPTERS[3].encounters[0].solutions[0]);
  else
    expect(
      await page.evaluate(
        () => (window as unknown as { copiedText: string }).copiedText,
      ),
    ).toBe(CHAPTERS[3].encounters[0].solutions[0]);
  await page.keyboard.press("Escape");
  await expectEditorSource(page, ownCode);
  expect((await exportSave(page)).battle).toEqual(journalSave().battle);
});

test("denied clipboard offers manual selection and keeps the draft intact", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new DOMException("Permission denied", "NotAllowedError");
        },
      },
    }),
  );
  const journal = await setup(page);
  const draft = journal.locator(".journal-own-code:visible");
  await draft.getByRole("button", { name: "คัดลอกโค้ดล่าสุดของคุณ" }).click();
  await expect(draft.getByRole("status")).toContainText(
    "เลือกข้อความในกรอบแล้วคัดลอกเองได้",
  );
  await draft.locator("pre").focus();
  await expect(draft.locator("pre")).toBeFocused();
  await page.keyboard.press("Escape");
  await expectEditorSource(page, ownCode);
});

test("journal contains long source at phone widths and retains notes through accordion changes", async ({
  page,
}, info) => {
  const journal = await setup(page);
  await page.keyboard.press("Escape");
  const longCode =
    "# " + "ข้อความยาว".repeat(50) + "\nif hp > 0:\n    attack()";
  await writePython(page, longCode);
  await page.getByRole("button", { name: "สมุดบทเรียน", exact: true }).click();
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    const query = journal.getByRole("searchbox");
    await query.fill(ENCOUNTERS.find((room) => room.id === "4-1")!.title);
    await expect(journal.getByRole("article")).toHaveCount(1);
    expect(
      await journal.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const pre = journal.locator(".journal-own-code pre");
    expect(await pre.evaluate((el) => getComputedStyle(el).fontSize)).toBe(
      "16px",
    );
    expect(await pre.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
      true,
    );
    await journal.screenshot({
      path: `.verification/journal-${info.project.name}-${width}.png`,
    });
  }
  const chapter = journal.locator(".journal-chapter");
  await chapter.locator(":scope > summary").click();
  await expect(chapter).not.toHaveAttribute("open", "");
  await journal
    .getByRole("textbox", { name: "บันทึกและคาถาของฉัน" })
    .fill("จำได้ว่า if ต้องลงท้ายด้วย :");
  await expect(chapter).not.toHaveAttribute("open", "");
  await page.keyboard.press("Escape");
  await expectEditorSource(page, longCode);
});
