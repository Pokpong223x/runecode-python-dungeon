import { test, expect, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { writePython as writeRawPython } from "./input";
import { HEROES } from "../../src/content";
import type { HeroId } from "../../src/types";
import { mechanicsSave, mechanicsSource } from "./mechanics";

const writePython = (page: Page, code: string) =>
  writeRawPython(page, mechanicsSource(code));

interface AudioNote {
  id: number;
  time: number;
  at: number;
  now: number;
  wave: OscillatorType;
  frequencies: number[];
}
declare global {
  interface Window {
    runecodeAudioProbe: {
      contexts: AudioContext[];
      notes: AudioNote[];
      ended: number[];
      playback: number;
      contacts: number[];
      errors: string[];
    };
  }
}

async function probeAudio(page: Page) {
  await page.addInitScript(() => {
    const probe: Window["runecodeAudioProbe"] = {
      contexts: [],
      notes: [],
      ended: [],
      playback: 0,
      contacts: [],
      errors: [],
    };
    window.runecodeAudioProbe = probe;
    const Native = window.AudioContext;
    if (typeof Native !== "function") {
      probe.errors.push("AudioContext is unavailable");
      return;
    }
    window.AudioContext = new Proxy(Native, {
      construct(target, args) {
        try {
          const context = Reflect.construct(target, args) as AudioContext;
          probe.contexts.push(context);
          return context;
        } catch (error) {
          probe.errors.push(String(error));
          throw error;
        }
      },
    });
    const frequencies = new WeakMap<AudioParam, number[]>();
    const set = AudioParam.prototype.setValueAtTime;
    AudioParam.prototype.setValueAtTime = function (value, at) {
      const values = frequencies.get(this) ?? [];
      values.push(value);
      frequencies.set(this, values);
      return set.call(this, value, at);
    };
    const create = Native.prototype.createOscillator;
    Native.prototype.createOscillator = function () {
      const node = create.call(this),
        start = node.start.bind(node);
      node.start = (when = 0) => {
        const id = probe.notes.length;
        probe.notes.push({
          id,
          time: performance.now(),
          at: when,
          now: this.currentTime,
          wave: node.type,
          frequencies: [...(frequencies.get(node.frequency) ?? [])],
        });
        node.addEventListener("ended", () => probe.ended.push(id), {
          once: true,
        });
        start(when);
      };
      return node;
    };
  });
}
async function enter(page: Page, hero = "นักผจญภัย") {
  await page.goto("/");
  const heroId = (Object.keys(HEROES) as HeroId[]).find(
    (id) => HEROES[id].name === hero,
  )!;
  const reduced = await page.evaluate(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const save = mechanicsSave(heroId, reduced);
  // After one normal hit the boss remains in phase 1; its next turn (3) is guard.
  // This preserves the separate potion / player shield / enemy shield audio beats.
  save.battle.turn = 2;
  await page.getByRole("button", { name: "ตั้งค่า", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "isolated-audio.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(save)),
  });
  await page
    .getByRole("button", { name: "ใช้บันทึกจากไฟล์นี้", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "รันโค้ด", exact: true }),
  ).toBeEnabled({ timeout: 60000 });
}
async function watchContact(page: Page) {
  await page.evaluate(() => {
    const probe = window.runecodeAudioProbe;
    const scene = document.querySelector(".pixel-scene")!;
    const meter = document.querySelectorAll('[role="progressbar"]')[1];
    let value = meter.getAttribute("aria-valuenow");
    const observer = new MutationObserver(() => {
      if (!probe.playback && scene.getAttribute("aria-busy") === "true")
        probe.playback = performance.now();
      const next = meter.getAttribute("aria-valuenow");
      if (next !== value) {
        probe.contacts.push(performance.now());
        value = next;
      }
    });
    observer.observe(document.querySelector(".combat-panel")!, {
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-busy", "aria-valuenow"],
    });
  });
}
const snapshot = (page: Page) =>
  page.evaluate(() => {
    const p = window.runecodeAudioProbe;
    return {
      notes: p.notes,
      ended: p.ended,
      playback: p.playback,
      contacts: p.contacts,
      contexts: p.contexts.map((c) => c.state),
      errors: p.errors,
      hidden: document.hidden,
    };
  });
async function enableNativeAudio(page: Page) {
  const capability = await page.evaluate(() => ({
    audioContext: typeof window.AudioContext,
    prefixedAudioContext: typeof (
      window as unknown as { webkitAudioContext?: unknown }
    ).webkitAudioContext,
    offlineAudioContext: typeof window.OfflineAudioContext,
    audioParam: typeof window.AudioParam,
    userAgent: navigator.userAgent,
  }));
  await writeFile(
    `.verification/audio-capability-${test.info().project.name}.json`,
    JSON.stringify(capability, null, 2),
  );
  test.skip(
    capability.audioContext !== "function",
    "This browser build does not expose AudioContext. Native sound needs a supported build/device; fallback gameplay is tested separately.",
  );
  await page.getByRole("button", { name: "เปิดเสียง", exact: true }).click();
}

test("sound starts at the actual strike contact rather than successful Run", async ({
  page,
}, info) => {
  await probeAudio(page);
  await enter(page);
  await enableNativeAudio(page);
  await writePython(page, 'print("จังหวะโดนเป้า")\nattack()');
  await watchContact(page);
  await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
  await expect(page.locator(".pixel-scene")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await expect(page.locator(".pixel-scene")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  const actual = await snapshot(page);
  await writeFile(
    `.verification/audio-contact-${info.project.name}.json`,
    JSON.stringify(actual, null, 2),
  );
  expect(actual.contacts).toHaveLength(1);
  expect(actual.notes.length).toBeGreaterThan(0);
  expect(actual.notes[0].time - actual.playback).toBeGreaterThan(150);
  expect(Math.abs(actual.notes[0].time - actual.contacts[0])).toBeLessThan(100);
  await page.locator(".combat-panel").screenshot({
    path: `.verification/audio-contact-${info.project.name}.png`,
  });
});

for (const [hero, slug, frequency] of [
  ["นักผจญภัย", "adventurer", 900],
  ["อัศวิน", "knight", 130],
  ["พ่อมด", "wizard", 210],
] as const) {
  test(`class sound, one shared context and silent reload: ${slug}`, async ({
    page,
  }, info) => {
    await probeAudio(page);
    await enter(page, hero);
    await enableNativeAudio(page);
    await watchContact(page);
    const run = page.getByRole("button", { name: "รันโค้ด", exact: true });
    await writePython(page, 'print("สกิลของฉัน")\nskill()');
    await run.click();
    await expect(page.locator(".pixel-scene")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await expect(run).toBeEnabled();
    const first = await snapshot(page);
    expect(first.notes[0].frequencies).toEqual([frequency]);
    expect(Math.abs(first.notes[0].time - first.contacts[0])).toBeLessThan(100);
    expect(first.contexts).toEqual(["running"]);
    expect(first.ended.length).toBe(first.notes.length);
    await writePython(page, 'print("ปิดฉาก")\nattack()\nattack()\nattack()');
    await run.click();
    await expect(page.locator(".result-panel.won")).toBeVisible();
    const final = await snapshot(page);
    expect(final.contexts).toEqual(["running"]);
    expect(final.notes.slice(-3).map((n) => n.frequencies[0])).toEqual([
      523.25, 659.25, 784,
    ]);
    expect(final.ended.length).toBe(final.notes.length);
    await writeFile(
      `.verification/audio-class-${info.project.name}-${slug}.json`,
      JSON.stringify(final, null, 2),
    );
    await expect(page.locator(".footer")).toContainText("บันทึกแล้ว");
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "เส้นทางของนักโค้ด" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "ปิดเสียง", exact: true }),
    ).toBeVisible();
    expect((await snapshot(page)).notes).toEqual([]);
    expect((await snapshot(page)).contexts).toEqual([]);
  });
}

test("default mute, invalid code and check plan create no sounds", async ({
  page,
}) => {
  await probeAudio(page);
  await enter(page);
  const run = page.getByRole("button", { name: "รันโค้ด", exact: true });
  await writePython(page, 'print("เริ่มเงียบ ๆ")\nattack()');
  await run.click();
  await expect(page.locator(".pixel-scene")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await expect(run).toBeEnabled();
  expect((await snapshot(page)).contexts).toEqual([]);
  await page.getByRole("button", { name: "เปิดเสียง", exact: true }).click();
  await writePython(page, 'print("แก้ได้")\nattack(4)');
  await run.click();
  await expect(page.getByTestId("python-output")).toContainText(
    "พลังต้องเป็นจำนวนเต็ม 1 ถึง 3",
  );
  await writePython(page, 'print("ลองแผน")\nskill()');
  await page.getByRole("button", { name: "ตรวจแผน", exact: true }).click();
  await expect(page.getByRole("region", { name: "ผลตรวจแผน" })).toContainText(
    "ยังไม่เสียเทิร์น",
  );
  expect((await snapshot(page)).notes).toEqual([]);
  await expect(page.getByRole("progressbar").last()).toHaveAttribute(
    "aria-valuenow",
    "25",
  );
});

test("mute and navigation cancel queued notes, then the next room run can unlock again", async ({
  page,
}, info) => {
  await probeAudio(page);
  await enter(page, "พ่อมด");
  await enableNativeAudio(page);
  const run = page.getByRole("button", { name: "รันโค้ด", exact: true });
  await writePython(page, 'print("ปิดเสียงระหว่างสกิล")\nskill()');
  await run.click();
  await expect
    .poll(async () => (await snapshot(page)).notes.length)
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "ปิดเสียง", exact: true }).click();
  await expect
    .poll(async () => (await snapshot(page)).contexts)
    .toEqual(["closed"]);
  const count = (await snapshot(page)).notes.length;
  await expect(run).toBeEnabled();
  expect((await snapshot(page)).notes).toHaveLength(count);
  await page.getByRole("button", { name: "เปิดเสียง", exact: true }).click();
  await writePython(page, 'print("เดินทางระหว่างแอนิเมชัน")\nattack()');
  await run.click();
  await expect(page.locator(".pixel-scene")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await page
    .getByRole("button", { name: "แผนที่", exact: true })
    .first()
    .click();
  await expect
    .poll(async () => (await snapshot(page)).contexts)
    .toEqual(["closed", "closed"]);
  const left = (await snapshot(page)).notes.length;
  await page.locator(".encounter-row").nth(3).click();
  await expect(run).toBeEnabled();
  await run.click();
  await expect(page.locator(".pixel-scene")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await expect
    .poll(async () => (await snapshot(page)).notes.length)
    .toBeGreaterThan(left);
  expect((await snapshot(page)).contexts).toEqual([
    "closed",
    "closed",
    "running",
  ]);
  await page
    .getByRole("button", { name: "แผนที่", exact: true })
    .first()
    .click();
  await expect
    .poll(async () =>
      (await snapshot(page)).contexts.every((s) => s === "closed"),
    )
    .toBe(true);
  await writeFile(
    `.verification/audio-cancel-${info.project.name}.json`,
    JSON.stringify(await snapshot(page), null, 2),
  );
});

test("potion and shield have their own beats and reduced motion keeps optional audio", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await probeAudio(page);
  await enter(page);
  await enableNativeAudio(page);
  const run = page.getByRole("button", { name: "รันโค้ด", exact: true });
  await writePython(page, 'print("รับมือก่อน")\nattack()');
  await run.click();
  await expect(page.locator(".pixel-scene")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await expect(run).toBeEnabled();
  const before = (await snapshot(page)).notes.length;
  await writePython(page, 'print("ฟื้นตัวแล้วตั้งรับ")\nheal()\ndefend()');
  await run.click();
  await expect(page.locator(".pixel-scene")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await expect(run).toBeEnabled();
  const actual = await snapshot(page);
  expect(actual.notes.slice(before).map((n) => n.frequencies[0])).toEqual([
    440,
    880,
    520,
    520, // potion, player shield, then turn-2 enemy guard
  ]);
  expect(actual.ended.length).toBe(actual.notes.length);
  await expect(page.locator(".scene-frame.motion-reduced")).toBeVisible();
  await writeFile(
    `.verification/audio-reduced-${info.project.name}.json`,
    JSON.stringify(actual, null, 2),
  );
});

test("unavailable audio never blocks a real Python turn", async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: class {
        constructor() {
          throw new Error("No audio device");
        }
      },
    }),
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enter(page);
  await page.getByRole("button", { name: "เปิดเสียง", exact: true }).click();
  await writePython(page, 'print("ยังเล่นต่อได้")\nattack()');
  await page.getByRole("button", { name: "รันโค้ด", exact: true }).click();
  await expect(page.getByRole("progressbar").last()).toHaveAttribute(
    "aria-valuenow",
    "25",
  );
  await expect(
    page.getByRole("button", { name: "รันโค้ด", exact: true }),
  ).toBeEnabled();
  expect(errors).toEqual([]);
});
