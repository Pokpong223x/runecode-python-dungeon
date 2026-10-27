import { beforeAll, describe, expect, it } from "vitest";
import { loadPyodide, type PyodideInterface } from "pyodide";
import { resolve } from "node:path";
import { HEROES } from "../src/content";
import { resolveTurn, startCombat } from "../src/engine";
import { HERO_SKILLS, skillCommand } from "../src/skills";
import { PYTHON_VALIDATOR } from "../src/runtime/validator";
import { freshSave } from "../src/storage";
import { offenseChanges } from "../src/ui/offenseCode";
import type { CombatState, HeroId, RunResult } from "../src/types";

let py: PyodideInterface;
beforeAll(async () => {
  py = await loadPyodide({ indexURL: resolve("public/python") + "/" });
}, 60000);

function battleFor(hero: HeroId, room = "1-4") {
  const save = freshSave();
  save.hero = hero;
  return startCombat(save, room);
}

async function run(code: string, battle = battleFor("wizard")) {
  py.globals.set(
    "_payload",
    JSON.stringify({
      code,
      // Source exercise 3 has exact output requirements covered separately.
      // Bosses retain this open sequence concept for creative combat plans.
      contract: { concepts: ["sequence"] },
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

describe("sequence lessons fit legal combat choices", () => {
  it.each(Object.keys(HEROES) as HeroId[])(
    "%s can use print followed by one normal attack or any affordable skill",
    async (hero) => {
      for (const room of ["1-4"]) {
        for (const command of [
          "attack",
          ...HERO_SKILLS[hero].map((skill) => skillCommand(skill.id)),
        ]) {
          const battle = { ...battleFor(hero, room), enemyHp: 1, potions: 0 };
          const checkpoint = structuredClone(battle);
          const result = await run(
            `# ส่งสัญญาณก่อนใช้ท่าเดียว\nprint("พร้อม")\n${command}()`,
            battle,
          );
          expect(
            result.ok,
            `${room} ${command}: ${result.diagnostic?.message}`,
          ).toBe(true);
          expect(result.actions).toHaveLength(1);
          expect(result.stdout).toEqual(["พร้อม"]);
          expect(result.trace?.map((entry) => entry.line)).toEqual([3]);
          const resolution = resolveTurn(battle, result.actions);
          expect(resolution.error).toBeUndefined();
          expect(resolution.state.status).toBe("won");
          expect(battle).toEqual(checkpoint);
        }
      }
    },
  );

  it.each(Object.keys(HEROES) as HeroId[])(
    "%s can learn sequence with zero MP and no potions without adding a support action",
    async (hero) => {
      for (const room of ["1-4"]) {
        const battle = { ...battleFor(hero, room), mp: 0, potions: 0 };
        const result = await run(
          '# ประหยัดมานา\nprint("ใช้ดาบ")\nattack()',
          battle,
        );
        expect(result.ok, result.diagnostic?.message).toBe(true);
        expect(result.actions).toEqual([{ kind: "attack" }]);
        expect(resolveTurn(battle, result.actions).error).toBeUndefined();
      }
    },
  );

  it("switching the single attack after print to a skill preserves the lesson and stays within 3 AP", async () => {
    const source = 'print("พร้อม")\nattack()';
    const plan = offenseChanges(source, "skill");
    let code = source;
    for (const change of [...plan.changes].reverse()) {
      code = code.slice(0, change.from) + change.insert + code.slice(change.to);
    }
    const battle = battleFor("wizard");
    const result = await run(code, battle);
    expect(result.ok, result.diagnostic?.message).toBe(true);
    expect(result.actions).toEqual([{ kind: "skill" }]);
    expect(resolveTurn(battle, result.actions).error).toBeUndefined();
  });

  it.each([
    'skill()\nprint("ร่ายแล้ว")',
    'say = print\nsay("พร้อม")\nskill()',
    'def plan():\n    print("พร้อม")\n    skill()\nplan()',
    "attack()\nattack()",
    "defend()\nskill()",
  ])(
    "accepts executed order and legacy two-action drafts: %s",
    async (code) => {
      const battle = battleFor("wizard");
      const result = await run(code, battle);
      expect(result.ok, result.diagnostic?.message).toBe(true);
      expect(resolveTurn(battle, result.actions).error).toBeUndefined();
    },
  );

  it.each([
    "skill()",
    'print("หนึ่ง\\nสอง")',
    '"ข้อความที่ไม่ได้พิมพ์"\nskill()',
    "# print('ไม่ได้รัน')\nskill()",
    'if False:\n    print("ไม่ได้รัน")\nskill()',
    'def unused():\n    print("ไม่ได้รัน")\nskill()',
    'def print(value):\n    pass\nprint("ไม่ใช่คำสั่งพิมพ์ของเกม")\nskill()',
    'try:\n    print("ไม่สำเร็จ", sep=3)\nexcept TypeError:\n    pass\nskill()',
  ])(
    "does not count AP, comments, dead code or fake/failed print calls: %s",
    async (code) => {
      const battle = battleFor("wizard");
      const checkpoint = structuredClone(battle);
      const result = await run(code, battle);
      expect(result.ok).toBe(false);
      expect(result.actions).toEqual([]);
      expect(result.diagnostic?.message).toContain("sequence");
      expect(result.diagnostic?.message).toContain("print()");
      expect(resolveTurn(battle, result.actions).state).toBe(battle);
      expect(battle).toEqual(checkpoint);
    },
  );

  it("two prints alone still cannot spend a combat turn", async () => {
    const result = await run('print("หนึ่ง")\nprint("สอง")');
    expect(result.ok).toBe(false);
    expect(result.actions).toEqual([]);
    expect(result.diagnostic?.message).toContain("ยังไม่มีคำสั่งต่อสู้");
  });

  it.each([
    ['print("พร้อม")\nskill()\nskill()', {}],
    ['print("พร้อม")\nattack()\nskill()', {}],
    ['print("พร้อม")\nskill()', { mp: 0 }],
  ] as [string, Partial<CombatState>][])(
    "passing sequence never bypasses AP, offensive choice or MP: %s",
    async (code, overrides) => {
      const battle = { ...battleFor("wizard"), ...overrides };
      const checkpoint = structuredClone(battle);
      const result = await run(code, battle);
      expect(result.ok, result.diagnostic?.message).toBe(true);
      const resolution = resolveTurn(battle, result.actions);
      expect(resolution.error).toBeTruthy();
      expect(resolution.state).toBe(battle);
      expect(resolution.events).toEqual([]);
      expect(battle).toEqual(checkpoint);
    },
  );
});
