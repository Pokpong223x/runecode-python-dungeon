import { beforeAll, describe, expect, it } from "vitest";
import { loadPyodide, type PyodideInterface } from "pyodide";
import { resolve } from "node:path";
import { ENCOUNTERS, HEROES } from "../src/content";
import { actionAP, resolveTurn, startCombat } from "../src/engine";
import { PYTHON_VALIDATOR } from "../src/runtime/validator";
import { HERO_SKILLS, skillCommand } from "../src/skills";
import { freshSave } from "../src/storage";
import {
  SOURCE_CHALLENGES,
  SOURCE_CHALLENGES_EN,
} from "../src/sourceCurriculum";
import { offenseChanges } from "../src/ui/offenseCode";
import type { CombatState, HeroId, RunResult, SkillId } from "../src/types";

// Independent answer fixtures: do not derive expected data from lesson definitions.
const exercises = [
  ["Moon Gate", 1, 'print("Moon Gate")\nattack(1)'],
  ["Light", 2, '# Light the path.\nprint("Light")\nattack(2)'],
  ["three print()", 1, "print(3)\nprint(2)\nprint(1)\nattack(1)"],
  ["bolts = 3", 3, "bolts = 3\nattack(bolts)"],
  ["Print label", 2, 'label = "Moon"\nprint(label)\nattack(2)'],
  ["stored - spent", 3, "stored = 8\nspent = 5\nattack(stored - spent)"],
  ["supplies[2]", 2, "supplies = [4, 7, 2]\nattack(supplies[2])"],
  ["bearings[2]", 3, "bearings = (8, 5, 3)\nattack(bearings[2])"],
  ["signals", 2, 'signals = {"sun", "moon"}\nattack(len(signals))'],
  ["fuel == 0", 1, "fuel = 0\nif fuel == 0:\n    attack(1)"],
  ["range(2)", 3, "for step in range(2):\n    print(step)\nattack(3)"],
  ["lock = 2", 2, "lock = 2\nwhile lock > 0:\n    lock -= 1\nattack(2)"],
  ["returns 3", 3, "def spark():\n    return 3\nattack(spark())"],
  [
    "boost(number)",
    2,
    "def boost(number):\n    return number + 1\nattack(boost(1))",
  ],
  ["math.floor(2.9)", 2, "import math\nattack(math.floor(2.9))"],
  [
    "power = 3",
    3,
    "class Lantern:\n    power = 3\nlantern = Lantern()\nattack(lantern.power)",
  ],
  [
    "release(self)",
    2,
    "class Spring:\n    def release(self):\n        return 2\nspring = Spring()\nattack(spring.release())",
  ],
  [
    "ZeroDivisionError",
    2,
    "try:\n    6 / 0\nexcept ZeroDivisionError:\n    attack(2)",
  ],
] as const;

const rooms = ENCOUNTERS.filter((room) => !room.boss);
let py: PyodideInterface;
beforeAll(async () => {
  py = await loadPyodide({ indexURL: resolve("public/python") + "/" });
}, 60000);

function battleFor(index: number, hero: HeroId = "wizard") {
  const save = freshSave();
  save.hero = hero;
  return startCombat(save, rooms[index].id);
}

async function run(index: number, code: string, battle = battleFor(index)) {
  py.globals.set(
    "_payload",
    JSON.stringify({
      code,
      contract: rooms[index].contract,
      context: {
        hp: battle.hp,
        mp: battle.mp,
        enemy_hp: battle.enemyHp,
        enemy_intent: battle.intent.kind,
        potions: battle.potions,
      },
    }),
  );
  return JSON.parse(await py.runPythonAsync(PYTHON_VALIDATOR)) as RunResult;
}

function selectOffense(code: string, command: string) {
  const selection = offenseChanges(
    code,
    command === "attack" ? "attack" : "skill",
    command === "attack" || command === "skill"
      ? "class"
      : (command as SkillId),
  );
  for (const change of [...selection.changes].reverse()) {
    code = code.slice(0, change.from) + change.insert + code.slice(change.to);
  }
  return code;
}

describe("all 18 new exercises fit RuneCode combat", () => {
  it("binds all new prompts and stable exercise IDs in order", () => {
    expect(rooms).toHaveLength(18);
    for (const [index, [prompt]] of exercises.entries()) {
      expect(SOURCE_CHALLENGES.flat()[index].prompt).toContain(prompt);
      expect(rooms[index].prompt).toBe(
        SOURCE_CHALLENGES_EN.flat()[index].prompt,
      );
      expect(rooms[index].prompt).not.toMatch(/[\u0e00-\u0e7f]/);
      expect(rooms[index].contract.sourceExercise).toBe(index + 1);
    }
    expect(ENCOUNTERS.filter((room) => room.boss)).toHaveLength(6);
    for (const room of ENCOUNTERS.filter((room) => room.boss)) {
      expect(room.contract.sourceExercise).toBeUndefined();
    }
  });

  it.each(
    exercises.map((exercise, index) => ({
      index,
      number: index + 1,
      exercise,
    })),
  )(
    "source exercise $number accepts its exact answer and every hero's skill selection",
    async ({ index, exercise: [, power, answer] }) => {
      for (const hero of Object.keys(HEROES) as HeroId[]) {
        const commands = [
          "attack",
          ...HERO_SKILLS[hero].map((skill) => skillCommand(skill.id)),
        ];
        for (const command of commands) {
          const battle = { ...battleFor(index, hero), enemyHp: 1, potions: 0 };
          const checkpoint = structuredClone(battle);
          const code =
            command === "attack" ? answer : selectOffense(answer, command);
          const result = await run(index, code, battle);
          expect(
            result.ok,
            `${rooms[index].id} ${hero} ${command}: ${result.diagnostic?.message}`,
          ).toBe(true);
          expect(result.actions).toHaveLength(1);
          expect(result.actions[0].power).toBe(power);
          expect(result.actions[0].kind).toBe(
            command === "attack" ? "attack" : "skill",
          );
          expect(
            result.actions.reduce(
              (total, action) => total + actionAP(action.kind),
              0,
            ),
          ).toBe(command === "attack" ? 1 : 2);
          expect(result.trace).toHaveLength(1);
          const resolution = resolveTurn(battle, result.actions);
          expect(resolution.error).toBeUndefined();
          expect(resolution.state.status).toBe("won");
          expect(battle).toEqual(checkpoint);
        }
      }
    },
    15000,
  );

  it.each(Object.keys(HEROES) as HeroId[])(
    "%s can answer all new exercises at zero MP without a potion or compulsory support action",
    async (hero) => {
      for (const [index, [, , answer]] of exercises.entries()) {
        const battle = { ...battleFor(index, hero), mp: 0, potions: 0 };
        const result = await run(index, answer, battle);
        expect(
          result.ok,
          `${rooms[index].id}: ${result.diagnostic?.message}`,
        ).toBe(true);
        expect(result.actions).toHaveLength(1);
        expect(resolveTurn(battle, result.actions).error).toBeUndefined();
      }
    },
  );

  it.each(
    exercises.map((exercise, index) => ({
      index,
      number: index + 1,
      exercise,
    })),
  )(
    "source exercise $number rejects a repeated offense even within 3 AP",
    async ({ index, exercise: [, power, answer] }) => {
      const battle = battleFor(index);
      const checkpoint = structuredClone(battle);
      const result = await run(index, `${answer}\nattack(${power})`, battle);
      expect(result.ok).toBe(false);
      expect(result.actions).toEqual([]);
      expect(resolveTurn(battle, result.actions).state).toBe(battle);
      expect(battle).toEqual(checkpoint);
    },
  );

  it("keeps support actions optional and checks resource rules after a valid lesson", async () => {
    const code = selectOffense(exercises[0][2], "skill") + "\ndefend()";
    const battle = battleFor(0);
    const result = await run(0, code, battle);
    expect(result.ok, result.diagnostic?.message).toBe(true);
    expect(
      result.actions.reduce(
        (total, action) => total + actionAP(action.kind),
        0,
      ),
    ).toBe(3);
    expect(resolveTurn(battle, result.actions).error).toBeUndefined();
    const poor = { ...battle, mp: 0 };
    const rejected = resolveTurn(poor, result.actions);
    expect(rejected.error).toBeTruthy();
    expect(rejected.state).toBe(poor);
    expect(rejected.events).toEqual([]);
    const excessive = await run(0, code + "\ndefend()", battle);
    expect(excessive.ok, excessive.diagnostic?.message).toBe(true);
    expect(resolveTurn(battle, excessive.actions).state).toBe(battle);
    expect(resolveTurn(battle, excessive.actions).error).toBeTruthy();
  });

  it("exercise fuel is a practice value and cannot rewrite actual combat HP", async () => {
    const battle: CombatState = { ...battleFor(9), hp: 47, enemyHp: 1 };
    const result = await run(9, exercises[9][2], battle);
    expect(result.ok, result.diagnostic?.message).toBe(true);
    const resolution = resolveTurn(battle, result.actions);
    expect(resolution.state.hp).toBe(47);
    expect(battle.hp).toBe(47);
  });

  it.each([0, 16])(
    "a real command alias can choose a single offensive route from %s MP without changing the exercise",
    async (mp) => {
      const battle = { ...battleFor(3), mp };
      const result = await run(
        3,
        "bolts = 1\nbolts = 3\nmove = skill if mp >= 4 else attack\nmove(bolts)",
        battle,
      );
      expect(result.ok, result.diagnostic?.message).toBe(true);
      expect(result.actions).toEqual([
        { kind: mp >= 4 ? "skill" : "attack", power: 3 },
      ]);
      expect(resolveTurn(battle, result.actions).error).toBeUndefined();
    },
  );

  it("the set exercise accepts constructing signals from a separate list with duplicated values", async () => {
    const battle = battleFor(8);
    const result = await run(
      8,
      'values = ["sun", "moon", "sun"]\nsignals = set(values)\nattack(len(signals))',
      battle,
    );
    expect(result.ok, result.diagnostic?.message).toBe(true);
    expect(result.actions).toEqual([{ kind: "attack", power: 2 }]);
    expect(resolveTurn(battle, result.actions).error).toBeUndefined();
  });
});

const invalid: Array<[number, string, string]> = [
  [1, "wrong output", 'print("Gate Moon")\nattack(1)'],
  [1, "missing explicit power", 'print("Moon Gate")\nattack()'],
  [1, "wrong power", 'print("Moon Gate")\nattack(2)'],
  [1, "print only after attack", 'attack(1)\nprint("Moon Gate")'],
  [2, "missing comment", 'print("Light")\nattack(2)'],
  [2, "wrong output", '# Path\nprint("Dark")\nattack(2)'],
  [3, "reversed countdown", "print(1)\nprint(2)\nprint(3)\nattack(1)"],
  [3, "one print instead of three", 'print("3\\n2\\n1")\nattack(1)'],
  [
    3,
    "last print never runs",
    "print(3)\nprint(2)\nif False:\n    print(1)\nattack(1)",
  ],
  [4, "unused variable", "bolts = 3\nprint(bolts)\nattack(3)"],
  [4, "wrong variable", "arrows = 3\nattack(arrows)"],
  [5, "unused label", 'label = "Moon"\nprint("Moon")\nattack(2)'],
  [5, "wrong label", 'label = "Sun"\nprint(label)\nattack(2)'],
  [
    5,
    "label printed after attack",
    'label = "Moon"\nprint("Moon")\nattack(2)\nprint(label)',
  ],
  [
    6,
    "wrong operands same result",
    "stored = 7\nspent = 4\nattack(stored - spent)",
  ],
  [
    6,
    "unrelated arithmetic",
    "stored = 8\nspent = 5\nprint(stored - spent)\nattack(3)",
  ],
  [
    7,
    "wrong list same selected value",
    "supplies = [1, 1, 2]\nattack(supplies[2])",
  ],
  [
    7,
    "index read only in output",
    "supplies = [4, 7, 2]\nprint(supplies[2])\nattack(2)",
  ],
  [7, "tuple instead of list", "supplies = (4, 7, 2)\nattack(supplies[2])"],
  [
    8,
    "wrong tuple same selected value",
    "bearings = (9, 6, 3)\nattack(bearings[2])",
  ],
  [
    8,
    "tuple read only in output",
    "bearings = (8, 5, 3)\nprint(bearings[2])\nattack(3)",
  ],
  [8, "list instead of tuple", "bearings = [8, 5, 3]\nattack(bearings[2])"],
  [
    9,
    "wrong set same length",
    'signals = {"sun", "star"}\nattack(len(signals))',
  ],
  [9, "list instead of set", 'signals = ["sun", "moon"]\nattack(len(signals))'],
  [
    9,
    "set count not used",
    'signals = {"sun", "moon"}\nprint(len(signals))\nattack(2)',
  ],
  [
    10,
    "attack outside if",
    "fuel = 0\nif fuel == 0:\n    print(fuel)\nattack(1)",
  ],
  [10, "irrelevant condition", "fuel = 0\nif True:\n    attack(1)"],
  [10, "wrong fuel value", "fuel = 1\nif fuel == 1:\n    attack(1)"],
  [11, "loop never runs", "for step in range(0):\n    print(step)\nattack(3)"],
  [
    11,
    "printing outside loop",
    "for step in range(2):\n    pass\nprint(0)\nprint(1)\nattack(3)",
  ],
  [11, "wrong range", "for step in range(1, 3):\n    print(step)\nattack(3)"],
  [
    11,
    "attack before loop",
    "attack(3)\nfor step in range(2):\n    print(step)",
  ],
  [
    11,
    "one loop attack then break",
    "for step in range(2):\n    print(step)\n    attack(3)\n    break",
  ],
  [
    12,
    "while never runs",
    "lock = 0\nwhile lock > 0:\n    lock -= 1\nattack(2)",
  ],
  [
    12,
    "wrong decrement",
    "lock = 2\nwhile lock > 0:\n    lock -= 2\nattack(2)",
  ],
  [
    12,
    "loop breaks before reaching zero",
    "lock = 2\nwhile lock > 0:\n    lock -= 1\n    break\nattack(2)",
  ],
  [
    12,
    "attack before loop",
    "lock = 2\nattack(2)\nwhile lock > 0:\n    lock -= 1",
  ],
  [
    12,
    "attack inside loop before break",
    "lock = 2\nwhile lock > 0:\n    lock -= 1\n    attack(2)\n    break",
  ],
  [
    13,
    "function unused",
    "def spark():\n    return 3\nprint(spark())\nattack(3)",
  ],
  [13, "wrong function name", "def glow():\n    return 3\nattack(glow())"],
  [
    14,
    "ignored parameter",
    "def boost(number):\n    return 2\nattack(boost(1))",
  ],
  [
    14,
    "wrong argument repaired by return",
    "def boost(number):\n    return number + 1\nattack(boost(0) + 1)",
  ],
  [
    14,
    "function result unused",
    "def boost(number):\n    return number + 1\nprint(boost(1))\nattack(2)",
  ],
  [
    14,
    "addition outside function",
    "def boost(number):\n    return 2\nnumber = 1\nattack(boost(1) + (number + 1) - 2)",
  ],
  [
    15,
    "wrong floor argument same result",
    "import math\nattack(math.floor(2.5))",
  ],
  [
    15,
    "floor not used as power",
    "import math\nprint(math.floor(2.9))\nattack(2)",
  ],
  [
    16,
    "class attribute without instance",
    "class Lantern:\n    power = 3\nattack(Lantern.power)",
  ],
  [
    16,
    "object attribute not used",
    "class Lantern:\n    power = 3\nlamp = Lantern()\nprint(lamp.power)\nattack(3)",
  ],
  [
    16,
    "wrong object value repaired by arithmetic",
    "class Lantern:\n    power = 2\nlamp = Lantern()\nattack(lamp.power + 1)",
  ],
  [
    17,
    "method result unused",
    "class Spring:\n    def release(self):\n        return 2\ncoil = Spring()\nprint(coil.release())\nattack(2)",
  ],
  [
    17,
    "wrong method name",
    "class Spring:\n    def unwind(self):\n        return 2\ncoil = Spring()\nattack(coil.unwind())",
  ],
  [
    17,
    "wrong return repaired by arithmetic",
    "class Spring:\n    def release(self):\n        return 1\ncoil = Spring()\nattack(coil.release() + 1)",
  ],
  [
    18,
    "different failing numerator",
    "try:\n    8 / 0\nexcept ZeroDivisionError:\n    attack(2)",
  ],
  [
    18,
    "attack outside handler",
    'try:\n    6 / 0\nexcept ZeroDivisionError:\n    print("caught")\nattack(2)',
  ],
  [
    18,
    "nested unrelated division",
    "try:\n    try:\n        6 / 0\n    except ZeroDivisionError:\n        pass\n    8 / 0\nexcept ZeroDivisionError:\n    attack(2)",
  ],

  [
    3,
    "one countdown output padded with blank calls",
    'print("3\\n2\\n1")\nprint("")\nprint("")\nattack(1)',
  ],
  [
    11,
    "second step printed outside prematurely stopped loop",
    "for step in range(2):\n    print(step)\n    break\nprint(1)\nattack(3)",
  ],
];

describe("source exercises reject answers that bypass their stated conditions", () => {
  it.each(invalid)("exercise %s: %s", async (exercise, _description, code) => {
    const battle = battleFor(exercise - 1);
    const checkpoint = structuredClone(battle);
    const result = await run(exercise - 1, code, battle);
    expect(result.ok, `${code}\n${JSON.stringify(result)}`).toBe(false);
    expect(result.actions).toEqual([]);
    expect(result.diagnostic?.message).toBeTruthy();
    expect(resolveTurn(battle, result.actions).state).toBe(battle);
    expect(battle).toEqual(checkpoint);
  });
});
