import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { actionBudget } from "../src/actionBudget";
import { actionAP, resolveTurn, startCombat } from "../src/engine";
import { actionCall, HERO_SKILLS, starterActionCall } from "../src/skills";
import { freshSave } from "../src/storage";
import type { CombatState, GameAction, HeroId } from "../src/types";
import { PythonFeedback } from "../src/ui/PythonFeedback";
import { SkillBook } from "../src/ui/SkillBook";
import { TurnPreview } from "../src/ui/TurnPreview";
import { offenseChanges } from "../src/ui/offenseCode";

function battle(hero: HeroId = "adventurer"): CombatState {
  const save = freshSave();
  save.hero = hero;
  return {
    ...startCombat(save, "1-4"),
    enemyHp: 500,
    maxEnemyHp: 500,
    mp: 10,
    intent: { kind: "attack", damage: 20, label: "โจมตี", description: "" },
  };
}
function hitDamage(before: CombatState, actions: GameAction[]) {
  let hp = before.enemyHp;
  return resolveTurn(before, actions)
    .events.filter(
      (event) => event.target === "enemy" && event.animation === "hurt",
    )
    .map((event) => {
      const damage = hp - event.vitals!.enemyHp;
      hp = event.vitals!.enemyHp;
      return damage;
    });
}

describe("offensive power uses the lesson value without changing action costs", () => {
  it.each([1, 2, 3])("attack power %i adds damage before armor", (power) => {
    const before = battle();
    const original = structuredClone(before);
    const result = resolveTurn(before, [{ kind: "attack", power }]);
    expect(before.enemyHp - result.state.enemyHp).toBe([12, 16, 20][power - 1]);
    expect(result.state.mp).toBe(before.mp);
    expect(actionAP("attack")).toBe(1);
    expect(result.state.log.join(" ")).toContain(`พลัง ${power}`);
    expect(result.events[0]).toMatchObject({
      action: "attack",
      power,
      actionIndex: 0,
    });
    expect(result.events[0].vitals?.enemyHp).toBe(500);
    expect(result.events[1].vitals?.enemyHp).toBe(result.state.enemyHp);
    expect(before).toEqual(original);
    expect(
      hitDamage(
        { ...before, intent: { ...before.intent, kind: "guard", damage: 0 } },
        [{ kind: "attack", power }],
      ),
    ).toEqual([[6, 8, 10][power - 1]]);
  });

  it("applies each actual value before the adventurer's combo and resets after support", () => {
    expect(
      hitDamage(battle(), [
        { kind: "attack", power: 1 },
        { kind: "attack", power: 2 },
        { kind: "attack", power: 3 },
      ]),
    ).toEqual([12, 19, 28]);
    expect(
      hitDamage(battle(), [
        { kind: "attack", power: 3 },
        { kind: "defend" },
        { kind: "attack", power: 2 },
      ]),
    ).toEqual([20, 16]);
  });

  it("applies the wizard's focus bonus after the power bonus with one rounding", () => {
    const before = battle("wizard");
    const result = resolveTurn(before, [
      { kind: "focus" },
      { kind: "skill", power: 3 },
    ]);
    expect(before.enemyHp - result.state.enemyHp).toBe(68);
    expect(result.state.mp).toBe(9);
    expect(
      result.events.find((event) => event.action === "skill"),
    ).toMatchObject({ power: 3, trait: { hero: "wizard" } });
    expect(result.error).toBeUndefined();
  });

  for (const hero of Object.keys(HERO_SKILLS) as HeroId[]) {
    for (const skill of HERO_SKILLS[hero]) {
      it(`${hero} ${skill.id}: preserves legacy default, resource cost and armor rules`, () => {
        const before = battle(hero);
        before.intent = { ...before.intent, kind: "guard", damage: 0 };
        const legacy = resolveTurn(before, [
          { kind: "skill", skill: skill.id },
        ]);
        const explicit = resolveTurn(before, [
          { kind: "skill", skill: skill.id, power: 1 },
        ]);
        expect({ ...explicit.state, log: [] }).toEqual({
          ...legacy.state,
          log: [],
        });
        const result = resolveTurn(before, [
          { kind: "skill", skill: skill.id, power: 3 },
          { kind: "defend" },
        ]);
        const damage = Math.round((before.attack + 8) * skill.multiplier);
        expect(before.enemyHp - result.state.enemyHp).toBe(
          skill.pierce ? damage : Math.ceil(damage / 2),
        );
        expect(result.state.mp).toBe(10 - skill.mp + (skill.refund ?? 0));
        expect(result.error).toBeUndefined();
        expect(
          result.events.find((event) => event.action === "skill"),
        ).toMatchObject({ skill: skill.id, power: 3 });
      });
    }
  }

  it("retains MP, mixed-offense and AP rejection even with a power argument", () => {
    const before = battle("knight");
    const cases: [CombatState, GameAction[], string][] = [
      [{ ...before, mp: 0 }, [{ kind: "skill", power: 3 }], "MP ไม่พอ"],
      [
        before,
        [
          { kind: "attack", power: 1 },
          { kind: "skill", power: 3 },
        ],
        "อย่างใดอย่างหนึ่ง",
      ],
      [
        before,
        [
          { kind: "skill", power: 1 },
          { kind: "skill", power: 1 },
        ],
        "ใช้ 4 AP",
      ],
    ];
    for (const [state, actions, error] of cases) {
      const result = resolveTurn(state, actions);
      expect(result.state).toBe(state);
      expect(result.events).toEqual([]);
      expect(result.error).toContain(error);
    }
  });

  it.each([
    0,
    4,
    -1,
    1.5,
    NaN,
    Infinity,
    -Infinity,
    "2",
    true,
    false,
    null,
    {},
    [],
  ])(
    "rejects invalid power %s atomically and identifies its action",
    (power) => {
      const before = battle();
      const original = structuredClone(before);
      const result = resolveTurn(before, [
        { kind: "defend" },
        { kind: "attack", power } as GameAction,
      ]);
      expect(result.error).toContain("จำนวนเต็ม 1 ถึง 3");
      expect(result.actionIndex).toBe(1);
      expect(result.state).toBe(before);
      expect(result.events).toEqual([]);
      expect(before).toEqual(original);
    },
  );

  it.each(["defend", "heal", "focus"] as const)(
    "rejects power on %s",
    (kind) => {
      const before = battle();
      const result = resolveTurn(before, [{ kind, power: 1 }]);
      expect(result.error).toContain("เฉพาะ attack()");
      expect(result.actionIndex).toBe(0);
      expect(result.state).toBe(before);
      expect(result.events).toEqual([]);
    },
  );

  it("still validates the whole plan before a power-based killing blow", () => {
    const before = { ...battle(), enemyHp: 1, potions: 0 };
    const result = resolveTurn(before, [
      { kind: "attack", power: 3 },
      { kind: "heal" },
    ]);
    expect(result.error).toContain("ยาไม่พอ");
    expect(result.state).toBe(before);
    expect(result.events).toEqual([]);
  });
});

describe("power evidence in existing UI owners", () => {
  it("starts every new offense at explicit power 1 while leaving support without arguments", () => {
    expect(starterActionCall("attack")).toBe("attack(1)");
    expect(starterActionCall("skill")).toBe("skill(1)");
    for (const skill of ["pierce", "stun", "burst"] as const)
      expect(starterActionCall("skill", skill)).toBe(`${skill}(1)`);
    for (const kind of ["defend", "heal", "focus"] as const)
      expect(starterActionCall(kind)).toBe(`${kind}()`);
  });
  it("scopes the adventurer's combo example to boss rooms instead of prescribing it in a source exercise", () => {
    const props = {
      battle: battle(),
      onInsert: () => {},
      offenseMode: "attack" as const,
      offenseSkill: "class" as const,
      onChooseOffense: () => {},
      disabled: false,
    };
    const source = renderToStaticMarkup(
      createElement(SkillBook, {
        ...props,
        battle: { ...props.battle, encounterId: "1-1" },
      }),
    );
    expect(source).toContain("คอมโบของนักผจญภัยใช้ในห้องบอส");
    expect(source).not.toContain("attack()\nattack()");
    const boss = renderToStaticMarkup(createElement(SkillBook, props));
    expect(boss).toContain("attack()\nattack()");
  });
  it("distinguishes evaluated powers on the same source line without multiplying AP by power", () => {
    const budget = actionBudget(
      [
        { kind: "attack", power: 1, line: 2, loopLine: 1 },
        { kind: "attack", power: 2, line: 2, loopLine: 1 },
        { kind: "attack", power: 3, line: 2, loopLine: 1 },
      ],
      "for power in [1, 2, 3]:\n    attack(power)",
    );
    expect(budget).toMatchObject({
      total: 3,
      rows: [
        { command: "attack(1)", count: 1, ap: 1 },
        { command: "attack(2)", count: 1, ap: 1 },
        { command: "attack(3)", count: 1, ap: 1 },
      ],
    });
    const html = renderToStaticMarkup(
      createElement(PythonFeedback, {
        result: { ok: true, actions: [], stdout: [], budget },
        ready: true,
        reveal: false,
        onJump: () => {},
      }),
    );
    expect(html).toContain("attack(3)");
    expect(html).not.toContain("attack(3)()");
    expect(html).toContain("ตัวเลขในวงเล็บคือพลัง ไม่ใช่ AP");
  });

  it("formats named skills and renders actual calls alongside unchanged costs in forecast", () => {
    const before = battle("knight");
    const actions: GameAction[] = [
      { kind: "skill", skill: "pierce", power: 3 },
      { kind: "defend" },
    ];
    const original = structuredClone(before);
    const after = resolveTurn(before, actions).state;
    const html = renderToStaticMarkup(
      createElement(TurnPreview, {
        forecast: {
          before,
          after,
          actions,
          source: "pierce(3)\ndefend()",
          traits: [],
        },
        onRun: () => {},
        onEdit: () => {},
        onClose: () => {},
        disabled: false,
      }),
    );
    expect(html).toContain("pierce(3)");
    expect(html).toContain("defend()");
    expect(html).toContain("2 AP");
    expect(actionCall({ kind: "skill", power: 2 })).toBe("skill(2)");
    expect(actionCall({ kind: "skill", skill: "burst", power: 3 })).toBe(
      "burst(3)",
    );
    expect(before).toEqual(original);
  });

  it.each(["player", "dialog"] as const)(
    "labels %s handbook damage as the power-1 example",
    (variant) => {
      const html = renderToStaticMarkup(
        createElement(SkillBook, {
          battle: battle(),
          onInsert: () => {},
          offenseMode: "attack",
          offenseSkill: "class",
          onChooseOffense: () => {},
          disabled: false,
          variant,
        }),
      );
      expect(html).toContain("ตัวอย่างพลัง 1");
      expect(html).toContain("เก็บค่าพลังในวงเล็บไว้");
      expect(html).toContain("พลังเพิ่มดาเมจแต่ไม่เพิ่ม AP หรือ MP ที่ใช้");
    },
  );

  it("switches offensive names while preserving lesson power expressions and support", () => {
    const source = "power = 1 + 1\nattack(power)\ndefend()";
    const plan = offenseChanges(source, "skill", "pierce");
    const next = plan.changes.reduceRight(
      (code, change) =>
        code.slice(0, change.from) + change.insert + code.slice(change.to),
      source,
    );
    expect(plan.unsafe).toBe(false);
    expect(next).toBe("power = 1 + 1\npierce(power)\ndefend()");
  });
});
