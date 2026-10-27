import { describe, expect, it } from "vitest";
import { getSkill, HERO_SKILLS } from "../src/skills";
import { resolveTurn, startCombat } from "../src/engine";
import { actionBudget } from "../src/actionBudget";
import { freshSave } from "../src/storage";
import { inspectOffense, offenseChanges } from "../src/ui/offenseCode";
import type { HeroId, SkillId } from "../src/types";

for (const hero of Object.keys(HERO_SKILLS) as HeroId[]) {
  describe(`${hero} skill catalog`, () => {
    it("provides three distinct selectable skills with the original default", () => {
      expect(HERO_SKILLS[hero]).toHaveLength(3);
      expect(new Set(HERO_SKILLS[hero].map((s) => s.id)).size).toBe(3);
      expect(getSkill(hero)?.id).toBe("class");
    });
    for (const skill of HERO_SKILLS[hero]) {
      it(`${skill.id}: applies its actual cost, damage and armor behavior`, () => {
        const save = freshSave();
        save.hero = hero;
        const before = startCombat(save, "6-4");
        before.intent = {
          ...before.intent,
          kind: "guard",
          damage: 0,
          label: "ตั้งโล่",
        };
        const original = structuredClone(before);
        const result = resolveTurn(before, [
          { kind: "skill", skill: skill.id },
          { kind: "defend" },
        ]);
        expect(result.error).toBeUndefined();
        const damage = Math.round(before.attack * skill.multiplier);
        expect(result.state.enemyHp).toBe(
          before.enemyHp - (skill.pierce ? damage : Math.ceil(damage / 2)),
        );
        expect(result.state.mp).toBe(
          before.mp - skill.mp + (skill.refund ?? 0),
        );
        expect(result.events.find((e) => e.action === "skill")?.skill).toBe(
          skill.id,
        );
        expect(result.state.log.join(" ")).toContain(skill.name);
        expect(before).toEqual(original);
        const rejected = resolveTurn({ ...before, mp: skill.mp - 1 }, [
          { kind: "skill", skill: skill.id },
        ]);
        expect(rejected.error).toContain("MP ไม่พอ");
        expect(rejected.events).toEqual([]);
      });
    }
    it("interrupts this counter without removing existing poison or applying new poison", () => {
      const save = freshSave();
      save.hero = hero;
      const before = startCombat(save, "6-4");
      before.intent = {
        kind: "poison",
        damage: 30,
        label: "พิษ",
        description: "พิษ",
      };
      for (const poison of [0, 2]) {
        const result = resolveTurn({ ...before, poison }, [
          { kind: "skill", skill: "stun" },
        ]);
        expect(result.state.hp).toBe(before.hp - (poison ? 4 : 0));
        expect(result.state.poison).toBe(poison ? 1 : 0);
        expect(result.state.turn).toBe(2);
        expect(
          result.events.some(
            (event) =>
              event.target === "enemy" && event.text.startsWith("มึนงง"),
          ),
        ).toBe(true);
      }
    });
    it("rejects mixing normal attack with every skill and enforces the common AP budget", () => {
      const save = freshSave();
      save.hero = hero;
      const before = startCombat(save, "6-4");
      for (const skill of HERO_SKILLS[hero]) {
        expect(
          resolveTurn(before, [
            { kind: "attack" },
            { kind: "skill", skill: skill.id },
          ]).state,
        ).toBe(before);
        const over = resolveTurn(before, [
          { kind: "skill", skill: skill.id },
          { kind: "skill", skill: skill.id },
        ]);
        expect(over.error).toContain("ใช้ 4 AP");
        expect(over.actionIndex).toBe(1);
        expect(over.state).toBe(before);
      }
    });
  });
}
describe("AP evidence and skill source changes", () => {
  it("groups repeated executed lines, identifies the crossing line, and gives a resource-only suggestion", () => {
    const budget = actionBudget(
      [
        { kind: "skill", skill: "stun", line: 3, loopLine: 4 },
        { kind: "skill", skill: "stun", line: 3, loopLine: 4 },
        { kind: "defend", line: 6 },
      ],
      'print("แผน")\ndef plan():\n    stun()\nfor i in range(2):\n    plan()\ndefend()',
    );
    expect(budget).toMatchObject({
      total: 5,
      limited: false,
      firstOverLine: 3,
    });
    expect(budget?.rows).toEqual([
      {
        line: 3,
        command: "stun()",
        count: 2,
        ap: 4,
        loopLine: 4,
        suggestedCalls: 1,
      },
      { line: 6, command: "defend()", count: 1, ap: 1, loopLine: undefined },
    ]);
  });
  it("reports capped evidence honestly and ignores impossible source lines", () => {
    expect(actionBudget([], "")).toBeUndefined();
    expect(
      actionBudget([{ kind: "attack", line: 99 }], "attack()"),
    ).toBeUndefined();
    expect(
      actionBudget(
        Array.from({ length: 4 }, () => ({ kind: "attack" as const, line: 2 })),
        "for i in range(100):\n    attack()",
        true,
      ),
    ).toMatchObject({
      total: 4,
      limited: true,
      firstOverLine: 2,
      rows: [{ count: 4, suggestedCalls: 3 }],
    });
  });
  it.each(["class", "pierce", "stun", "burst"] as SkillId[])(
    "changes direct calls and aliases to %s without touching strings or object methods",
    (skill) => {
      const source =
        'print("stun() pierce()")\nmove = attack\nmove()\nhero.stun()';
      const plan = offenseChanges(source, "skill", skill);
      expect(plan.unsafe).toBe(false);
      const next = plan.changes.reduceRight(
        (code, c) => code.slice(0, c.from) + c.insert + code.slice(c.to),
        source,
      );
      const command = skill === "class" ? "skill" : skill;
      expect(next).toBe(
        `print("stun() pierce()")\nmove = ${command}\nmove()\nhero.stun()`,
      );
      expect(inspectOffense(next)).toMatchObject({ mode: "skill", skill });
      expect(offenseChanges(next, "attack").changes).toHaveLength(1);
    },
  );
  it("does not rewrite named-skill bindings and recognizes competing skills", () => {
    expect(offenseChanges("def stun(): pass\nstun()", "attack").unsafe).toBe(
      true,
    );
    expect(inspectOffense("stun()\npierce()")).toMatchObject({
      mode: "skill",
      skill: "mixed",
    });
  });
  it("rejects a skill that does not belong to the chosen class", () => {
    const save = freshSave();
    save.hero = "knight";
    const before = startCombat(save, "1-1");
    expect(
      resolveTurn(before, [{ kind: "skill", skill: "burst" }]),
    ).toMatchObject({ state: before, actionIndex: 0, events: [] });
    expect(
      resolveTurn(before, [{ kind: "skill", skill: "burst" }]).error,
    ).toContain("ไม่ใช่ของอาชีพ");
  });
});
