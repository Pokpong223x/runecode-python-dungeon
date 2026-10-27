import { describe, expect, it } from "vitest";
import {
  commitBattle,
  purchase,
  resolveTurn,
  rewardVictory,
  startCombat,
} from "../src/engine";
import { freshSave, validateSave } from "../src/storage";

function activeSave() {
  const save = freshSave();
  save.hero = "adventurer";
  save.gold = 100;
  save.battle = startCombat(save, "1-1");
  return save;
}

describe("inventory and imported checkpoints", () => {
  it.each([false, true])(
    "keeps reserves through a non-winning turn (defeat: %s)",
    (lost) => {
      const original = activeSave();
      original.battle!.hp = lost ? 1 : 60;
      const result = resolveTurn(original.battle!, [{ kind: "attack" }]);
      const bought = purchase(original, "potion").save;
      const committed = commitBattle(bought, result.state);
      expect(committed.potions).toBe(4);
      expect(committed.battle!.potions).toBe(3);
      expect(committed.battle!.status).toBe(lost ? "lost" : "active");
      expect(validateSave(committed)).toBe(true);
      expect(startCombat(committed, "1-1").potions).toBe(4);
    },
  );

  it("retains a potion bought for the next room when the active battle wins", () => {
    const original = activeSave();
    original.battle!.enemyHp = 1;
    original.battle!.hp -= 40;
    const bought = purchase(original, "potion").save;
    const won = resolveTurn(bought.battle!, [
      { kind: "heal" },
      { kind: "attack" },
    ]).state;
    const rewarded = rewardVictory(bought, won);
    expect(rewarded.potions).toBe(3); // 3 starting + 1 bought - 1 used
    expect(rewarded.battle!.potions).toBe(2);
    expect(rewardVictory(rewarded, won).potions).toBe(3);
    expect(startCombat(rewarded, "1-2").potions).toBe(3);
    expect(original.potions).toBe(3);
  });

  it.each([
    ["active hero at zero HP", { hp: 0 }],
    ["active enemy at zero HP", { enemyHp: 0 }],
    ["false victory", { status: "won" }],
    ["false defeat", { status: "lost" }],
    ["zero turn", { turn: 0 }],
    ["zero attack", { attack: 0 }],
    ["invalid encounter type", { encounterId: ["1-1"] }],
    ["invalid status type", { status: ["active"] }],
    ["unpersistable inventory", { potions: 100 }],
    ["more battle potions than inventory", { potions: 4 }],
  ])("rejects %s before replacing a save", (_name, patch) => {
    const save = activeSave();
    Object.assign(save.battle!, patch);
    expect(validateSave(save)).toBe(false);
  });

  it("rejects a battle without a selected hero", () => {
    const save = activeSave();
    save.hero = null;
    Object.assign(save.battle!, { hero: null });
    expect(validateSave(save)).toBe(false);
  });
});
