import { beforeAll, describe, expect, it } from "vitest";
import { loadPyodide, type PyodideInterface } from "pyodide";
import { resolve } from "node:path";
import { ENCOUNTERS } from "../src/content";
import { PYTHON_VALIDATOR } from "../src/runtime/validator";
import type { LessonContract, RunResult } from "../src/types";
import { HEROES } from "../src/content";
import { freshSave, validateSave } from "../src/storage";
import { LEARNING_EXAMPLES } from "../src/learningExamples";
import { startCombat, resolveTurn, rewardVictory } from "../src/engine";
import type { HeroId } from "../src/types";
import { traitMessages } from "../src/heroTraits";
let py: PyodideInterface;
beforeAll(async () => {
  py = await loadPyodide({ indexURL: resolve("public/python") + "/" });
}, 60000);
async function run(
  code: string,
  contract: LessonContract,
  context: Record<string, number | string> = {},
) {
  py.globals.set(
    "_payload",
    JSON.stringify({
      code,
      contract,
      context: {
        hp: 100,
        mp: 16,
        enemy_hp: 80,
        enemy_intent: "heavy",
        potions: 3,
        ...context,
      },
    }),
  );
  return JSON.parse(await py.runPythonAsync(PYTHON_VALIDATOR)) as RunResult;
}
describe("real Python curriculum", () => {
  it.each([
    {
      hero: "adventurer",
      source: "hit = attack\nfor i in range(3):\n    print(i)\n    hit()",
      damage: 43,
      mana: 10,
      bonuses: 2,
    },
    {
      hero: "knight",
      source: "def plan():\n    skill()\n    focus()\nplan()",
      damage: 21,
      mana: 11,
      bonuses: 1,
    },
    {
      hero: "wizard",
      source: "def prepare():\n    focus()\nprepare()\nskill()",
      damage: 41,
      mana: 9,
      bonuses: 1,
    },
  ] as const)(
    "$hero passive follows actual Python calls and retains trace lines",
    async ({ hero, source, damage, mana, bonuses }) => {
      const save = freshSave();
      save.hero = hero;
      const before = {
        ...startCombat(save, "1-1"),
        mp: 10,
        enemyHp: 200,
        maxEnemyHp: 200,
      };
      const result = await run(source, { concepts: [] }, { mp: before.mp });
      expect(result.ok, result.diagnostic?.message).toBe(true);
      const resolved = resolveTurn(before, result.actions);
      expect(resolved.error).toBeUndefined();
      expect(resolved.state.enemyHp).toBe(200 - damage);
      expect(resolved.state.mp).toBe(mana);
      expect(traitMessages(resolved.events)).toHaveLength(bonuses);
      for (const event of resolved.events.filter(
        (event) => event.actionIndex !== undefined,
      )) {
        expect(result.trace![event.actionIndex!].line).toBeGreaterThan(0);
      }
      expect(before.mp).toBe(10);
    },
  );

  it("isolates imported math attributes between runs even after a failed answer", async () => {
    const originalPi = py.runPython("__import__('math').pi");
    try {
      await run("import math\nmath.pi = 0\nattack()", { concepts: ["math"] });
      const next = await run(
        "import math\nprint(math.ceil(math.pi))\nattack()",
        {
          concepts: ["math"],
        },
      );
      expect(next.ok).toBe(true);
      expect(next.stdout).toEqual(["4"]);
    } finally {
      py.globals.set("_original_pi", originalPi);
      py.runPython("__import__('math').pi = _original_pi");
    }
  });
  it("honors Python print separators, end and their default None values", async () => {
    const result = await run(
      'print("Rune", end="")\nprint("Code", "!", sep=None, end=None)\nattack()',
      { concepts: ["print"] },
    );
    expect(result.ok, result.diagnostic?.message).toBe(true);
    expect(result.stdout).toEqual(["RuneCode !"]);
  });
  it("keeps print output and empty lines faithful across calls", async () => {
    const result = await run(
      'print("A", "B", sep="|", end=" ")\nprint("C", end="\\n\\n", flush=True)\nprint("D", end="!")\nattack()',
      { concepts: ["print"] },
    );
    expect(result.ok).toBe(true);
    expect(result.stdout).toEqual(["A|B C", "", "D!"]);
  });
  it("rejects excessive print output even when player code catches its exception", async () => {
    for (const source of [
      'print("x", end="!" * 9000)',
      'for n in range(129):\n        print("", end="")',
    ]) {
      const result = await run(
        `try:\n    ${source}\nexcept Exception:\n    pass\nattack()`,
        { concepts: [] },
      );
      expect(result.ok).toBe(false);
      expect(result.actions).toEqual([]);
      expect(result.diagnostic?.message).toContain("ผลพิมพ์มากเกินไป");
    }
  });
  it("bounds rendered output blocks without losing embedded newlines", async () => {
    const result = await run('print("x\\n" * 1000, end="")\nattack()', {
      concepts: ["print"],
    });
    expect(result.ok).toBe(true);
    expect(result.stdout).toHaveLength(128);
    expect(result.stdout.join("\n")).toBe("x\n".repeat(1000).slice(0, -1));
  });
  it("traces focus through a function alias and its caller loop for playback", async () => {
    const result = await run(
      'print("ตั้งสมาธิ")\nrestore = focus\ndef plan():\n    restore()\nfor turn in range(1):\n    plan()\nskill()',
      { concepts: ["function", "for"] },
      { mp: 1 },
    );
    expect(result.ok, result.diagnostic?.message).toBe(true);
    expect(result.actions).toEqual([{ kind: "focus" }, { kind: "skill" }]);
    expect(result.trace).toEqual([
      { kind: "focus", line: 4, loopLine: 5 },
      { kind: "skill", line: 7 },
    ]);
    const save = freshSave();
    save.hero = "wizard";
    expect(
      resolveTurn({ ...startCombat(save, "1-1"), mp: 1 }, result.actions).error,
    ).toBeUndefined();
    const repeated = await run("for turn in range(2):\n    focus()", {
      concepts: ["for"],
    });
    const rejected = resolveTurn(
      { ...startCombat(save, "1-1"), mp: 0 },
      repeated.actions,
    );
    expect(rejected.actionIndex).toBe(1);
    expect(repeated.trace?.[rejected.actionIndex!]?.line).toBe(2);
  });
  it.each([
    ["variable", 'power = "three"\nprint(power)\nattack()'],
    ["variable", "ready = True\nprint(ready)\nattack()"],
    ["arithmetic", 'print("Rune" + "Code")\nattack()'],
    ["list", "bag = [1, 2]\nprint(bag)\nprint((7, 8)[0])\nattack()"],
    ["tuple", "point = (1, 2)\nprint(point)\nprint([7, 8][0])\nattack()"],
    ["set", "runes = {1, 2}\nprint(runes)\nprint(len([7, 8]))\nattack()"],
    ["for", "for step in range(0):\n    attack()\nattack()"],
    ["while", "count = 0\nwhile count > 0:\n    attack()\nattack()"],
    [
      "exception",
      'try:\n    int(None)\nexcept TypeError:\n    print("รับมือแล้ว")\nattack()',
    ],
    [
      "exception",
      'class Pretend(TypeError):\n    def __getattribute__(self, name):\n        return ValueError\ntry:\n    raise Pretend()\nexcept Exception:\n    print("ไม่ใช่ ValueError")\nattack()',
    ],
  ])(
    "rejects evidence that contradicts the %s mission: %s",
    async (concept, code) => {
      const result = await run(code, {
        concepts: [concept as LessonContract["concepts"][number]],
      });
      expect(result.ok).toBe(false);
      expect(result.actions).toEqual([]);
      expect(result.diagnostic?.message).toContain(
        `ยังไม่พบการใช้แนวคิด ${concept}`,
      );
    },
  );

  it.each([
    ["variable", "power: float = 2.5\nprint(power)\nattack()"],
    ["arithmetic", "power = 7 / 2\nprint(power)\nattack()"],
    ["list", "bag = [1, 2]\nprint(len(bag))\nattack()"],
    ["tuple", "point = tuple([2, 3])\nprint(point[-1])\nattack()"],
    ["set", "runes = set([1, 1, 2])\nprint(len(runes))\nattack()"],
    ["for", "for step in [1, 2]:\n    attack()\ndefend()"],
    ["while", "while True:\n    attack()\n    break\ndefend()"],
    [
      "exception",
      'try:\n    int("rune")\nexcept Exception:\n    print("แปลงไม่ได้")\nskill()\ndefend()',
    ],
  ])(
    "accepts alternative syntax that really meets the %s mission: %s",
    async (concept, code) => {
      const result = await run(code, {
        concepts: [concept as LessonContract["concepts"][number]],
      });
      expect(result.ok, result.diagnostic?.message).toBe(true);
      expect(result.actions.length).toBeGreaterThan(0);
    },
  );

  it("keeps every mission playable with normal attacks at zero MP and no potions", async () => {
    for (const hero of Object.keys(HEROES) as HeroId[]) {
      const save = freshSave();
      save.hero = hero;
      for (const room of ENCOUNTERS) {
        const battle = { ...startCombat(save, room.id), mp: 0, potions: 0 };
        const result = await run(room.solutions[0], room.contract, {
          hp: battle.hp,
          mp: battle.mp,
          enemy_hp: battle.enemyHp,
          enemy_intent: battle.intent.kind,
          potions: battle.potions,
        });
        expect(
          result.ok,
          `${hero} ${room.id}: ${result.diagnostic?.message}`,
        ).toBe(true);
        expect(
          resolveTurn(battle, result.actions).error,
          `${hero} ${room.id}`,
        ).toBeUndefined();
        expect(
          result.actions.some(
            (action) => action.kind === "skill" || action.kind === "heal",
          ),
        ).toBe(false);
      }
    }
  }, 60000);

  it("records actual command lines and the calling loop across aliases and function frames", async () => {
    const source =
      'print("แผน")\nmove = stun\ndef plan():\n    move()\nfor i in range(2):\n    plan()\ndefend()';
    const result = await run(source, { concepts: ["print"] });
    expect(result.ok).toBe(true);
    expect(result.actions).toEqual([
      { kind: "skill", skill: "stun" },
      { kind: "skill", skill: "stun" },
      { kind: "defend" },
    ]);
    expect(result.trace).toEqual([
      { kind: "skill", skill: "stun", line: 4, loopLine: 5 },
      { kind: "skill", skill: "stun", line: 4, loopLine: 5 },
      { kind: "defend", line: 7 },
    ]);
  });
  it("bounds action evidence even when the learner catches the action limit", async () => {
    const result = await run(
      "for i in range(12):\n    try:\n        attack()\n    except ValueError:\n        pass",
      { concepts: ["for"] },
    );
    expect(result.ok).toBe(false);
    expect(result.actions).toEqual([]);
    expect(result.trace).toHaveLength(4);
    expect(result.traceLimited).toBe(true);
  });
  it.each(["pierce", "stun", "burst"])(
    "executes %s as a skill and gives its own argument diagnostic",
    async (name) => {
      const result = await run(`print("แผน")\n${name}()`, {
        concepts: ["print"],
      });
      expect(result.actions).toEqual([{ kind: "skill", skill: name }]);
      expect(result.trace).toEqual([{ kind: "skill", skill: name, line: 2 }]);
      const powered = await run(`print("แผน")\n${name}(2)`, {
        concepts: ["print"],
      });
      expect(powered.ok, powered.diagnostic?.message).toBe(true);
      expect(powered.actions).toEqual([
        { kind: "skill", skill: name, power: 2 },
      ]);
      const invalid = await run(`print("แผน")\n${name}(2, 3)`, {
        concepts: ["print"],
      });
      expect(invalid.ok).toBe(false);
      expect(invalid.diagnostic?.message).toContain(`${name}()`);
      expect(invalid.diagnostic?.line).toBe(2);
    },
  );
  it("allows conditional selection of one offense but rejects executed mixing through aliases", async () => {
    const save = freshSave();
    save.hero = "wizard";
    const battle = startCombat(save, "1-1");
    const chosen = await run(
      'print("เลือกตาม MP")\nif mp >= 4:\n    skill()\nelse:\n    attack()\ndefend()',
      { concepts: ["if"] },
    );
    expect(chosen.ok).toBe(true);
    expect(chosen.actions).toEqual([{ kind: "skill" }, { kind: "defend" }]);
    expect(resolveTurn(battle, chosen.actions).error).toBeUndefined();
    const mixed = await run(
      'print("แผน")\nfirst = attack\nsecond = skill\nfirst()\nsecond()',
      { concepts: ["print"] },
    );
    expect(mixed.ok).toBe(true);
    const rejected = resolveTurn(battle, mixed.actions);
    expect(rejected.error).toContain("อย่างใดอย่างหนึ่ง");
    expect(rejected.state).toBe(battle);
  });
  it.each(ENCOUNTERS)(
    "$id: the final hint teaches a similar example rather than the canonical combat solution",
    (room) => {
      expect(room.hints[2]).not.toContain(room.solutions[0]);
    },
  );
  it.each(Object.entries(LEARNING_EXAMPLES))(
    "%s: the neutral example runs as Python, predicts its output and emits no combat commands",
    async (concept, example) => {
      py.globals.set("_example_source", example.code);
      const sample = JSON.parse(
        await py.runPythonAsync(`
import contextlib, io, json
def _check_example(source):
    commands, stdout = [], io.StringIO()
    def record(*args, **kwargs): commands.append('unexpected')
    namespace = {name:record for name in ('attack','defend','skill','heal','focus')}
    with contextlib.redirect_stdout(stdout):
        exec(compile(source,'<learning-example>','exec'),namespace)
    return {'stdout':stdout.getvalue().splitlines(),'commands':commands}
json.dumps(_check_example(_example_source),ensure_ascii=False)
`),
      );
      expect(sample.stdout).toEqual(example.output);
      expect(sample.commands).toEqual([]);
      // The neutral if sample prints a decision rather than choosing a combat
      // action. Sequence now accepts the actual print order plus one action.
      const result = await run(`${example.code}\nattack()`, {
        concepts: [
          concept === "if"
            ? "print"
            : (concept as LessonContract["concepts"][number]),
        ],
      });
      expect(result.ok, result.diagnostic?.message).toBe(true);
      expect(result.stdout).toEqual(example.output);
      expect(result.actions).toEqual([{ kind: "attack" }]);
      if (concept === "if") {
        const transfer = await run(
          'weather = "ฝน"\nif weather == "ฝน":\n    attack()\nelse:\n    defend()',
          { concepts: ["if"] },
        );
        expect(transfer.ok, transfer.diagnostic?.message).toBe(true);
        expect(transfer.actions).toEqual([{ kind: "attack" }]);
      }
    },
  );
  it.each(["normal", "skill-first"] as const)(
    "plays all 24 encounters as every hero through real Python and simulation: %s",
    async (strategy) => {
      for (const hero of Object.keys(HEROES) as HeroId[]) {
        let save = freshSave();
        save.hero = hero;
        for (const room of ENCOUNTERS) {
          let battle = startCombat(save, room.id);
          for (let turn = 0; turn < 20 && battle.status === "active"; turn++) {
            py.globals.set(
              "_payload",
              JSON.stringify({
                code: room.solutions[
                  strategy === "skill-first" && battle.mp >= 4 ? 2 : 0
                ],
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
            const result = JSON.parse(
              await py.runPythonAsync(PYTHON_VALIDATOR),
            ) as RunResult;
            expect(
              result.ok,
              `${hero} ${room.id} ${result.diagnostic?.message}`,
            ).toBe(true);
            const resolution = resolveTurn(battle, result.actions);
            expect(resolution.error, `${hero} ${room.id}`).toBeUndefined();
            battle = resolution.state;
          }
          expect(battle.status, `${hero} ${room.id}`).toBe("won");
          save = rewardVictory(save, battle);
          expect(validateSave(save)).toBe(true);
        }
        expect(save.completed).toHaveLength(24);
      }
    },
    60000,
  );
  for (const room of ENCOUNTERS)
    it(`${room.id}: all three alternative solutions accepted`, async () => {
      for (const [index, code] of room.solutions.entries()) {
        for (const hero of Object.keys(HEROES) as HeroId[]) {
          const save = freshSave();
          save.hero = hero;
          const battle = startCombat(save, room.id);
          const r = await run(code, room.contract, {
            hp: battle.hp,
            mp: battle.mp,
            enemy_hp: battle.enemyHp,
            enemy_intent: battle.intent.kind,
            potions: battle.potions,
          });
          expect(r.ok, `${room.id}: ${hero}: ${r.diagnostic?.message}`).toBe(
            true,
          );
          expect(r.actions.length).toBeGreaterThan(0);
          if (index === 2) {
            expect(r.actions.filter((a) => a.kind === "skill")).toHaveLength(1);
            expect(r.actions.some((a) => a.kind === "attack")).toBe(false);
          }
          expect(
            resolveTurn(battle, r.actions).error,
            `${room.id}: ${hero} reference must obey combat rules`,
          ).toBeUndefined();
        }
      }
    }, 15000);
  it("rejects correct actions without required concept", async () => {
    for (const room of ENCOUNTERS) {
      const r = await run("attack()", room.contract);
      expect(r.ok, room.id).toBe(false);
    }
  });
  it("reports syntax and indentation with line numbers", async () => {
    for (const code of ["print(\nattack()", "if True:\nattack()"]) {
      const r = await run(code, { concepts: ["print"] });
      expect(r.ok).toBe(false);
      expect(r.diagnostic?.line).toBeGreaterThan(0);
    }
  });
  it("explains command arguments in Thai without leaking adapter implementation names", async () => {
    for (const name of ["defend", "heal", "focus"]) {
      for (const args of ["1", "amount=2"]) {
        const result = await run(`print("เรียนรู้")\n${name}(${args})`, {
          concepts: ["print"],
        });
        expect(result.ok).toBe(false);
        expect(result.actions).toEqual([]);
        expect(result.diagnostic?.kind).toBe("TypeError");
        expect(result.diagnostic?.line).toBe(2);
        expect(result.diagnostic?.message).toContain(
          `${name}() ไม่รับค่าในวงเล็บ`,
        );
        expect(result.diagnostic?.message).not.toMatch(
          /_evaluate|lambda|locals/,
        );
      }
    }
  });
  it.each(["attack", "skill", "pierce", "stun", "burst"])(
    "%s rejects invalid powers and arity without leaking adapter internals",
    async (name) => {
      for (const args of ["0", "4", "True", "1.5", '"2"', "1, 2", "amount=2"]) {
        const result = await run(`print("เรียนรู้")\n${name}(${args})`, {
          concepts: ["print"],
        });
        expect(result.ok, `${name}(${args})`).toBe(false);
        expect(result.actions).toEqual([]);
        expect(result.diagnostic?.line).toBe(2);
        expect(result.diagnostic?.message).toContain(`${name}(`);
        expect(result.diagnostic?.message).not.toMatch(
          /_evaluate|lambda|locals/,
        );
      }
    },
  );
  it("does not leak globals between runs", async () => {
    await run("secret = 7\nattack()", { concepts: ["variable"] });
    const r = await run("print(secret)\nattack()", { concepts: ["print"] });
    expect(r.ok).toBe(false);
    expect(r.diagnostic?.kind).toBe("NameError");
  });
  it("limits actions/output and denies runtime bridge access", async () => {
    for (const code of [
      "for i in range(4):\n    attack()",
      'print("x" * 9000)\nattack()',
      "import js\nattack()",
      "print(__builtins__)\nattack()",
    ])
      expect((await run(code, { concepts: ["print"] })).ok).toBe(false);
  });
  it("bounds blank-print count as well as text size without rejecting ordinary blank lines", async () => {
    const result = await run('for i in range(1000):\n    print("")\nattack()', {
      concepts: ["print"],
    });
    expect(result.ok).toBe(false);
    expect(result.actions).toEqual([]);
    expect(result.stdout.length).toBeLessThanOrEqual(128);
    expect(result.diagnostic?.message).toContain("ผลพิมพ์มากเกินไป");
    expect(result.diagnostic?.line).toBe(2);
    const normal = await run('print("")\nprint("พร้อม")\nattack()', {
      concepts: ["print"],
    });
    expect(normal.ok).toBe(true);
    expect(normal.stdout).toEqual(["", "พร้อม"]);
  });
  it("requires the lesson construct to execute", async () => {
    expect(
      (
        await run(
          "if False:\n    for i in range(1):\n        attack()\nattack()",
          { concepts: ["for"] },
        )
      ).ok,
    ).toBe(false);
  });
  it.each([
    ["function", "def plan(): plan()\nattack()"],
    ["parameter", "def plan(power): return plan(power)\nattack()"],
    ["math", "import math\ndef unused(): math.sqrt(4)\nattack()"],
    ["list", 'bag = ["ดาบ", "โล่"]\nif False: print(bag[0])\nattack()'],
    ["tuple", 'bag = ("ดาบ", "โล่")\nif False: print(bag[0])\nattack()'],
    ["set", 'bag = {"ดาบ", "โล่"}\nif False: print(len(bag))\nattack()'],
    ["variable", "power = 3\nif False: print(power)\nattack()"],
    ["string", 'name = "นักผจญภัย"\nprint("พร้อม" or name)\nattack()'],
    ["arithmetic", 'print("พร้อม" or 2 + 3)\nattack()'],
    ["math", "import math\nprint(True or math.sqrt(4))\nattack()"],
    ["function", "def plan(): pass\nplan = attack\nplan()"],
    [
      "parameter",
      "def plan(power):\n    if False: return power\nplan(2)\nattack()",
    ],
    [
      "parameter",
      "def plan(power):\n    def inner(): return power\n    inner()\nplan(2)\nattack()",
    ],
    ["method", "class Hero:\n    def strike(self): self.strike()\nattack()"],
    [
      "method",
      "class Hero:\n    def __init__(self): self.power = 3\nhero = Hero()\nattack()",
    ],
    [
      "class",
      "class Hero: power = 3\nprint(Hero.power)\nHero = attack\nHero()",
    ],
  ])(
    "rejects %s when its apparent evidence never executes: %s",
    async (concept, code) => {
      const result = await run(code, {
        concepts: [concept as LessonContract["concepts"][number]],
      });
      expect(result.ok).toBe(false);
      expect(result.actions).toEqual([]);
      expect(result.diagnostic?.message).toContain("ยังไม่พบการใช้แนวคิด");
    },
  );
  it("accepts real one-line constructs and function aliases", async () => {
    for (const [code, concepts] of [
      ["def plan(): attack()\nplan()", ["function"]],
      [
        "def power(amount): return amount * 2\nprint(power(3))\nattack()",
        ["parameter", "arithmetic", "print"],
      ],
      ["def plan(): attack()\nmove = plan\nmove()", ["function"]],
      [
        'bag = ["ดาบ", "โล่"]\nif True: print(bag[0]); attack()',
        ["list", "if", "print"],
      ],
      [
        "import math as numbers\nprint(numbers.sqrt(4))\nnumbers = 0\nattack()",
        ["math", "print"],
      ],
      ["try: int('ผิด')\nexcept ValueError: attack()", ["exception"]],
      [
        "class Hero: power = 3\nExplorer = Hero\nhero = Explorer()\nprint(hero.power)\nattack()",
        ["class", "print"],
      ],
      [
        "class Hero:\n    def strike(self): attack()\nhero = Hero()\nmove = hero.strike\nmove()",
        ["method"],
      ],
    ] as [string, LessonContract["concepts"]][]) {
      expect((await run(code, { concepts })).ok, code).toBe(true);
    }
  });
  it("preserves evaluation order, short circuits, unpacking and comprehension scopes", async () => {
    const result = await run(
      `order = []
def item(label, value):
    order.append(label)
    return value
def join(first, second, label):
    return first + second + label
values = [item(str(i), i) for i in range(2)]
print(join(*[item("a", "A"), item("b", "B")], **{"label": item("c", "C")}))
print(False and item("never", 9))
print((total := sum(values)) + 3)
print(order)
attack()`,
      { concepts: ["function", "parameter", "arithmetic", "print"] },
    );
    expect(result.ok, result.diagnostic?.message).toBe(true);
    expect(result.stdout).toEqual([
      "ABC",
      "False",
      "4",
      "['0', '1', 'a', 'b', 'c']",
    ]);
    expect(result.actions).toEqual([{ kind: "attack" }]);
  });
  it("accepts docstrings and ordinary constructors and keeps an error's original player line", async () => {
    const result = await run(
      `class Hero:
    """คู่หู"""
    def __init__(self, power):
        self.power = power
    def strike(self):
        """โจมตี"""
        attack()
hero = Hero(3)
hero.strike()
print("พร้อม")`,
      { concepts: ["class", "method", "print"] },
    );
    expect(result.ok, result.diagnostic?.message).toBe(true);
    const failure = await run(
      "def plan():\n    return 1 / 0\nplan()\nattack()",
      {
        concepts: ["function"],
      },
    );
    expect(failure.diagnostic?.kind).toBe("ZeroDivisionError");
    expect(failure.diagnostic?.line).toBe(2);
    expect(failure.actions).toEqual([]);
  });
  it("protects execution markers from every supported binding form", async () => {
    for (const source of [
      "def _runecode_mark(): pass",
      "class _runecode_mark: pass",
      "def plan(_runecode_mark): pass",
      "import math as _runecode_mark",
      "try: int('x')\nexcept ValueError as _runecode_mark: pass",
      "match 3:\n    case _runecode_mark: pass",
      "match {}:\n    case {**_runecode_mark}: pass",
      "def plan[_runecode_mark](): pass",
    ]) {
      const result = await run(`${source}\nattack()`, {
        concepts: ["function"],
      });
      expect(result.ok, source).toBe(false);
      expect(result.diagnostic?.kind, source).toBe("ValueError");
      expect(result.diagnostic?.message, source).toContain("ชื่อนี้สงวนไว้");
      expect(result.actions).toEqual([]);
    }
  });
  it.each([
    ["string", 'name = "Rune".upper()\nprint(name)\nattack()'],
    ["string", 'name = "นัก" + "โค้ด"\nprint(name)\nattack()'],
    ["string", 'name = f"Rune{2}"\nprint(name)\nattack()'],
    ["string", 'name = " ".join(["Rune", "Code"])\nprint(name)\nattack()'],
    ["string", 'name: str = "Rune"\nprint(name)\nattack()'],
    ["string", "name = str(42)\nprint(name)\nattack()"],
    ["list", 'bag = list(("ดาบ", "โล่"))\nprint(bag[0])\nattack()'],
    ["list", "bag = [n * 2 for n in range(2)]\nprint(bag[1])\nattack()"],
    ["list", "bag = [n for n in range(0)]\nprint(len(bag))\nattack()"],
    ["list", "bag: list = list(range(2))\nprint(bag[0])\nattack()"],
    ["list", 'title, bag = ("Rune", list(range(2)))\nprint(bag[1])\nattack()'],
    ["tuple", "point = tuple([1, 2])\nprint(point[0])\nattack()"],
    [
      "tuple",
      "point = tuple(n + 1 for n in range(2))\nprint(point[1])\nattack()",
    ],
    ["tuple", "point = 2, 3\nprint(point[-1])\nattack()"],
    ["set", "runes = set([1, 1, 2])\nprint(len(runes))\nattack()"],
    ["set", "runes = {n // 2 for n in range(4)}\nprint(len(runes))\nattack()"],
    ["set", "runes = set()\nprint(len(runes))\nattack()"],
    [
      "string",
      'class Title(str): pass\nname = Title("Rune")\nprint(name)\nattack()',
    ],
    [
      "list",
      "class Pack(list): pass\nbag = Pack([1, 2])\nprint(bag[0])\nattack()",
    ],
  ])(
    "accepts actual %s values independently of their creation syntax: %s",
    async (concept, code) => {
      const result = await run(code, {
        concepts: [concept as LessonContract["concepts"][number]],
      });
      expect(result.ok, result.diagnostic?.message).toBe(true);
      expect(result.actions).toEqual([{ kind: "attack" }]);
      expect(result.stdout).toHaveLength(1);
    },
  );
  it.each([
    ["string", 'name = "Rune"\nname = 99\nprint(name)\nattack()'],
    ["string", "name = str(42)\nif False: print(name)\nattack()"],
    [
      "string",
      'def str(value): return 99\nname = str("Rune")\nprint(name)\nattack()',
    ],
    [
      "list",
      "def list(values): return tuple(values)\nbag = list((1, 2))\nprint(bag[0])\nattack()",
    ],
    [
      "tuple",
      "def tuple(values): return list(values)\npoint = tuple((1, 2))\nprint(point[0])\nattack()",
    ],
    [
      "set",
      "def set(values): return list(values)\nrunes = set([1, 1, 2])\nprint(len(runes))\nattack()",
    ],
    ["list", 'bag = [1, 2]\nbag = "xy"\nprint(bag[0])\nattack()'],
    ["tuple", "point = (1, 2)\npoint = [3, 4]\nprint(point[0])\nattack()"],
    ["set", 'runes = {1, 2}\nrunes = {"x": 1}\nprint(len(runes))\nattack()'],
    ["variable", "hp: int\nprint(hp)\nattack()"],
  ])(
    "rejects %s evidence when its actual value or assignment is wrong: %s",
    async (concept, code) => {
      const result = await run(code, {
        concepts: [concept as LessonContract["concepts"][number]],
      });
      expect(result.ok).toBe(false);
      expect(result.actions).toEqual([]);
      expect(result.diagnostic?.message).toContain("ยังไม่พบการใช้แนวคิด");
    },
  );
  it("observes value types without invoking user attribute hooks or changing side effects", async () => {
    const result = await run(
      `class Probe:
    def __getattribute__(self, name):
        attack()
        return str
probe = Probe()
other = probe
print("พร้อม")
attack()`,
      { concepts: ["print"] },
    );
    expect(result.ok, result.diagnostic?.message).toBe(true);
    expect(result.stdout).toEqual(["พร้อม"]);
    expect(result.actions).toEqual([{ kind: "attack" }]);
  });
  it.each([
    ["print", "print()"],
    ["sequence", "อย่างน้อยสอง"],
    ["comment", "#"],
    ["variable", "กำหนดค่า"],
    ["string", "ข้อความ"],
    ["arithmetic", "คำนวณ"],
    ["list", "อ่านสมาชิก"],
    ["tuple", "อ่านสมาชิก"],
    ["set", "len()"],
    ["if", "เงื่อนไข"],
    ["for", "วนซ้ำ"],
    ["while", "เงื่อนไขหยุด"],
    ["function", "เรียก"],
    ["parameter", "return"],
    ["math", "ฟังก์ชัน"],
    ["class", "object"],
    ["method", "เมธอด"],
    ["exception", "ข้อผิดพลาด"],
  ])(
    "gives a Thai next step for missing %s without inventing a source line",
    async (concept, nextStep) => {
      const result = await run("attack()", {
        concepts: [concept as LessonContract["concepts"][number]],
      });
      expect(result.ok).toBe(false);
      expect(result.actions).toEqual([]);
      expect(result.diagnostic?.message).toContain(
        `ยังไม่พบการใช้แนวคิด ${concept}`,
      );
      expect(result.diagnostic?.message).toContain(nextStep);
      expect(result.diagnostic?.line).toBeNull();
    },
  );
  it.each([
    [
      "function",
      'print("พร้อม")\ndef combo():\n    attack()\nattack()',
      2,
      "ยังไม่ถูกเรียก",
    ],
    [
      "parameter",
      "def power(amount):\n    if amount > 0:\n        return amount * 2\nprint(power(0))\nattack()",
      3,
      "return ยังไม่ทำงาน",
    ],
    [
      "parameter",
      "def plan(): return 2\nprint(plan())\nattack()",
      1,
      "พารามิเตอร์",
    ],
    [
      "math",
      'print("พร้อม")\nimport math as numbers\nattack()',
      2,
      "นำเข้า math แล้ว",
    ],
    [
      "method",
      'print("พร้อม")\nclass Hero:\n    def strike(self): attack()\nhero = Hero()\nattack()',
      3,
      "เมธอดยังไม่ถูกเรียก",
    ],
    [
      "list",
      'bag = [1, 2]\nbag = "xy"\nprint(bag[0])\nattack()',
      3,
      "ค่าที่อ่านต้องเป็น list",
    ],
    [
      "tuple",
      "point = (1, 2)\npoint = [3, 4]\nprint(point[0])\nattack()",
      3,
      "ค่าที่อ่านต้องเป็น tuple",
    ],
    [
      "set",
      'runes = {1, 2}\nrunes = {"x": 1}\nprint(len(runes))\nattack()',
      3,
      "ค่าที่อ่านต้องเป็น set",
    ],
    [
      "string",
      'name = "Rune"\nname = 99\nprint(name)\nattack()',
      3,
      "ตัวแปรที่ส่งให้ print() ต้องเก็บข้อความ",
    ],
  ])(
    "locates relevant executed evidence for %s at its original line",
    async (concept, code, line, explanation) => {
      const result = await run(code as string, {
        concepts: [concept as LessonContract["concepts"][number]],
      });
      expect(result.ok).toBe(false);
      expect(result.actions).toEqual([]);
      expect(result.diagnostic?.line).toBe(line);
      expect(result.diagnostic?.message).toContain(explanation);
    },
  );
  it("does not claim an unreachable function was declared or attach an unrelated line", async () => {
    const result = await run("if False:\n    def plan(): attack()\nattack()", {
      concepts: ["function"],
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostic?.line).toBeNull();
    expect(result.diagnostic?.message).not.toContain("ประกาศฟังก์ชันแล้ว");
    expect(result.diagnostic?.message).toContain("เรียก");
  });
  it.each([
    [
      "IndexError",
      'bag = ["ดาบ", "โล่"]\nprint("พร้อม")\nprint(bag[2])\nattack()',
      3,
      "ดัชนีเริ่มจาก 0",
    ],
    [
      "AttributeError",
      "point = (2, 3)\npoint.append(4)\nattack()",
      2,
      "คุณสมบัติหรือเมธอด",
    ],
    ["KeyError", 'data = {"ดาบ": 1}\nprint(data["โล่"])\nattack()', 2, "กุญแจ"],
    ["ValueError", 'amount = int("rune")\nattack()', 1, "ค่าที่ส่งให้ฟังก์ชัน"],
    [
      "OverflowError",
      "import math\nprint(math.exp(1000))\nattack()",
      2,
      "ตัวเลขใหญ่เกิน",
    ],
    [
      "RecursionError",
      "def recurse(): recurse()\nrecurse()\nattack()",
      1,
      "เงื่อนไขหยุด",
    ],
    [
      "TabError",
      "if True:\n\tprint(1)\n        print(2)\nattack()",
      3,
      "แท็บกับช่องว่าง",
    ],
  ])(
    "explains %s in Thai while retaining the original Python kind and line",
    async (kind, code, line, explanation) => {
      const result = await run(code as string, { concepts: ["print"] });
      expect(result.ok).toBe(false);
      expect(result.actions).toEqual([]);
      expect(result.diagnostic?.kind).toBe(kind);
      expect(result.diagnostic?.line).toBe(line);
      expect(result.diagnostic?.message).toContain(explanation);
    },
  );
  it("keeps game guard messages distinct from Python value conversion failures", async () => {
    for (const code of [
      "for i in range(4):\n    attack()",
      'print("x" * 9000)\nattack()',
      "def _runecode_mark(): pass\nattack()",
      "attack()",
    ]) {
      const result = await run(code, { concepts: ["print"] });
      expect(result.ok).toBe(false);
      expect(result.diagnostic?.message).not.toContain("ค่าที่ส่งให้ฟังก์ชัน");
    }
  });
});
