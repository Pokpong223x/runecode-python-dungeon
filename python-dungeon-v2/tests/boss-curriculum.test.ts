import { beforeAll, describe, expect, it } from "vitest";
import { loadPyodide, type PyodideInterface } from "pyodide";
import { resolve } from "node:path";
import { CHAPTERS, encounterById } from "../src/content";
import { actionAP, intentFor, resolveTurn, startCombat } from "../src/engine";
import { PYTHON_VALIDATOR } from "../src/runtime/validator";
import { freshSave } from "../src/storage";
import type {
  CombatState,
  Concept,
  EncounterDefinition,
  IntentKind,
  RunResult,
} from "../src/types";

let py: PyodideInterface;
beforeAll(async () => {
  py = await loadPyodide({ indexURL: resolve("public/python") + "/" });
}, 60000);

function battleFor(room: EncounterDefinition): CombatState {
  const save = freshSave();
  save.hero = "wizard";
  return startCombat(save, room.id);
}

async function run(
  code: string,
  room: EncounterDefinition,
  battle = battleFor(room),
): Promise<RunResult> {
  py.globals.set(
    "_payload",
    JSON.stringify({
      code,
      contract: room.contract,
      context: {
        hp: battle.hp,
        mp: battle.mp,
        enemy_hp: battle.enemyHp,
        enemy_intent: battle.intent.kind,
        potions: battle.potions,
      },
    }),
  );
  return JSON.parse(await py.runPythonAsync(PYTHON_VALIDATOR)) as RunResult;
}

const omissions: Array<[string, Concept[], string]> = [
  ["1-4", ["print"], "# Camp plan\ndefend()"],
  ["1-4", ["comment"], 'print("Ready")\ndefend()'],
  ["2-4", ["variable"], "print(2 + 1)\ndefend()"],
  ["2-4", ["arithmetic"], "fuel = 2\nprint(fuel)\ndefend()"],
  ["3-4", ["list"], 'parcels = ["tea"]\ndefend()'],
  ["4-4", ["for"], 'print("Ready")\ndefend()'],
  ["4-4", ["print"], "for step in range(1):\n    pass\ndefend()"],
  ["5-4", ["function"], 'def ready():\n    print("Ready")\ndefend()'],
  ["6-4", ["class"], "class Gauge:\n    power = 3\ngauge = Gauge()\ndefend()"],
];

const personalPlans: Array<[string, string]> = [
  ["1-4", '# รอทีม\nprint("เตรียมเดินทาง")\ndefend()'],
  ["2-4", "จำนวน = 5\nprint(จำนวน * 2)\ndefend()"],
  ["3-4", 'พัสดุ = ["ชา"]\nprint(พัสดุ[0])\ndefend()'],
  ["4-4", 'for รอบ in range(2):\n    print("พร้อม")\ndefend()'],
  ["5-4", 'def ทักทาย():\n    print("สวัสดี")\nทักทาย()\ndefend()'],
  [
    "6-4",
    "class Dial:\n    value = 7\ndial = Dial()\nprint(dial.value)\ndefend()",
  ],
];

const inactiveEvidence: Array<[string, Concept[], string]> = [
  ["1-4", ["print"], '# Camp plan\nif False:\n    print("Ready")\ndefend()'],
  [
    "2-4",
    ["arithmetic"],
    "fuel = 2\nprint(fuel)\nif False:\n    print(fuel + 1)\ndefend()",
  ],
  [
    "3-4",
    ["list"],
    'parcels = ["tea"]\nif False:\n    print(len(parcels))\ndefend()',
  ],
  ["4-4", ["for"], 'for step in []:\n    pass\nprint("Ready")\ndefend()'],
  [
    "4-4",
    ["print"],
    'for step in range(1):\n    pass\nif False:\n    print("Ready")\ndefend()',
  ],
  [
    "5-4",
    ["function"],
    'def ready():\n    print("Ready")\nif False:\n    ready()\ndefend()',
  ],
  [
    "6-4",
    ["class"],
    "class Gauge:\n    power = 3\ngauge = Gauge()\nif False:\n    print(gauge.power)\ndefend()",
  ],
];

const completedStarterEdits: Array<[string, string, string]> = [
  [
    "1-4",
    "# TODO: Add print() with your message.",
    '# My plan\nprint("Ready")',
  ],
  ["2-4", "# TODO: Print fuel + 1.", "print(fuel + 1)"],
  ["3-4", "# TODO: Print len(parcels).", "print(len(parcels))"],
  ["4-4", "    pass", '    print("Ready")'],
  ["5-4", "# TODO: Call ready().", "ready()"],
  ["6-4", "\nattack()", "\nattack(gauge.power)"],
];

describe("easy boss reviews", () => {
  it.each(CHAPTERS)(
    "chapter $id: keeps the task short with one scaffolded editing step",
    async (chapter) => {
      const room = chapter.encounters[3];
      expect(room.prompt.split(/\s+/).length).toBeLessThanOrEqual(22);
      expect(room.prompt.split(/[.!?]\s+/).length).toBeLessThanOrEqual(2);
      expect(room.contract.concepts.length).toBeLessThanOrEqual(2);
      expect(room.starter.match(/TODO/g)).toHaveLength(1);
      expect(room.solutions).toHaveLength(3);
      expect(new Set(room.solutions).size).toBe(3);
      for (const code of room.solutions) {
        expect(code.split("\n").length).toBeLessThanOrEqual(5);
      }
      const result = await run(room.starter, room);
      expect(result.ok).toBe(false);
      expect(result.actions).toEqual([]);
    },
  );

  it.each(completedStarterEdits)(
    "%s accepts a single small edit to its starter",
    async (id, before, after) => {
      const room = encounterById(id);
      expect(room.starter).toContain(before);
      const battle = { ...battleFor(room), mp: 0, potions: 0 };
      const result = await run(
        room.starter.replace(before, after),
        room,
        battle,
      );
      expect(result.ok, result.diagnostic?.message).toBe(true);
      expect(resolveTurn(battle, result.actions).error).toBeUndefined();
    },
  );

  it.each(omissions)(
    "%s rejects a plan missing %s",
    async (id, missing, code) => {
      const result = await run(code, encounterById(id));
      expect(result.ok).toBe(false);
      expect(result.actions).toEqual([]);
      expect(result.diagnostic?.message).toContain(
        `ยังไม่พบการใช้แนวคิด ${missing.join(", ")}`,
      );
    },
  );

  it.each(personalPlans)(
    "%s accepts short personal data and a zero-MP defensive choice",
    async (id, code) => {
      const room = encounterById(id);
      const battle = { ...battleFor(room), mp: 0, potions: 0 };
      const result = await run(code, room, battle);
      expect(result.ok, result.diagnostic?.message).toBe(true);
      expect(result.actions).toEqual([{ kind: "defend" }]);
      expect(resolveTurn(battle, result.actions).error).toBeUndefined();
    },
  );

  it.each(inactiveEvidence)(
    "%s rejects present but inactive %s evidence",
    async (id, missing, code) => {
      const result = await run(code, encounterById(id));
      expect(result.ok).toBe(false);
      expect(result.actions).toEqual([]);
      expect(result.diagnostic?.message).toContain(
        `ยังไม่พบการใช้แนวคิด ${missing.join(", ")}`,
      );
    },
  );

  it.each(CHAPTERS)(
    "chapter $id: short normal and skill references remain legal in late boss phases",
    async (chapter) => {
      const room = chapter.encounters[3];
      for (const enemyHp of [Math.ceil(battleFor(room).maxEnemyHp / 2), 1]) {
        for (const [index, code] of room.solutions.entries()) {
          const battle = {
            ...battleFor(room),
            enemyHp,
            mp: index === 2 ? 4 : 0,
            potions: 0,
          };
          battle.intent = intentFor(
            room.id,
            battle.turn,
            enemyHp,
            battle.maxEnemyHp,
          );
          const result = await run(code, room, battle);
          expect(result.ok, result.diagnostic?.message).toBe(true);
          expect(
            result.actions.reduce(
              (ap, action) => ap + actionAP(action.kind),
              0,
            ),
          ).toBeLessThanOrEqual(3);
          expect(
            result.actions.filter((action) => action.kind === "skill"),
          ).toHaveLength(index === 2 ? 1 : 0);
          expect(result.actions.some((action) => action.kind === "heal")).toBe(
            false,
          );
          expect(resolveTurn(battle, result.actions).error).toBeUndefined();
        }
      }
    },
  );

  it.each(["attack", "heavy", "guard", "charge", "poison"] as IntentKind[])(
    "keeps the printed loop separate from combat AP for %s intent",
    async (kind) => {
      const room = encounterById("4-4");
      for (const [index, code] of room.solutions.entries()) {
        const initial = battleFor(room);
        const battle = {
          ...initial,
          mp: index === 2 ? 4 : 0,
          intent: { ...initial.intent, kind },
        };
        const result = await run(code, room, battle);
        expect(result.ok, result.diagnostic?.message).toBe(true);
        expect(result.stdout.length).toBeGreaterThan(0);
        expect(result.actions).toHaveLength(2);
        expect(
          result.trace?.every((action) => action.loopLine === undefined),
        ).toBe(true);
        expect(resolveTurn(battle, result.actions).error).toBeUndefined();
      }
    },
  );
});
