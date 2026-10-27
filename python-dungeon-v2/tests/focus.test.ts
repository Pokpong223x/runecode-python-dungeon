import { describe, expect, it } from "vitest";
import { resolveTurn, startCombat, actionAP } from "../src/engine";
import { freshSave, validateSave } from "../src/storage";
import { FOCUS_MP } from "../src/skills";
import { cueForBeat } from "../src/audio/BattleAudio";
import { actionBudget } from "../src/actionBudget";
import type { CombatState, GameAction, HeroId } from "../src/types";

function battle(hero: HeroId = "wizard", mp = 0): CombatState {
  const save = freshSave();
  save.hero = hero;
  return { ...startCombat(save, "1-1"), mp };
}

describe("focus mana and actual action playback", () => {
  it.each(["adventurer", "knight", "wizard"] as const)(
    "%s trades one AP for mana, without healing or guarding",
    (hero) => {
      const before = battle(hero);
      const original = structuredClone(before);
      const result = resolveTurn(before, [{ kind: "focus" }]);
      expect(actionAP("focus")).toBe(1);
      expect(result.error).toBeUndefined();
      expect(result.state.mp).toBe(FOCUS_MP);
      expect(result.state.hp).toBe(before.hp - before.intent.damage);
      expect(result.state.potions).toBe(before.potions);
      expect(result.state.turn).toBe(2);
      expect(result.events[0]).toMatchObject({
        action: "focus",
        actionIndex: 0,
        text: "+3 MP",
        vitals: { mp: 3 },
      });
      expect(cueForBeat(result.events[0], hero)).toBe("focus");
      expect(before).toEqual(original);
      expect(resolveTurn(result.state, [{ kind: "focus" }]).state.mp).toBe(6);
    },
  );

  it.each(["adventurer", "knight", "wizard"] as const)(
    "%s can fund a following skill but cannot borrow future mana",
    (hero) => {
      const before = battle(hero, 1);
      const valid = resolveTurn(before, [{ kind: "focus" }, { kind: "skill" }]);
      expect(valid.error).toBeUndefined();
      // Knight's mana arrives after the shielded counter, not at the cast beat.
      expect(valid.state.mp).toBe(
        hero === "adventurer" ? 1 : hero === "knight" ? 2 : 0,
      );
      expect(
        valid.events.find((event) => event.action === "skill")?.vitals?.mp,
      ).toBe(hero === "adventurer" ? 1 : 0);
      const invalid = resolveTurn(before, [
        { kind: "skill" },
        { kind: "focus" },
      ]);
      expect(invalid.error).toContain("MP ไม่พอ");
      expect(invalid.actionIndex).toBe(0);
      expect(invalid.state).toBe(before);
      expect(invalid.events).toEqual([]);
    },
  );

  it.each(["adventurer", "knight", "wizard"] as const)(
    "%s pays for a skill before restoring capped mana",
    (hero) => {
      const before = battle(hero);
      before.mp = before.maxMp;
      const result = resolveTurn(before, [
        { kind: "skill" },
        { kind: "focus" },
      ]);
      expect(result.error).toBeUndefined();
      expect(result.state.mp).toBe(before.maxMp - (hero === "wizard" ? 1 : 0));
      const focus = result.events.find((event) => event.action === "focus")!;
      expect(focus.actionIndex).toBe(1);
      expect(focus.vitals?.mp).toBe(
        before.maxMp - (hero === "adventurer" ? 0 : 1),
      );
      expect(result.events[0].vitals?.mp).toBe(
        before.maxMp - 4 + (hero === "adventurer" ? 1 : 0),
      );
    },
  );

  it("caps the actual restoration and retains SaveGameV1 compatibility", () => {
    const before = battle();
    before.mp = before.maxMp - 1;
    const result = resolveTurn(before, [{ kind: "focus" }]);
    expect(result.state.mp).toBe(before.maxMp);
    expect(result.events[0].text).toBe("+1 MP");
    const save = freshSave();
    save.hero = "wizard";
    save.battle = result.state;
    expect(validateSave(save)).toBe(true);
  });

  it.each([
    { mp: 24, actions: [{ kind: "focus" }], message: "MP เต็ม", index: 0 },
    {
      mp: 0,
      actions: [{ kind: "focus" }, { kind: "focus" }],
      message: "ครั้งเดียว",
      index: 1,
    },
    {
      mp: 0,
      actions: [{ kind: "focus" }, { kind: "skill" }],
      message: "MP ไม่พอ",
      index: 1,
    },
    {
      mp: 1,
      actions: [{ kind: "focus" }, { kind: "skill" }, { kind: "defend" }],
      message: "4 AP",
      index: 2,
    },
    {
      mp: 0,
      actions: [{ kind: "focus" }, { kind: "heal" }],
      message: "ยาไม่พอ",
      index: 1,
    },
  ])(
    "rejects $message atomically at its actual action",
    ({ mp, actions, message, index }) => {
      const before = { ...battle("wizard", mp), potions: 0 };
      const original = structuredClone(before);
      const result = resolveTurn(before, actions as GameAction[]);
      expect(result.error).toContain(message);
      expect(result.actionIndex).toBe(index);
      expect(result.state).toBe(before);
      expect(result.events).toEqual([]);
      expect(before).toEqual(original);
    },
  );

  it("indexes each played command and its contact, but never the enemy response", () => {
    const result = resolveTurn(battle(), [
      { kind: "attack" },
      { kind: "focus" },
      { kind: "defend" },
    ]);
    expect(result.error).toBeUndefined();
    expect(
      result.events.filter((e) => e.action).map((e) => e.actionIndex),
    ).toEqual([0, 1, 2]);
    expect(
      result.events.find((e) => e.target === "enemy" && e.animation === "hurt")
        ?.actionIndex,
    ).toBe(0);
    expect(
      result.events.find(
        (e) => e.target === "enemy" && e.animation === "attack",
      )?.actionIndex,
    ).toBeUndefined();
    const won = resolveTurn({ ...battle(), enemyHp: 1 }, [
      { kind: "attack" },
      { kind: "focus" },
    ]);
    expect(won.state.status).toBe("won");
    expect(won.state.mp).toBe(0);
    expect(won.events.some((e) => e.actionIndex === 1)).toBe(false);
  });

  it("keeps attack/skill exclusion and counts focus in AP evidence", () => {
    const before = battle("wizard", 10);
    const rejected = resolveTurn(before, [
      { kind: "attack" },
      { kind: "focus" },
      { kind: "skill" },
    ]);
    expect(rejected.error).toContain("อย่างใดอย่างหนึ่ง");
    expect(rejected.state).toBe(before);
    expect(
      actionBudget(
        [
          { kind: "focus", line: 1 },
          { kind: "skill", line: 2 },
        ],
        "focus()\nskill()",
      )?.total,
    ).toBe(3);
  });
});
