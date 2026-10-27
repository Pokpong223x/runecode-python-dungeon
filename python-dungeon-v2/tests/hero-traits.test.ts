import { describe, expect, it } from "vitest";
import {
  resolveTurn,
  startCombat,
  commitBattle,
  rewardVictory,
} from "../src/engine";
import { ENCOUNTERS } from "../src/content";
import { freshSave, validateSave } from "../src/storage";
import { traitMessages } from "../src/heroTraits";
import type { CombatState, GameAction, HeroId, SkillId } from "../src/types";

const attack: GameAction = { kind: "attack" };
const defend: GameAction = { kind: "defend" };
const focus: GameAction = { kind: "focus" };
const skill: GameAction = { kind: "skill" };
function battle(hero: HeroId): CombatState {
  const save = freshSave();
  save.hero = hero;
  return {
    ...startCombat(save, "1-1"),
    enemyHp: 200,
    maxEnemyHp: 200,
    mp: 10,
    intent: { kind: "heavy", damage: 20, label: "โจมตีหนัก!", description: "" },
  };
}
const damageBeats = (before: CombatState, actions: GameAction[]) => {
  let hp = before.enemyHp;
  return resolveTurn(before, actions)
    .events.filter(
      (event) => event.target === "enemy" && event.animation === "hurt",
    )
    .map((event) => {
      const delta = hp - event.vitals!.enemyHp;
      hp = event.vitals!.enemyHp;
      return delta;
    });
};

describe("adventurer consecutive normal attacks", () => {
  it("adds 20% then 40% before armor, with one rounding per hit", () => {
    const before = battle("adventurer");
    expect(damageBeats(before, [attack, attack, attack])).toEqual([12, 14, 17]);
    before.intent = { ...before.intent, kind: "guard", damage: 0 };
    expect(damageBeats(before, [attack, attack, attack])).toEqual([6, 7, 9]);
  });
  it.each([defend, focus, { kind: "heal" } as GameAction])(
    "$kind interrupts the consecutive sequence",
    (support) => {
      expect(
        damageBeats(battle("adventurer"), [attack, support, attack]),
      ).toEqual([12, 12]);
    },
  );
  it("restarts next turn, and attributes bonus only to executed action beats", () => {
    const before = battle("adventurer");
    const first = resolveTurn(before, [attack, attack, defend]);
    expect(
      first.events
        .filter((event) => event.trait)
        .map((event) => event.actionIndex),
    ).toEqual([1]);
    expect(traitMessages(first.events)).toEqual(["ต่อคอมโบ · คอมโบ 2 · +20%"]);
    const second = resolveTurn(first.state, [attack]);
    // Turn two is the enemy's guard: a fresh 12-point hit is halved to 6.
    expect(first.state.enemyHp - second.state.enemyHp).toBe(6);
    expect(traitMessages(second.events)).toEqual([]);
  });
  it("does not invent a combo when the first hit wins", () => {
    const before = { ...battle("adventurer"), enemyHp: 10 };
    const result = resolveTurn(before, [attack, attack, attack]);
    expect(result.state.status).toBe("won");
    expect(traitMessages(result.events)).toEqual([]);
    expect(result.events.filter((event) => event.action)).toHaveLength(1);
  });
  it.each(["knight", "wizard"] as const)(
    "%s does not get the adventurer's combo",
    (hero) => {
      const before = battle(hero);
      expect(damageBeats(before, [attack, attack, attack])).toEqual(
        Array(3).fill(before.attack),
      );
    },
  );
});

describe("knight mana from surviving a blocked counter", () => {
  it("restores at contact only, preserving pre-counter vitals and the input", () => {
    const before = battle("knight");
    const original = structuredClone(before);
    const result = resolveTurn(before, [attack, defend]);
    expect(result.state).toMatchObject({ hp: 133, mp: 12 });
    const counter = result.events.find(
      (event) => event.target === "enemy" && event.animation === "attack",
    )!;
    const contact = result.events.find(
      (event) => event.target === "hero" && event.animation === "hurt",
    )!;
    expect(counter.vitals).toMatchObject({ hp: 140, mp: 10 });
    expect(contact.vitals).toMatchObject({ hp: 133, mp: 12 });
    expect(contact.actionIndex).toBeUndefined();
    expect(contact.trait?.text).toBe("ป้องกันแล้ว +2 MP");
    expect(before).toEqual(original);
  });
  it("uses the class shield skill's guard, without double restoration for extra defend", () => {
    for (const actions of [[skill], [skill, defend]]) {
      const result = resolveTurn(battle("knight"), actions);
      expect(result.state.mp).toBe(8);
      expect(result.events.filter((event) => event.trait)).toHaveLength(1);
    }
  });
  it("caps restoration and repeated defense cannot multiply it", () => {
    for (const [mp, expected, procs] of [
      [10, 12, 1],
      [15, 16, 1],
      [16, 16, 0],
    ]) {
      const result = resolveTurn({ ...battle("knight"), mp }, [
        defend,
        defend,
        defend,
      ]);
      expect(result.state.mp).toBe(expected);
      expect(result.events.filter((event) => event.trait)).toHaveLength(procs);
    }
  });
  it.each(["guard", "charge"] as const)(
    "%s and existing poison alone cannot restore mana",
    (kind) => {
      const before = battle("knight");
      before.poison = 2;
      before.intent = { ...before.intent, kind, damage: 0 };
      const result = resolveTurn(before, [defend]);
      expect(result.state.hp).toBe(before.hp - 4);
      expect(result.state.mp).toBe(before.mp);
      expect(traitMessages(result.events)).toEqual([]);
    },
  );
  it("blocking a poison attack restores mana but neither reduces nor clears old poison", () => {
    const before = battle("knight");
    before.poison = 1;
    before.intent.kind = "poison";
    const result = resolveTurn(before, [defend]);
    expect(result.state).toMatchObject({ hp: 129, mp: 12, poison: 2 });
  });
  it("cannot restore from an interrupted counter, a lethal counter, victory or zero prevention", () => {
    const before = battle("knight");
    const cases: Array<[CombatState, GameAction[], number]> = [
      [before, [{ kind: "skill", skill: "stun" }, defend], 5],
      [{ ...before, hp: 6 }, [defend], 10],
      [{ ...before, hp: 10, poison: 1 }, [defend], 10],
      [{ ...before, enemyHp: 1 }, [skill], 6],
      [{ ...before, intent: { ...before.intent, damage: 1 } }, [defend], 10],
      [before, [attack], 10],
    ];
    for (const [state, actions, mp] of cases) {
      const result = resolveTurn(state, actions);
      expect(result.error).toBeUndefined();
      expect(result.state.mp).toBe(mp);
      expect(traitMessages(result.events)).toEqual([]);
    }
  });
  it("cannot borrow mana from a future blocked attack to pay for a skill", () => {
    const before = { ...battle("knight"), mp: 2 };
    const result = resolveTurn(before, [defend, skill]);
    expect(result.error).toContain("MP ไม่พอ");
    expect(result.state).toBe(before);
    expect(result.events).toEqual([]);
  });
  it.each(["adventurer", "wizard"] as const)(
    "%s cannot obtain the knight's restoration",
    (hero) => {
      expect(resolveTurn(battle(hero), [defend]).state.mp).toBe(10);
    },
  );
});

describe("wizard focus before a skill", () => {
  it.each([
    ["class", 41, 41, 9],
    ["burst", 53, 27, 7],
    ["stun", 21, 11, 8],
  ] as const)(
    "%s adds 25% before rounding and enemy armor",
    (id, hit, shieldedHit, mp) => {
      const before = battle("wizard");
      const actions: GameAction[] = [
        focus,
        { kind: "skill", skill: id as SkillId },
      ];
      const result = resolveTurn(before, actions);
      expect(result.state.enemyHp).toBe(200 - hit);
      expect(result.state.mp).toBe(mp);
      expect(
        result.events.find((event) => event.action === "skill"),
      ).toMatchObject({
        actionIndex: 1,
        trait: { hero: "wizard", text: "พลังสกิล +25%" },
      });
      before.intent = { ...before.intent, kind: "guard", damage: 0 };
      expect(resolveTurn(before, actions).state.enemyHp).toBe(
        200 - shieldedHit,
      );
    },
  );
  it("distinguishes focus before and after without changing costs", () => {
    const before = battle("wizard");
    const empowered = resolveTurn(before, [focus, skill]);
    const ordinary = resolveTurn(before, [skill, focus]);
    expect(empowered.state.mp).toBe(ordinary.state.mp);
    expect(empowered.state.enemyHp).toBe(159);
    expect(ordinary.state.enemyHp).toBe(168);
    expect(traitMessages(ordinary.events)).toEqual([]);
  });
  it("never stores charge in the checkpoint and cannot carry it to the next turn", () => {
    const before = battle("wizard");
    const first = resolveTurn(before, [focus]);
    expect(Object.keys(first.state)).toEqual(Object.keys(before));
    const next = resolveTurn(first.state, [skill]);
    expect(first.state.enemyHp - next.state.enemyHp).toBe(32);
    expect(traitMessages(next.events)).toEqual([]);
  });
  it("requires a real legal focus, including non-full MP and enough mana afterward", () => {
    for (const mp of [0, 24]) {
      const before = { ...battle("wizard"), mp };
      const result = resolveTurn(before, [focus, skill]);
      expect(result.error).toBeTruthy();
      expect(result.state).toBe(before);
      expect(result.events).toEqual([]);
    }
  });
  it.each(["adventurer", "knight"] as const)(
    "%s does not gain wizard damage from focus",
    (hero) => {
      const before = battle(hero);
      expect(damageBeats(before, [focus, skill])).toEqual(
        damageBeats(before, [skill]),
      );
    },
  );
});

describe("passive atomicity and existing saves", () => {
  it.each(["adventurer", "knight", "wizard"] as const)(
    "%s completes 24 rooms using its own tactical rhythm without upgrades",
    (hero) => {
      let save = freshSave();
      save.hero = hero;
      let activations = 0;
      for (const room of ENCOUNTERS) {
        let current = startCombat(save, room.id);
        for (let turn = 0; turn < 30 && current.status === "active"; turn++) {
          let actions: GameAction[];
          if (hero === "adventurer") {
            actions =
              current.intent.kind === "heavy" ||
              current.intent.kind === "poison"
                ? [attack, attack, defend]
                : [attack, attack, attack];
          } else if (hero === "knight") {
            actions =
              current.mp >= 4 ? [skill, focus] : [attack, attack, defend];
          } else {
            actions =
              current.mp === current.maxMp ||
              (current.intent.kind === "heavy" && current.mp >= 4)
                ? [skill, defend]
                : current.mp + 3 >= 4
                  ? [focus, skill]
                  : [attack, attack, focus];
          }
          const resolution = resolveTurn(current, actions);
          expect(
            resolution.error,
            `${hero} ${room.id} turn ${current.turn}`,
          ).toBeUndefined();
          activations += traitMessages(resolution.events).length;
          current = resolution.state;
        }
        expect(current.status, `${hero} ${room.id}`).toBe("won");
        save = rewardVictory(save, current);
        expect(validateSave(save)).toBe(true);
      }
      expect(save.completed).toHaveLength(24);
      expect(activations).toBeGreaterThan(0);
      expect(save.upgrades).toEqual({ attack: 0, hp: 0 });
    },
  );
  it.each(["adventurer", "knight", "wizard"] as const)(
    "%s previews deterministically and persists only its normal checkpoint",
    (hero) => {
      const save = freshSave();
      save.hero = hero;
      save.battle = battle(hero);
      const snapshot = structuredClone(save);
      const actions =
        hero === "adventurer"
          ? [attack, attack, defend]
          : hero === "knight"
            ? [skill, focus]
            : [focus, skill];
      const preview = resolveTurn(save.battle, actions);
      const commit = resolveTurn(save.battle, actions);
      expect(preview).toEqual(commit);
      expect(save).toEqual(snapshot);
      const persisted = JSON.parse(
        JSON.stringify(commitBattle(save, commit.state)),
      );
      expect(validateSave(persisted)).toBe(true);
      expect(persisted.battle).not.toHaveProperty("trait");
      expect(resolveTurn(persisted.battle, [attack]).error).toBeUndefined();
      for (const invalid of [
        [attack, skill],
        [focus, focus],
        [skill, skill],
      ]) {
        const rejected = resolveTurn(save.battle, invalid);
        expect(rejected.error).toBeTruthy();
        expect(rejected.state).toBe(save.battle);
        expect(rejected.events).toEqual([]);
      }
    },
  );
});
