import { ENCOUNTERS, HEROES } from "./content";
import type { SaveGameV1 } from "./types";
export const freshSave = (): SaveGameV1 => ({
  version: 1,
  revision: 0,
  updatedAt: new Date().toISOString(),
  hero: null,
  completed: [],
  stars: {},
  gold: 0,
  upgrades: { attack: 0, hp: 0 },
  potions: 3,
  drafts: {},
  notes: "",
  battle: null,
  settings: {
    sound: false,
    reducedMotion:
      typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches,
    editorSize: 16,
  },
  onboarding: false,
});
const numberIn = (n: unknown, min: number, max: number) =>
  typeof n === "number" &&
  Number.isFinite(n) &&
  Number.isInteger(n) &&
  n >= min &&
  n <= max;
const obj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
export function validateSave(data: unknown): data is SaveGameV1 {
  if (
    !obj(data) ||
    data.version !== 1 ||
    !numberIn(data.revision, 0, 1e9) ||
    typeof data.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(data.updatedAt))
  )
    return false;
  if (
    data.hero !== null &&
    (typeof data.hero !== "string" || !Object.hasOwn(HEROES, data.hero))
  )
    return false;
  const ids = new Set(ENCOUNTERS.map((e) => e.id));
  if (
    !Array.isArray(data.completed) ||
    new Set(data.completed).size !== data.completed.length ||
    !data.completed.every((x) => typeof x === "string" && ids.has(x))
  )
    return false;
  if (
    !numberIn(data.gold, 0, 1e6) ||
    !numberIn(data.potions, 0, 99) ||
    !obj(data.upgrades) ||
    !numberIn(data.upgrades.attack, 0, 5) ||
    !numberIn(data.upgrades.hp, 0, 5)
  )
    return false;
  if (
    !obj(data.stars) ||
    !Object.entries(data.stars).every(
      ([k, v]) => ids.has(k) && numberIn(v, 1, 3),
    )
  )
    return false;
  if (
    !obj(data.drafts) ||
    !Object.entries(data.drafts).every(
      ([k, v]) => ids.has(k) && typeof v === "string" && v.length <= 16000,
    ) ||
    typeof data.notes !== "string" ||
    data.notes.length > 32000 ||
    typeof data.onboarding !== "boolean"
  )
    return false;
  if (
    !obj(data.settings) ||
    typeof data.settings.sound !== "boolean" ||
    typeof data.settings.reducedMotion !== "boolean" ||
    !numberIn(data.settings.editorSize, 16, 22)
  )
    return false;
  if (data.battle !== null) {
    const b = data.battle;
    if (
      !obj(b) ||
      data.hero === null ||
      typeof b.encounterId !== "string" ||
      !ids.has(b.encounterId) ||
      b.hero !== data.hero ||
      typeof b.status !== "string" ||
      !["active", "won", "lost"].includes(b.status)
    )
      return false;
    for (const key of [
      "hp",
      "maxHp",
      "mp",
      "maxMp",
      "enemyHp",
      "maxEnemyHp",
      "attack",
      "turn",
      "potions",
      "poison",
      "mistakes",
    ])
      if (!numberIn(b[key], 0, 1e5)) return false;
    if (
      Number(b.maxHp) < 1 ||
      Number(b.maxEnemyHp) < 1 ||
      Number(b.turn) < 1 ||
      Number(b.attack) < 1 ||
      !numberIn(b.potions, 0, 99) ||
      Number(b.potions) > Number(data.potions) ||
      Number(b.hp) > Number(b.maxHp) ||
      Number(b.mp) > Number(b.maxMp) ||
      Number(b.enemyHp) > Number(b.maxEnemyHp) ||
      !numberIn(b.guard, 0, 1) ||
      !obj(b.intent) ||
      typeof b.intent.kind !== "string" ||
      !["attack", "heavy", "guard", "charge", "poison"].includes(
        b.intent.kind,
      ) ||
      !numberIn(b.intent.damage, 0, 1000) ||
      typeof b.intent.label !== "string" ||
      typeof b.intent.description !== "string" ||
      !Array.isArray(b.log) ||
      b.log.length > 40 ||
      !b.log.every((x) => typeof x === "string" && x.length <= 500)
    )
      return false;
    // These are persisted checkpoints, never intermediate animation frames.
    if (
      (b.status === "active" && (b.hp === 0 || b.enemyHp === 0)) ||
      (b.status === "won" && (b.hp === 0 || b.enemyHp !== 0)) ||
      (b.status === "lost" && (b.hp !== 0 || b.enemyHp === 0))
    )
      return false;
  }
  return true;
}
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("runecode-save", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("game");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("เปิดพื้นที่บันทึกไม่ได้"));
  });
}
export async function loadSave(): Promise<SaveGameV1> {
  const d = await db();
  try {
    return await new Promise((resolve, reject) => {
      const tx = d.transaction("game", "readonly"),
        r = tx.objectStore("game").get("save");
      r.onsuccess = () => {
        if (r.result === undefined) resolve(freshSave());
        else if (validateSave(r.result)) resolve(r.result);
        else
          reject(
            new Error(
              "ข้อมูลบันทึกเดิมอ่านไม่ได้ ยังไม่ได้เขียนทับ คุณสามารถนำเข้าไฟล์สำรองหรือเริ่มใหม่ได้",
            ),
          );
      };
      r.onerror = () => reject(r.error);
    });
  } finally {
    d.close();
  }
}
export async function persistSave(
  save: SaveGameV1,
  expectedRevision: number | null,
) {
  if (!validateSave(save)) throw new Error("ข้อมูลบันทึกไม่ผ่านการตรวจสอบ");
  const d = await db();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction("game", "readwrite");
      let conflict = false;
      const store = tx.objectStore("game"),
        existing = store.get("save");
      existing.onsuccess = () => {
        const current = existing.result;
        const valid = validateSave(current);
        const identical =
          valid && JSON.stringify(current) === JSON.stringify(save);
        // Compare with the checkpoint this tab actually loaded/wrote. Counting
        // local keystrokes is not evidence that another tab's data is older.
        if (
          !identical &&
          (valid
            ? current.revision !== expectedRevision ||
              current.revision >= save.revision
            : current === undefined
              ? expectedRevision !== null && expectedRevision !== 0
              : expectedRevision !== null)
        ) {
          conflict = true;
          tx.abort();
          return;
        }
        store.put(save, "save");
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(
          conflict
            ? new Error("CONFLICT: มีบันทึกใหม่กว่าจากอีกแท็บ")
            : tx.error,
        );
    });
  } finally {
    d.close();
  }
}
