import type { Concept } from "./types";

export const SOURCE_COMBAT_GUIDANCE =
  "Use attack(power) or skill(power) once. Keep the plan within 3 AP.";

interface SourceLesson {
  title: string;
  concepts: Concept[];
  prompt: string;
  hint: string;
  takeaway: string;
  starter: string;
  correction: string;
  transfer: string;
  /** Two no-MP answers; the third uses the same power with skill(). */
  answers: [string, string];
}

/** Short beginner exercises, retaining the six-chapter concept progression. */
const definitions: SourceLesson[][] = [
  [
    {
      title: "Moon Gate",
      concepts: ["print"],
      prompt: "Print Moon Gate. Then attack with power 1.",
      hint: 'Put the message inside print("Moon Gate").',
      takeaway: "print() displays text inside quotation marks.",
      starter: 'print("...")\nattack(1)',
      correction: "Print Moon Gate before attack(1).",
      transfer: "Change the example message to Moon Gate.",
      answers: [
        'print("Moon Gate")\nattack(1)\ndefend()',
        "print('Moon Gate')\nattack(1)\ndefend()",
      ],
    },
    {
      title: "A Torch Signal",
      concepts: ["comment", "print"],
      prompt: "Write a # comment. Print Light, then attack with power 2.",
      hint: "Start your comment with #.",
      takeaway: "Python skips comments that begin with #.",
      starter: '# Add a comment about your plan.\nprint("...")\nattack(2)',
      correction: 'Add a # comment and print("Light") before attacking.',
      transfer: "Write a short comment above your signal.",
      answers: [
        '# Light the torch.\nprint("Light")\nattack(2)\ndefend()',
        "# Send a signal.\nprint('Light')\nattack(2)\ndefend()",
      ],
    },
    {
      title: "Bridge Countdown",
      concepts: ["sequence", "print"],
      prompt:
        "Print 3, 2, and 1 on separate lines using three print() calls. Then attack with power 1.",
      hint: "Write print(3), print(2), then print(1).",
      takeaway: "Python runs your lines from top to bottom.",
      starter: "print(3)\n# Print 2 and 1 below.\nattack(1)",
      correction: "Finish all three countdown lines before attack(1).",
      transfer: "Keep the three print() calls in countdown order.",
      answers: [
        "print(3)\nprint(2)\nprint(1)\nattack(1)\ndefend()",
        'print("3")\nprint("2")\nprint("1")\nattack(1)\ndefend()',
      ],
    },
  ],
  [
    {
      title: "Three Bolts",
      concepts: ["variable"],
      prompt: "Set bolts = 3. Attack using bolts as the power.",
      hint: "Use attack(bolts) to read the variable.",
      takeaway: "A variable stores a value under a name.",
      starter: "bolts = ...\nattack(bolts)",
      correction: "Store 3 in bolts before using it to attack.",
      transfer: "Use the variable name inside the attack command.",
      answers: [
        "bolts = 3\nattack(bolts)\ndefend()",
        "bolts = 3\npower = bolts\nattack(power)\ndefend()",
      ],
    },
    {
      title: "The Moon Label",
      concepts: ["string"],
      prompt: 'Set label = "Moon". Print label, then attack with power 2.',
      hint: "Print the variable with print(label).",
      takeaway: "A string is text stored inside quotation marks.",
      starter: 'label = "Moon"\nprint(...)\nattack(2)',
      correction: "Use print(label), without quotes around label.",
      transfer: "Print the value stored in your text variable.",
      answers: [
        'label = "Moon"\nprint(label)\nattack(2)\ndefend()',
        "label = 'Moon'\nprint(label)\nattack(2)\ndefend()",
      ],
    },
    {
      title: "Energy Left",
      concepts: ["arithmetic"],
      prompt: "Set stored = 8 and spent = 5. Attack using stored - spent.",
      hint: "Subtract spent from stored to get 3.",
      takeaway: "The - operator subtracts one number from another.",
      starter: "stored = 8\nspent = 5\nattack(...)",
      correction: "Use stored - spent as the attack power.",
      transfer: "Calculate the remaining amount before attacking.",
      answers: [
        "stored = 8\nspent = 5\nattack(stored - spent)\ndefend()",
        "stored = 8\nspent = 5\nleft = stored - spent\nattack(left)\ndefend()",
      ],
    },
  ],
  [
    {
      title: "The Third Pocket",
      concepts: ["list"],
      prompt:
        "Create supplies = [4, 7, 2]. Attack using its third item, supplies[2].",
      hint: "Index 2 selects the third item.",
      takeaway: "List indexes start at 0.",
      starter: "supplies = [4, 7, 2]\nattack(supplies[...])",
      correction: "Read supplies[2] for power 2.",
      transfer: "Choose the requested item by its index.",
      answers: [
        "supplies = [4, 7, 2]\nattack(supplies[2])\ndefend()",
        "supplies = [4, 7, 2]\npower = supplies[2]\nattack(power)\ndefend()",
      ],
    },
    {
      title: "The Last Bearing",
      concepts: ["tuple"],
      prompt:
        "Create bearings = (8, 5, 3). Attack using its third item, bearings[2].",
      hint: "Use index 2 to read the value 3.",
      takeaway: "A tuple keeps values in order.",
      starter: "bearings = (8, 5, 3)\nattack(bearings[...])",
      correction: "Use bearings[2] for power 3.",
      transfer: "Read a tuple item just like a list item.",
      answers: [
        "bearings = (8, 5, 3)\nattack(bearings[2])\ndefend()",
        "bearings = (8, 5, 3)\npower = bearings[2]\nattack(power)\ndefend()",
      ],
    },
    {
      title: "Two Unique Signals",
      concepts: ["set"],
      prompt:
        'Create a set named signals containing "sun" and "moon". Attack using len(signals).',
      hint: 'Try signals = {"sun", "moon"}.',
      takeaway: "A set stores each value only once.",
      starter: 'signals = {"sun", "moon"}\nattack(len(...))',
      correction: "Count the two unique signals with len(signals).",
      transfer: "Use len() to count the values in your set.",
      answers: [
        'signals = {"sun", "moon"}\nattack(len(signals))\ndefend()',
        'signals = set(["sun", "moon", "sun"])\nattack(len(signals))\ndefend()',
      ],
    },
  ],
  [
    {
      title: "An Empty Tank",
      concepts: ["if"],
      prompt: "Set fuel = 0. Use if fuel == 0 to attack with power 1.",
      hint: "Indent attack(1) under if fuel == 0:.",
      takeaway: "if runs its block when the condition is true.",
      starter: "fuel = 0\nif fuel == 0:\n    attack(...)",
      correction: "Put attack(1) inside the if block.",
      transfer: "Use the requested condition to choose when to attack.",
      answers: [
        "fuel = 0\nif fuel == 0:\n    attack(1)\ndefend()",
        "fuel = 0\npower = 1\nif fuel == 0:\n    attack(power)\ndefend()",
      ],
    },
    {
      title: "Two Steps",
      concepts: ["for"],
      prompt:
        "Use for step in range(2) to print(step). After the loop, attack once with power 3.",
      hint: "Keep attack(3) outside the loop without indentation.",
      takeaway: "range(2) gives the values 0 and 1.",
      starter: "for step in range(2):\n    print(...)\nattack(3)",
      correction: "Print step inside the loop and attack after it.",
      transfer: "Repeat the printing, then attack once after the loop.",
      answers: [
        "for step in range(2):\n    print(step)\nattack(3)\ndefend()",
        "for step in range(2):\n    print(step)\npower = 3\nattack(power)\ndefend()",
      ],
    },
    {
      title: "Unlock the Gate",
      concepts: ["while"],
      prompt:
        "Set lock = 2. While lock > 0, subtract 1 from lock. After the loop, attack with power 2.",
      hint: "Use lock -= 1 inside the loop.",
      takeaway: "while repeats until its condition becomes false.",
      starter: "lock = 2\nwhile lock > 0:\n    lock -= ...\nattack(2)",
      correction: "Reduce lock by 1 each time and attack after the loop.",
      transfer: "Change the counter each time so the loop can stop.",
      answers: [
        "lock = 2\nwhile lock > 0:\n    lock -= 1\nattack(2)\ndefend()",
        "lock = 2\nwhile lock > 0:\n    lock = lock - 1\nattack(2)\ndefend()",
      ],
    },
  ],
  [
    {
      title: "A Small Spark",
      concepts: ["function"],
      prompt: "Create spark() that returns 3. Attack using spark().",
      hint: "Write return 3 inside the function.",
      takeaway: "return sends a value back from a function.",
      starter: "def spark():\n    return ...\nattack(spark())",
      correction: "Return 3 from spark(), then call it for the attack.",
      transfer: "Replace the returned number with the requested power.",
      answers: [
        "def spark():\n    return 3\nattack(spark())\ndefend()",
        "def spark():\n    return 3\npower = spark()\nattack(power)\ndefend()",
      ],
    },
    {
      title: "Boost the Number",
      concepts: ["parameter"],
      prompt:
        "Create boost(number) that returns number + 1. Attack using boost(1).",
      hint: "The parameter number receives 1 when you call boost(1).",
      takeaway: "A parameter receives a value passed into a function.",
      starter: "def boost(number):\n    return number + ...\nattack(boost(1))",
      correction: "Return number + 1 and call boost(1) for power 2.",
      transfer: "Use the parameter inside the function's calculation.",
      answers: [
        "def boost(number):\n    return number + 1\nattack(boost(1))\ndefend()",
        "def boost(number):\n    return number + 1\npower = boost(1)\nattack(power)\ndefend()",
      ],
    },
    {
      title: "Whole Battery Units",
      concepts: ["math"],
      prompt: "Import math. Attack using math.floor(2.9).",
      hint: "math.floor(2.9) rounds down to 2.",
      takeaway: "math.floor() rounds down to a whole number.",
      starter: "import math\nattack(math.floor(...))",
      correction: "Put 2.9 inside math.floor() for power 2.",
      transfer: "Call the imported function with the requested number.",
      answers: [
        "import math\nattack(math.floor(2.9))\ndefend()",
        "import math\npower = math.floor(2.9)\nattack(power)\ndefend()",
      ],
    },
  ],
  [
    {
      title: "A Lantern Object",
      concepts: ["class"],
      prompt:
        "Create class Lantern with power = 3. Make a Lantern object and attack using its power.",
      hint: "Read the object's value with lantern.power.",
      takeaway: "An object stores values defined by its class.",
      starter:
        "class Lantern:\n    power = ...\nlantern = Lantern()\nattack(lantern.power)",
      correction: "Use lantern.power as the attack power.",
      transfer: "Use a dot to read your object's value.",
      answers: [
        "class Lantern:\n    power = 3\nlantern = Lantern()\nattack(lantern.power)\ndefend()",
        "class Lantern:\n    power = 3\nlamp = Lantern()\nattack(lamp.power)\ndefend()",
      ],
    },
    {
      title: "A Spring Method",
      concepts: ["method"],
      prompt:
        "Create class Spring with release(self) returning 2. Make an object and attack using its release() method.",
      hint: "Call the method with spring.release().",
      takeaway: "A method is a function inside a class.",
      starter:
        "class Spring:\n    def release(self):\n        return ...\nspring = Spring()\nattack(spring.release())",
      correction: "Return 2 from release(self), then call spring.release().",
      transfer: "Keep self in the definition and call through the object.",
      answers: [
        "class Spring:\n    def release(self):\n        return 2\nspring = Spring()\nattack(spring.release())\ndefend()",
        "class Spring:\n    def release(self):\n        return 2\ncoil = Spring()\nattack(coil.release())\ndefend()",
      ],
    },
    {
      title: "The Broken Divider",
      concepts: ["exception"],
      prompt:
        "Try 6 / 0. Catch ZeroDivisionError and attack with power 2 inside except.",
      hint: "Put attack(2) under except ZeroDivisionError:.",
      takeaway: "except handles an error so your program can continue.",
      starter: "try:\n    6 / 0\nexcept ZeroDivisionError:\n    attack(...)",
      correction: "Catch ZeroDivisionError and use attack(2) in that block.",
      transfer: "Place the fallback action inside the error handler.",
      answers: [
        "try:\n    6 / 0\nexcept ZeroDivisionError:\n    attack(2)\ndefend()",
        "power = 2\ntry:\n    6 / 0\nexcept ZeroDivisionError:\n    attack(power)\ndefend()",
      ],
    },
  ],
];

export const SOURCE_CHALLENGES_EN = definitions.map((chapter) =>
  chapter.map(({ prompt, hint }) => ({ prompt, hint })),
);

export const SOURCE_TAKEAWAYS_EN = definitions.map((chapter) =>
  chapter.map(({ takeaway }) => takeaway),
);

/** Compatibility names for consumers of the original curriculum exports. */
export const SOURCE_CHALLENGES = SOURCE_CHALLENGES_EN;
export const SOURCE_TAKEAWAYS = SOURCE_TAKEAWAYS_EN;

export const SOURCE_LESSONS = definitions.map((chapter, chapterIndex) =>
  chapter.map((lesson, roomIndex) => ({
    ...lesson,
    sourceExercise: chapterIndex * 3 + roomIndex + 1,
    hints: [lesson.hint, lesson.correction, lesson.transfer] as [
      string,
      string,
      string,
    ],
    solutions: [
      ...lesson.answers,
      lesson.answers[0].replace(/\battack\(/g, "skill("),
    ],
  })),
);
