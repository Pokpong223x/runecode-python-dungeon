import { describe, expect, it, vi } from "vitest";
import { cueForBeat } from "../src/audio/BattleAudio";
import { createBattleTimeline } from "../src/art/motion";
import { resolveTurn, startCombat } from "../src/engine";
import { freshSave } from "../src/storage";
import type { HeroId } from "../src/types";
import type Phaser from "phaser";

describe("combat audio uses the existing disposable timeline", () => {
  it("keeps anticipation silent and identifies the actual source at contact for all classes", () => {
    for (const hero of ["adventurer", "knight", "wizard"] as HeroId[]) {
      const save = freshSave();
      save.hero = hero;
      const battle = startCombat(save, "1-1");
      const { events } = resolveTurn(battle, [{ kind: "skill" }]);
      const attack = events[0],
        impact = events[1];
      expect(cueForBeat(attack, hero)).toBe(null);
      expect(cueForBeat(impact, hero, attack)).toBe(hero);
      const counter = events.find(
        (e) => e.target === "enemy" && e.animation === "attack",
      )!;
      const hurt = events.find(
        (e) => e.target === "hero" && e.animation === "hurt",
      )!;
      expect(cueForBeat(counter, hero)).toBe(null);
      expect(cueForBeat(hurt, hero, counter)).toBe("enemy");
    }
  });

  it("does not mistake a potion or a standalone poison tick for an offensive class skill", () => {
    const save = freshSave();
    save.hero = "wizard";
    const battle = {
      ...startCombat(save, "1-1"),
      hp: 40,
      poison: 2,
      intent: {
        kind: "charge" as const,
        label: "ร่าย",
        damage: 0,
        description: "เตรียม",
      },
    };
    const { events } = resolveTurn(battle, [{ kind: "heal" }]);
    expect(cueForBeat(events[0], "wizard")).toBe("heal");
    expect(cueForBeat(events[1], "wizard")).toBe("charge");
    expect(cueForBeat(events[2], "wizard")).toBe("hurt");
  });

  it("drops already scheduled callbacks when the view is disposed before contact", () => {
    const callbacks: Array<() => void> = [];
    const scene = {
      time: {
        delayedCall: (_delay: number, callback: () => void) =>
          callbacks.push(callback),
      },
    } as unknown as Phaser.Scene;
    const actor = {
      getData: () => "adventurer",
    } as unknown as Phaser.GameObjects.Container;
    const busy = vi.fn(),
      beat = vi.fn();
    const timeline = createBattleTimeline(
      scene,
      actor,
      actor,
      false,
      busy,
      beat,
    );
    const save = freshSave();
    save.hero = "adventurer";
    timeline.enqueue(
      resolveTurn(startCombat(save, "1-1"), [{ kind: "attack" }]).events,
    );
    expect(busy).toHaveBeenCalledWith(true);
    expect(callbacks.length).toBeGreaterThan(0);
    timeline.dispose();
    for (const callback of callbacks) callback();
    expect(beat).not.toHaveBeenCalled();
    expect(busy.mock.calls).toEqual([[true]]);
  });
});
