import { beforeAll, describe, expect, it } from "vitest";
import { loadPyodide, type PyodideInterface } from "pyodide";
import { resolve } from "node:path";
import { PYTHON_VALIDATOR } from "../src/runtime/validator";
import { resolveTurn, startCombat } from "../src/engine";
import { freshSave } from "../src/storage";
import type { Concept, RunResult } from "../src/types";

let py: PyodideInterface;
beforeAll(async () => {
  py = await loadPyodide({ indexURL: resolve("public/python") + "/" });
}, 60000);

async function run(code: string, concept: Concept) {
  py.globals.set(
    "_payload",
    JSON.stringify({
      code,
      contract: { concepts: [concept] },
      context: {
        hp: 100,
        mp: 16,
        enemy_hp: 80,
        enemy_intent: "heavy",
        potions: 3,
      },
    }),
  );
  return JSON.parse(await py.runPythonAsync(PYTHON_VALIDATOR)) as RunResult;
}

describe("actual lesson evidence", () => {
  it.each([
    ["if", "if False:\n    pass\nattack()"],
    ["if", 'if True:\n    print("ready")\nattack()'],
    [
      "if",
      "def choose():\n    attack()\n    return True\nif choose():\n    pass",
    ],
    ["if", "if True:\n    def plan():\n        attack()\nplan()"],
    [
      "if",
      "def values():\n    if True:\n        yield 1\nfor value in values():\n    attack()",
    ],
    ["if", "def choose():\n    if True:\n        return attack\nchoose()()"],
    [
      "method",
      "class Hero:\n    def strike():\n        attack()\nHero.strike()",
    ],
    [
      "method",
      "class Hero:\n    def strike(self):\n        attack()\nhero = Hero()\nHero.strike(hero)",
    ],
    [
      "method",
      "class Hero:\n    def strike(self):\n        attack()\nhero = Hero()\nmove = hero.strike\nattack()",
    ],
    ["list", "bag = [12]\nprint(str(bag)[0])\nattack()"],
    ["tuple", "point = (12,)\nprint(str(point)[0])\nattack()"],
    ["set", "runes = {1, 2}\nprint(len(str(runes)))\nattack()"],
    [
      "list",
      "def len(value): return 2\nbag = [1, 2]\nprint(len(bag))\nattack()",
    ],
    [
      "list",
      "for bag in ([1], 'xy'):\n    try:\n        print(bag[1])\n    except Exception:\n        pass\nattack()",
    ],
  ] as [Concept, string][])(
    "rejects unrelated or unexecuted %s evidence without committing combat: %s",
    async (concept, code) => {
      const save = freshSave();
      save.hero = "wizard";
      const battle = startCombat(save, "1-1");
      const checkpoint = structuredClone(battle);
      const result = await run(code, concept);
      expect(result.ok).toBe(false);
      expect(result.actions).toEqual([]);
      expect(result.diagnostic?.message).toContain(
        `ยังไม่พบการใช้แนวคิด ${concept}`,
      );
      const resolution = resolveTurn(battle, result.actions);
      expect(resolution.error).toBeTruthy();
      expect(resolution.state).toBe(battle);
      expect(battle).toEqual(checkpoint);
    },
  );

  it.each([
    ["if", "if hp > 0:\n    attack()", []],
    ["if", "if hp < 0:\n    defend()\nelse:\n    attack()", []],
    [
      "if",
      "move = attack\ndef plan():\n    move()\nif hp < 0:\n    defend()\nelif hp > 0:\n    plan()",
      [],
    ],
    ["if", "def plan():\n    if hp > 0:\n        return attack()\nplan()", []],
    [
      "if",
      "for turn in range(1):\n    if hp > 0:\n        attack()\n        break",
      [],
    ],
    [
      "if",
      'try:\n    if hp > 0:\n        raise ValueError("retry")\nexcept ValueError:\n    if hp == 100:\n        attack()',
      [],
    ],
    [
      "method",
      "class Hero:\n    def strike(self): attack()\nhero = Hero()\nhero.strike()",
      [],
    ],
    [
      "method",
      "class Hero:\n    def strike(self): attack()\nclass Explorer(Hero): pass\nhero = Explorer()\nmove = hero.strike\ndef plan(command): command()\nplan(move)",
      [],
    ],
    [
      "list",
      'def read_first(bag):\n    print(bag[0])\nread_first(["sword", "shield"])\nattack()',
      ["sword"],
    ],
    [
      "list",
      "bag = [1, 2]\ncount = len\nprint(count(*[bag]))\nattack()",
      ["2"],
    ],
    ["tuple", "point = (2, 3)\nprint(point[-1])\nattack()", ["3"]],
    [
      "set",
      "count = len\ndef size(values): return count(values)\nprint(size({1, 1, 2}))\nattack()",
      ["2"],
    ],
    [
      "list",
      "class Pack(list): pass\nbag = Pack([1, 2, 3])\nprint(bag[::-1])\nattack()",
      ["[3, 2, 1]"],
    ],
  ] as [Concept, string, string[]][])(
    "accepts actual %s use through branches, aliases, functions and subclasses: %s",
    async (concept, code, output) => {
      const result = await run(code, concept);
      expect(result.ok, result.diagnostic?.message).toBe(true);
      expect(result.stdout).toEqual(output);
      expect(result.actions).toEqual([{ kind: "attack" }]);
    },
  );

  it("preserves slicing, evaluation order and native descriptor behavior", async () => {
    const code = `order = []
def item(label, value):
    order.append(label)
    return value
class Grid:
    def __getitem__(self, key):
        print(key)
        return 7
grid = Grid()
print(item("receiver", grid)[item("start", 1):item("stop", 4):item("step", 2), item("column", 3)])
print(order)
attack()`;
    const result = await run(code, "print");
    expect(result.ok, result.diagnostic?.message).toBe(true);
    expect(result.stdout).toEqual([
      "(slice(1, 4, 2), 3)",
      "7",
      "['receiver', 'start', 'stop', 'step', 'column']",
    ]);
    expect(result.actions).toEqual([{ kind: "attack" }]);
  });

  it("does not invoke player attribute hooks while examining bound method evidence", async () => {
    const result = await run(
      `class Hero:
    def __getattribute__(self, name):
        attack()
        return str
hero = Hero()
print(hero.name)
attack()`,
      "print",
    );
    expect(result.ok, result.diagnostic?.message).toBe(true);
    expect(result.stdout).toEqual(["<class 'str'>"]);
    expect(result.actions).toEqual([{ kind: "attack" }, { kind: "attack" }]);
  });

  it("protects the branch evidence marker from learner bindings", async () => {
    for (const binding of [
      "def _runecode_branches(): pass",
      "class _runecode_branches: pass",
      "def plan(_runecode_branches): pass",
      "match 3:\n    case _runecode_branches: pass",
    ]) {
      const result = await run(`${binding}\nattack()`, "if");
      expect(result.ok).toBe(false);
      expect(result.actions).toEqual([]);
      expect(result.diagnostic?.message).toContain("ชื่อนี้สงวนไว้");
    }
  });
});
