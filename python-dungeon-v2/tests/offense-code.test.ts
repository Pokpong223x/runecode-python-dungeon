import { describe, expect, it } from "vitest";
import { inspectOffense, offenseChanges } from "../src/ui/offenseCode";
import type { OffensiveAction } from "../src/types";

function switched(source: string, mode: OffensiveAction) {
  const result = offenseChanges(source, mode);
  expect(result.unsafe).toBe(false);
  return result.changes.reduceRight(
    (code, c) => code.slice(0, c.from) + c.insert + code.slice(c.to),
    source,
  );
}
describe("offensive command changes", () => {
  it("switches nested commands and aliases without changing comments, strings, methods or learning code", () => {
    const source =
      '# attack() stays\nlabel = "skill() / attack()"\nmove = attack\ndef combo():\n    attack()\nhero.attack()\nprint(f"{attack()}")\nmove()\ndefend()';
    const next = switched(source, "skill");
    expect(next).toBe(
      '# attack() stays\nlabel = "skill() / attack()"\nmove = skill\ndef combo():\n    skill()\nhero.attack()\nprint(f"{skill()}")\nmove()\ndefend()',
    );
    expect(switched(next, "attack")).toBe(source);
  });
  it("identifies both offense types, including references in exclusive Python branches", () => {
    const source = "if mp >= 4:\n    skill()\nelse:\n    attack()";
    expect(inspectOffense(source).mode).toBe("mixed");
    expect(switched(source, "attack")).toBe(
      "if mp >= 4:\n    attack()\nelse:\n    attack()",
    );
    expect(inspectOffense('print("skill()")\ndefend()').mode).toBe("none");
  });
  it.each([
    "def attack(): pass\nattack()",
    "attack = 2\nprint(attack)",
    "x = attack = 2",
    "attack += 1",
    "[skill for skill in [attack]]",
    'try: int("rune")\nexcept ValueError as attack: print(attack)',
    "(skill := 2)\nprint(skill)",
    "def plan(skill): return skill\nattack()",
    "for attack in range(2): print(attack)",
    "if True:\nattack()",
    "print(",
  ])(
    "refuses automatic edits of incomplete Python or learner-owned names: %s",
    (source) => {
      expect(offenseChanges(source, "skill").unsafe).toBe(true);
    },
  );
  it("does not rewrite Python keyword labels or similarly named identifiers", () => {
    const source = "counterattack = 1\nplan(attack=counterattack)\nattack()";
    expect(switched(source, "skill")).toBe(
      "counterattack = 1\nplan(attack=counterattack)\nskill()",
    );
  });
});
