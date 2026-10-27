import { describe, it, expect } from "vitest";
import { ENCOUNTERS, HEROES, isUnlocked } from "../src/content";
import {
  resolveTurn,
  startCombat,
  rewardVictory,
  purchase,
  bossPhase,
  intentFor,
  victoryStars,
} from "../src/engine";
import { freshSave, validateSave } from "../src/storage";
import type { HeroId } from "../src/types";
describe("deterministic combat", () => {
  it("rejects mixing normal attacks and skills in either order without spending a turn or resources", () => {
    const save = freshSave();
    save.hero = "wizard";
    const before = startCombat(save, "1-1");
    const original = structuredClone(before);
    for (const actions of [
      [{ kind: "attack" as const }, { kind: "skill" as const }],
      [{ kind: "skill" as const }, { kind: "attack" as const }],
    ]) {
      const result = resolveTurn(before, actions);
      expect(result.error).toContain("อย่างใดอย่างหนึ่ง");
      expect(result.state).toBe(before);
      expect(result.events).toEqual([]);
      expect(before).toEqual(original);
    }
    for (const kind of ["attack", "skill"] as const)
      expect(
        resolveTurn(before, [{ kind }, { kind: "defend" }]).error,
      ).toBeUndefined();
  });
  it("keeps boss phase boundaries aligned with the move pattern in all chapters", () => {
    for (const encounter of ENCOUNTERS.filter((e) => e.boss)) {
      expect(bossPhase(67, 100)).toBe(1);
      expect(intentFor(encounter.id, 1, 67, 100).kind).toBe("charge");
      expect(bossPhase(66, 100)).toBe(2);
      expect(intentFor(encounter.id, 1, 66, 100).kind).toBe("heavy");
      expect(bossPhase(34, 100)).toBe(2);
      expect(intentFor(encounter.id, 1, 34, 100).kind).toBe("heavy");
      expect(bossPhase(33, 100)).toBe(3);
      expect(intentFor(encounter.id, 1, 33, 100).kind).toBe("guard");
    }
    // Ordinary enemies retain their move pattern even at very low HP.
    expect(intentFor("1-1", 1, 1, 100).kind).toBe("attack");
  });
  it("applies poison at contact and expires it after two counters, including a charge", () => {
    const save = freshSave();
    save.hero = "knight";
    const battle = startCombat(save, "1-4");
    battle.turn = 5;
    battle.intent = intentFor(
      battle.encounterId,
      5,
      battle.enemyHp,
      battle.maxEnemyHp,
    );
    const poisoned = resolveTurn(battle, [{ kind: "defend" }]);
    expect(
      poisoned.events.find((e) => e.target === "enemy")?.vitals?.poison,
    ).toBe(0);
    expect(
      poisoned.events.find((e) => e.animation === "hurt")?.vitals?.poison,
    ).toBe(2);
    expect(poisoned.state.poison).toBe(2);
    expect(poisoned.state.intent.kind).toBe("charge");
    const charge = resolveTurn(poisoned.state, [{ kind: "defend" }]);
    expect(charge.state.hp).toBe(poisoned.state.hp - 4);
    expect(charge.events[0].vitals?.poison).toBe(2);
    expect(
      charge.events.find((e) => e.animation === "hurt")?.vitals?.poison,
    ).toBe(1);
    const clear = resolveTurn(charge.state, [{ kind: "defend" }]);
    expect(clear.state.poison).toBe(0);
    expect(clear.events.at(-1)?.vitals?.poison).toBe(0);
    expect(battle.poison).toBe(0);
  });
  it("records independent presentation snapshots at contact while preserving the atomic checkpoint", () => {
    const save = freshSave();
    save.hero = "knight";
    const before = { ...startCombat(save, "1-4"), hp: 80 };
    const original = structuredClone(before);
    const result = resolveTurn(before, [{ kind: "heal" }, { kind: "skill" }]);
    const healing = result.events.find((e) => e.action === "heal")!;
    const windup = result.events.find((e) => e.action === "skill")!;
    const contact = result.events.find(
      (e) => e.target === "enemy" && e.animation === "hurt",
    )!;
    expect(healing.vitals).toMatchObject({
      hp: 115,
      potions: before.potions - 1,
      enemyHp: before.enemyHp,
    });
    expect(windup.vitals).toMatchObject({
      mp: before.mp - 4,
      enemyHp: before.enemyHp,
    });
    expect(contact.vitals!.enemyHp).toBe(result.state.enemyHp);
    expect(contact.vitals).not.toBe(windup.vitals);
    expect(result.events.at(-1)?.animation).toBe("charge");
    expect(
      result.events.some((e) => e.target === "hero" && e.animation === "hurt"),
    ).toBe(false);
    expect(before).toEqual(original);
  });
  it("presents poison damage even when a charging enemy deals no direct damage", () => {
    const save = freshSave();
    save.hero = "wizard";
    const b = { ...startCombat(save, "6-4"), poison: 1 };
    const result = resolveTurn(b, [{ kind: "defend" }]);
    const contact = result.events.find(
      (e) => e.target === "hero" && e.animation === "hurt",
    );
    expect(contact?.vitals?.hp).toBe(b.hp - 4);
    expect(contact?.text).toBe("−4");
  });
  it("rejects invalid/AP/MP/potion actions atomically", () => {
    const s = freshSave();
    s.hero = "adventurer";
    const b = startCombat(s, "1-1");
    for (const actions of [
      [],
      [{ kind: "skill" }, { kind: "skill" }],
      [{ kind: "bad" }],
    ] as never[]) {
      const result = resolveTurn(b, actions);
      expect(result.error).toBeTruthy();
      expect(result.state).toBe(b);
    }
    expect(
      resolveTurn({ ...b, mp: 0 }, [{ kind: "skill" }]).error,
    ).toBeTruthy();
    expect(
      resolveTurn({ ...b, potions: 0 }, [{ kind: "heal" }]).error,
    ).toBeTruthy();
  });
  it("reduces HP by real damage, guards and potions work", () => {
    const s = freshSave();
    s.hero = "knight";
    const b = startCombat(s, "1-4");
    const attack = resolveTurn(b, [{ kind: "attack" }]).state;
    expect(attack.enemyHp).toBe(b.enemyHp - b.attack);
    expect(attack.status).toBe("active");
    const active = {
      ...b,
      hp: b.hp - 40,
      intent: { ...b.intent, kind: "heavy" as const, damage: 20 },
    };
    const r = resolveTurn(active, [{ kind: "heal" }, { kind: "defend" }]).state;
    expect(r.hp).toBe(active.hp + 35 - 7);
    expect(r.potions).toBe(2);
  });
  it("awards a victory once", () => {
    const s = freshSave();
    s.hero = "wizard";
    const b = { ...startCombat(s, "1-1"), status: "won" as const, enemyHp: 0 };
    const a = rewardVictory(s, b);
    expect(a.gold).toBeGreaterThan(0);
    expect(rewardVictory(a, b).gold).toBe(a.gold);
    expect(a.completed).toEqual(["1-1"]);
  });
  it("rates actual remaining HP at both boundaries without penalizing legacy learning attempts", () => {
    const save = freshSave();
    save.hero = "adventurer";
    for (const mistakes of [0, 1, 7, 99]) {
      for (const [hp, expected] of [
        [100, 3],
        [61, 3],
        [60, 2],
        [31, 2],
        [30, 1],
        [1, 1],
      ]) {
        const battle = {
          ...startCombat(save, "1-1"),
          maxHp: 100,
          hp,
          mistakes,
          status: "won" as const,
          enemyHp: 0,
        };
        expect(
          victoryStars(battle),
          `${hp}/100 HP, ${mistakes} old attempts`,
        ).toBe(expected);
        const rewarded = rewardVictory(save, battle);
        expect(rewarded.stars["1-1"]).toBe(expected);
        expect(validateSave(rewarded)).toBe(true);
        expect(rewarded.battle?.mistakes).toBe(mistakes);
      }
    }
  });
  it("replays improve best stars without repeating gold and never reduce an earlier score", () => {
    const original = freshSave();
    original.hero = "adventurer";
    original.completed = ["1-1"];
    original.stars["1-1"] = 1;
    original.gold = 30;
    const clean = {
      ...startCombat(original, "1-1"),
      status: "won" as const,
      enemyHp: 0,
    };
    const better = rewardVictory(original, clean);
    expect(better.stars["1-1"]).toBe(3);
    expect(better.gold).toBe(30);
    expect(better.completed).toEqual(["1-1"]);
    expect(original.stars["1-1"]).toBe(1);
    const retry = { ...clean, hp: 10, mistakes: 7, potions: 1 };
    expect(victoryStars(retry)).toBe(1);
    const again = rewardVictory(better, retry);
    expect(again.stars["1-1"]).toBe(3);
    expect(again.gold).toBe(30);
    expect(again.potions).toBe(1);
    expect(validateSave(again)).toBe(true);
  });
  for (const hero of Object.keys(HEROES) as HeroId[])
    it(`all 24 rooms beatable without upgrades: ${hero}`, () => {
      let s = freshSave();
      s.hero = hero;
      for (const e of ENCOUNTERS) {
        expect(isUnlocked(e.id, s.completed)).toBe(true);
        let b = startCombat(s, e.id);
        for (let turn = 0; turn < 25 && b.status === "active"; turn++)
          b = resolveTurn(b, [
            { kind: "attack" },
            { kind: "attack" },
            { kind: "attack" },
          ]).state;
        expect(b.status, `${hero} ${e.id}`).toBe("won");
        s = rewardVictory(s, b);
      }
      expect(s.completed).toHaveLength(24);
    });
  it("caps upgrades and rejects insufficient gold", () => {
    const s = freshSave();
    expect(purchase(s, "attack").error).toBeTruthy();
    s.gold = 10000;
    for (let i = 0; i < 5; i++) Object.assign(s, purchase(s, "attack").save);
    expect(s.upgrades.attack).toBe(5);
    expect(purchase(s, "attack").error).toBeTruthy();
  });
});
describe("save import safety", () => {
  it("round trips complete and active saves", () => {
    const s = freshSave();
    expect(validateSave(s)).toBe(true);
    s.hero = "knight";
    s.battle = startCombat(s, "1-1");
    expect(validateSave(JSON.parse(JSON.stringify(s)))).toBe(true);
  });
  it("rejects corrupt and incompatible data", () => {
    for (const patch of [
      { version: 2 },
      { gold: -1 },
      { potions: NaN },
      { hero: "constructor" },
      { completed: ["fake"] },
      { drafts: { "1-1": 3 } },
      { settings: { sound: true } },
      { battle: { status: "active" } },
    ])
      expect(
        validateSave({ ...freshSave(), ...patch }),
        JSON.stringify(patch),
      ).toBe(false);
  });
});
