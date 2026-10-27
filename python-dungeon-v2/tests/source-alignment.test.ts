import { beforeAll, describe, expect, it } from "vitest";
import { loadPyodide, type PyodideInterface } from "pyodide";
import { resolve } from "node:path";
import { ENCOUNTERS } from "../src/content";
import { PYTHON_VALIDATOR } from "../src/runtime/validator";
import { resolveTurn, startCombat } from "../src/engine";
import { freshSave } from "../src/storage";
import type { RunResult } from "../src/types";

let py: PyodideInterface;
beforeAll(async () => {
  py = await loadPyodide({ indexURL: resolve("public/python") + "/" });
}, 60000);

async function run(exercise: number, code: string) {
  const room = ENCOUNTERS.find(
    (room) => room.contract.sourceExercise === exercise,
  )!;
  const save = freshSave();
  save.hero = "wizard";
  const battle = startCombat(save, room.id);
  py.globals.set(
    "_payload",
    JSON.stringify({
      code,
      contract: room.contract,
      context: {
        hp: battle.hp,
        mp: battle.mp,
        enemy_hp: battle.enemyHp,
        enemy_intent: battle.intent.kind,
        potions: battle.potions,
      },
    }),
  );
  return {
    battle,
    result: JSON.parse(await py.runPythonAsync(PYTHON_VALIDATOR)) as RunResult,
  };
}

const alternatives: Array<[number, string, string, number]> = [
  [1, "two print arguments", 'print("Moon", "Gate")\nattack(1)', 1],
  [1, "joined password", 'print("Moon" + " Gate")\nattack(1)', 1],
  [2, "inline comment", 'print("Light")  # Light the path\nattack(2)', 2],
  [3, "string countdown", 'print("3")\nprint("2")\nprint("1")\nattack(1)', 1],
  [
    3,
    "looped countdown",
    "for count in range(3, 0, -1):\n    print(count)\nattack(1)",
    1,
  ],
  [4, "stored variable alias", "bolts = 3\namount = bolts\nattack(amount)", 3],
  [
    4,
    "earlier assignment remains allowed",
    "bolts = 1\nbolts = 3\nattack(bolts)",
    3,
  ],
  [
    5,
    "copied label",
    'label = "Moon"\nmessage = label\nprint(message)\nattack(2)',
    2,
  ],
  [
    6,
    "stored subtraction",
    "stored = 8\nspent = 5\ndamage = stored - spent\nattack(damage)",
    3,
  ],
  [
    6,
    "copied operands",
    "stored = 8\nspent = 5\navailable = stored\nused = spent\nattack(available - used)",
    3,
  ],
  [
    7,
    "stored selected list element",
    "supplies = [4, 7, 2]\namount = supplies[2]\nattack(amount)",
    2,
  ],
  [
    8,
    "stored selected tuple element",
    "bearings = (8, 5, 3)\namount = bearings[2]\nattack(amount)",
    3,
  ],
  [
    9,
    "set constructor with duplicates",
    'signals = set(["sun", "moon", "sun"])\nattack(len(signals))',
    2,
  ],
  [
    9,
    "set literal with duplicate values",
    'signals = {"sun", "moon", "moon"}\namount = len(signals)\nattack(amount)',
    2,
  ],
  [10, "reversed equality", "fuel = 0\nif 0 == fuel:\n    attack(1)", 1],
  [
    10,
    "equivalent false-value check",
    "fuel = 0\nif not fuel:\n    attack(1)",
    1,
  ],
  [
    11,
    "explicit range start",
    "for number in range(0, 2):\n    print(number)\nattack(3)",
    3,
  ],
  [
    11,
    "string conversion in loop",
    "for step in range(2):\n    print(str(step))\nattack(3)",
    3,
  ],
  [
    12,
    "ordinary reassignment decrement",
    "lock = 2\nwhile lock > 0:\n    lock = lock - 1\nattack(2)",
    2,
  ],
  [
    12,
    "equivalent while condition",
    "lock = 2\nwhile lock:\n    lock -= 1\nattack(2)",
    2,
  ],
  [
    12,
    "named decrement",
    "lock = 2\ndecrement = 1\nwhile 0 < lock:\n    lock -= decrement\nattack(2)",
    2,
  ],
  [
    13,
    "stored function result",
    "def spark():\n    return 3\namount = spark()\nattack(amount)",
    3,
  ],
  [
    13,
    "earlier arithmetic return remains allowed",
    "def spark():\n    return 7 - 4\nattack(spark())",
    3,
  ],
  [
    14,
    "stored parameter result",
    "def boost(number):\n    return number + 1\namount = boost(1)\nattack(amount)",
    2,
  ],
  [
    14,
    "equivalent addition order",
    "def boost(number):\n    return 1 + number\nattack(boost(1))",
    2,
  ],
  [
    14,
    "named function argument",
    "def boost(number):\n    return number + 1\nattack(boost(number=1))",
    2,
  ],
  [
    14,
    "intermediate calculation",
    "def boost(number):\n    result = number + 1\n    return result\nattack(boost(1))",
    2,
  ],
  [
    15,
    "module alias and saved result",
    "import math as numbers\namount = numbers.floor(2.9)\nattack(amount)",
    2,
  ],
  [
    16,
    "stored object property",
    "class Lantern:\n    power = 3\nlamp = Lantern()\namount = lamp.power\nattack(amount)",
    3,
  ],
  [
    17,
    "stored method result",
    "class Spring:\n    def release(self):\n        return 2\ncoil = Spring()\namount = coil.release()\nattack(amount)",
    2,
  ],
  [
    17,
    "earlier arithmetic method remains allowed",
    "class Spring:\n    tension = 5\n    def release(self):\n        return self.tension - 3\ncoil = Spring()\nattack(coil.release())",
    2,
  ],
  [
    18,
    "named caught exception",
    "try:\n    6 / 0\nexcept ZeroDivisionError as error:\n    attack(2)",
    2,
  ],
  [
    18,
    "exception tuple",
    "try:\n    6 / 0\nexcept (ValueError, ZeroDivisionError):\n    attack(2)",
    2,
  ],

  [
    7,
    "copied collection alias",
    "supplies = [4, 7, 2]\nbag = supplies\nattack(bag[2])",
    2,
  ],
  [
    8,
    "copied tuple alias",
    "bearings = (8, 5, 3)\nposition = bearings\nattack(position[2])",
    3,
  ],
  [
    11,
    "copied loop value",
    "for step in range(2):\n    shown = step\n    print(shown)\nattack(3)",
    3,
  ],
  [
    12,
    "equivalent nonzero condition",
    "lock = 2\nwhile lock != 0:\n    lock -= 1\nattack(2)",
    2,
  ],
];

describe("source prompt alignment without hidden expression-placement rules", () => {
  it.each(alternatives)(
    "exercise %s accepts %s",
    async (exercise, _label, code, power) => {
      const { battle, result } = await run(exercise, code);
      expect(result.ok, result.diagnostic?.message).toBe(true);
      expect(result.actions).toEqual([{ kind: "attack", power }]);
      expect(resolveTurn(battle, result.actions).error).toBeUndefined();
    },
  );
});

const unrelated: Array<[number, string, string]> = [
  [
    4,
    "overwritten variable alias",
    "bolts = 3\namount = bolts\namount = 3\nattack(amount)",
  ],
  [
    6,
    "overwritten subtraction",
    "stored = 8\nspent = 5\ndamage = stored - spent\ndamage = 3\nattack(damage)",
  ],
  [
    6,
    "dead calculation",
    "stored = 8\nspent = 5\nif False:\n    damage = stored - spent\ndamage = 3\nattack(damage)",
  ],
  [
    6,
    "subtraction only after attack",
    "stored = 8\nspent = 5\nattack(3)\ndamage = stored - spent",
  ],
  [
    7,
    "overwritten selected list element",
    "supplies = [4, 7, 2]\namount = supplies[2]\namount = 2\nattack(amount)",
  ],
  [
    8,
    "overwritten selected tuple element",
    "bearings = (8, 5, 3)\namount = bearings[2]\namount = 3\nattack(amount)",
  ],
  [
    9,
    "overwritten set length",
    'signals = {"sun", "moon"}\namount = len(signals)\namount = 2\nattack(amount)',
  ],
  [
    11,
    "disconnected print values in loop",
    "for step in range(2):\n    pass\nprint(0)\nprint(1)\nattack(3)",
  ],
  [
    12,
    "manual zero after incomplete loop",
    "lock = 2\nwhile lock > 0:\n    lock -= 1\n    break\nlock = 0\nattack(2)",
  ],
  [
    13,
    "function called only after attack",
    "def spark():\n    return 3\nattack(3)\namount = spark()",
  ],
  [
    13,
    "wrong return repaired outside function",
    "def spark():\n    return 2\nattack(spark() + 1)",
  ],
  [
    14,
    "overwritten returned parameter calculation",
    "def boost(number):\n    result = number + 1\n    result = 2\n    return result\nattack(boost(1))",
  ],
  [
    14,
    "parameter calculation performed outside function",
    "def boost(number):\n    return 2\nnumber = 1\nattack(boost(1) + (number + 1) - 2)",
  ],
  [
    15,
    "math calculated only after attack",
    "import math\nattack(2)\namount = math.floor(2.9)",
  ],
  [
    15,
    "overwritten math result",
    "import math\namount = math.floor(2.9)\namount = 2\nattack(amount)",
  ],
  [
    16,
    "overwritten object attribute",
    "class Lantern:\n    power = 3\nlamp = Lantern()\namount = lamp.power\namount = 3\nattack(amount)",
  ],
  [
    16,
    "unrelated object of another class",
    "class Lantern:\n    power = 3\nclass Other:\n    power = 3\nlamp = Lantern()\nother = Other()\nprint(lamp.power)\nattack(other.power)",
  ],
  [
    17,
    "overwritten method result",
    "class Spring:\n    def release(self):\n        return 2\ncoil = Spring()\namount = coil.release()\namount = 2\nattack(amount)",
  ],
  [
    17,
    "unrelated method from another class",
    "class Spring:\n    def release(self):\n        return 2\nclass Other:\n    def release(self):\n        return 2\ncoil = Spring()\nother = Other()\nprint(coil.release())\nattack(other.release())",
  ],
  [
    18,
    "required division only after offense",
    "try:\n    8 / 0\nexcept ZeroDivisionError:\n    attack(2)\ntry:\n    6 / 0\nexcept ZeroDivisionError:\n    pass",
  ],
];

describe("intermediate values must retain the required calculation at the time of the action", () => {
  it.each(unrelated)(
    "exercise %s rejects %s",
    async (exercise, _label, code) => {
      const { battle, result } = await run(exercise, code);
      const checkpoint = structuredClone(battle);
      expect(result.ok, JSON.stringify(result)).toBe(false);
      expect(result.actions).toEqual([]);
      expect(result.diagnostic?.message).toBeTruthy();
      expect(resolveTurn(battle, result.actions).state).toBe(battle);
      expect(battle).toEqual(checkpoint);
    },
  );
});
