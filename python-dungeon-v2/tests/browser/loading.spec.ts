import { test, expect } from "@playwright/test";
import { writePython } from "./input";
import { ENCOUNTERS } from "../../src/content";

test.use({ serviceWorkers: "block" });
test.beforeEach(({ baseURL }) => {
  test.skip(
    !baseURL?.includes(":4173"),
    "production chunks require the static build",
  );
});

test("the shell stays usable while the scene loads and editor code waits for a room", async ({
  page,
  context,
}) => {
  let releaseScene!: () => void;
  const sceneGate = new Promise<void>((resolve) => {
    releaseScene = resolve;
  });
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await context.route("**/assets/Scene-*.js", async (route) => {
    await sceneGate;
    await route.continue();
  });
  try {
    const entry = page.waitForResponse((r) =>
      /\/assets\/index-[^/]+\.js$/.test(r.url()),
    );
    await page.goto("/", { waitUntil: "domcontentloaded" });
    expect((await (await entry).body()).length).toBeLessThan(450_000);
    await expect(
      page.getByRole("button", { name: "เริ่มการผจญภัย", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByText("กำลังเตรียมฉากผจญภัย…", { exact: true }),
    ).toBeVisible();
    expect(requests.some((url) => /\/Editor-/.test(url))).toBe(false);
    await page
      .getByRole("button", { name: "เริ่มการผจญภัย", exact: true })
      .click();
    await page.locator(".encounter-row").first().click();
    await expect(
      page.getByRole("button", { name: "เตรียมเครื่องมือ…", exact: true }),
    ).toBeDisabled();
    releaseScene();
    await expect(page.locator(".pixel-scene canvas")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "รันโค้ด", exact: true }),
    ).toBeEnabled({ timeout: 60000 });
    await writePython(page, ENCOUNTERS[0].solutions[0]);
    await page.getByRole("button", { name: "ตรวจแผน", exact: true }).click();
    await expect(page.getByRole("region", { name: "ผลตรวจแผน" })).toBeVisible();
  } finally {
    releaseScene();
  }
});

test("a failed editor chunk reloads the saved checkpoint without spending a turn", async ({
  page,
  context,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const editorChunk = "**/assets/Editor-*.js";
  await context.route(editorChunk, (route) => route.abort());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "เริ่มการผจญภัย", exact: true })
    .click();
  await page.locator(".encounter-row").first().click();
  const code = page.locator(".coding-column");
  await expect(code).toContainText("โหลดเครื่องมือไม่สำเร็จ");
  await expect(page.getByRole("progressbar").first()).toHaveAttribute(
    "aria-valuenow",
    "110",
  );
  await page.screenshot({
    path: `.verification/loading-retry-${info.project.name}.png`,
    fullPage: true,
  });
  await context.unroute(editorChunk);
  await code
    .getByRole("button", { name: "บันทึกแล้วโหลดใหม่", exact: true })
    .click();
  const editor = page.getByRole("textbox", { name: "เขียนโค้ด Python" });
  await expect(editor).toBeVisible();
  await expect(editor).toContainText(ENCOUNTERS[0].starter.split("\n")[0]);
  await expect(
    page.getByRole("button", { name: "รันโค้ด", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  await expect(page.getByRole("progressbar").first()).toHaveAttribute(
    "aria-valuenow",
    "110",
  );
  await expect(page.getByRole("progressbar").last()).toHaveAttribute(
    "aria-valuenow",
    "37",
  );
  expect(errors).toEqual([]);
});

test("leaving during an editor load keeps the room resumable", async ({
  page,
  context,
}) => {
  let releaseEditor!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseEditor = resolve;
  });
  await context.route("**/assets/Editor-*.js", async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: "เริ่มการผจญภัย", exact: true })
      .click();
    await page.locator(".encounter-row").first().click();
    await expect(
      page.getByText("กำลังเปิดสมุดโค้ด…", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "แผนที่", exact: true })
      .last()
      .click();
    releaseEditor();
    await page.locator(".encounter-row").first().click();
    await expect(
      page.getByRole("textbox", { name: "เขียนโค้ด Python" }),
    ).toBeVisible();
    await expect(page.getByRole("progressbar").last()).toHaveAttribute(
      "aria-valuenow",
      "37",
    );
    await expect(page.locator(".battle-heading .tag")).toHaveText("เทิร์น 1");
  } finally {
    releaseEditor();
  }
});
