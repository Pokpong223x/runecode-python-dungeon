import { startCombat } from "../../src/engine";
import { freshSave } from "../../src/storage";
import type { HeroId } from "../../src/types";

/** Isolated presentation fixture: boss strategy permits support-only and combo plans.
 * The original small HP pool and initial counter are intentional test conditions,
 * not a claim that this checkpoint was reached through the campaign.
 */
export function mechanicsSave(hero: HeroId, reduced = false) {
  const save = freshSave();
  save.hero = hero;
  save.onboarding = true;
  save.completed = ["1-1", "1-2", "1-3"];
  save.settings.reducedMotion = reduced;
  const battle = { ...startCombat(save, "1-1"), encounterId: "1-4" };
  return { ...save, battle };
}

/** Satisfy the boss's comment concept without shifting execution-line assertions. */
export const mechanicsSource = (source: string) =>
  source.replace(/(\n|$)/, " # ทดสอบกลยุทธ์และการแสดงผล$1");
