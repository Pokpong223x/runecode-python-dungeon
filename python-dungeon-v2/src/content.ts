import type { ChapterDefinition, EncounterDefinition, HeroId } from "./types";
import { FOCUS_MP, HERO_SKILLS } from "./skills";
import { SOURCE_LESSONS } from "./sourceCurriculum";
export const HEROES: Record<
  HeroId,
  {
    name: string;
    title: string;
    description: string;
    hp: number;
    mp: number;
    attack: number;
    skill: string;
    badge: string;
  }
> = {
  adventurer: {
    name: "นักผจญภัย",
    title: "เร็ว • สมดุล • คอมโบ",
    description: "ตีปกติต่อเนื่องแรงขึ้น เลือกต่อคอมโบหรือเว้นจังหวะป้องกัน",
    hp: 110,
    mp: 16,
    attack: 12,
    skill: HERO_SKILLS.adventurer[0].name,
    badge: "คอมโบ",
  },
  knight: {
    name: "อัศวิน",
    title: "ถึก • ป้องกัน • มั่นคง",
    description:
      "ตั้งรับเพื่อลดดาเมจและฟื้น MP หลังถูกโจมตี ใช้โล่ประคองการต่อสู้",
    hp: 140,
    mp: 16,
    attack: 11,
    skill: HERO_SKILLS.knight[0].name,
    badge: "ป้องกัน",
  },
  wizard: {
    name: "พ่อมด",
    title: "เวท • ทรงพลัง • วางแผน",
    description:
      "ตั้งสมาธิก่อนร่ายเพื่อเสริมพลังสกิล มี MP มาก แต่ต้องเลือกจังหวะให้ดี",
    hp: 95,
    mp: 24,
    attack: 12,
    skill: HERO_SKILLS.wizard[0].name,
    badge: "เวทมนตร์",
  },
};
const meta = [
  [
    "ประตูแห่งคำสั่ง",
    "เริ่มต้น Python",
    "ป่าแสงแรก",
    "#5e9c77",
    "01",
    "ผู้พิทักษ์มอส",
    "slime",
  ],
  [
    "คลังพลัง",
    "ตัวแปรและการคำนวณ",
    "เหมืองอำพัน",
    "#b48a44",
    "02",
    "อัศวินอำพัน",
    "skeleton",
  ],
  [
    "สุสานข้อมูล",
    "ชุดข้อมูลและดัชนี",
    "นครแก้วคราม",
    "#5b94ae",
    "03",
    "แม่ม่ายผลึก",
    "spider",
  ],
  [
    "เขาวงกตเงื่อนไข",
    "เงื่อนไขและการวนซ้ำ",
    "ป่าเงาจันทรา",
    "#9b7eb5",
    "04",
    "ภูตแห่งกาลเวลา",
    "wisp",
  ],
  [
    "หอคัมภีร์",
    "ฟังก์ชันและโมดูล",
    "ห้องสมุดมรกต",
    "#538f91",
    "05",
    "โกเลมบรรณารักษ์",
    "golem",
  ],
  [
    "บัลลังก์นักโค้ด",
    "วัตถุและการจัดการข้อผิดพลาด",
    "ยอดปราสาทดารา",
    "#b88d65",
    "06",
    "จอมเวทรูนสูญ",
    "lich",
  ],
];
// Bosses are short chapter reviews with one small editing step in each starter.
// They use open concept contracts and preserve normal combat choices.
type BossChallenge = Pick<
  EncounterDefinition,
  | "title"
  | "prompt"
  | "takeaway"
  | "contract"
  | "starter"
  | "hints"
  | "solutions"
>;
const bossChallenges: BossChallenge[] = [
  {
    title: "บอส: ประกาศขบวนสำรวจ",
    prompt: "Add a # comment and print a message. Choose any combat action.",
    takeaway: "Comments explain your code. print() shows a message.",
    contract: { concepts: ["print", "comment"] },
    starter: "# TODO: Add print() with your message.\nattack(3)",
    hints: [
      "The starter already has a # comment. Add one print() line.",
      "Put your message inside quotation marks.",
      'Try print("Ready") above attack(3).',
    ],
    solutions: [
      '# Leave camp\nprint("Ready")\nattack(3)\ndefend()',
      '# Check the trail\nprint("Let us go")\ndefend()\nattack(3)',
      '# Use a skill\nprint("All set")\nskill(3)\ndefend()',
    ],
  },
  {
    title: "บอส: นับเชื้อเพลิง",
    prompt:
      "Store a number in a variable, read it, and calculate with numbers. Print something and choose a combat action.",
    takeaway: "A variable stores a number. + adds to it.",
    contract: { concepts: ["variable", "arithmetic"] },
    starter: "fuel = 2\n# TODO: Print fuel + 1.\nattack(3)",
    hints: [
      "fuel already stores a number. Use its name in a calculation.",
      "fuel + 1 adds one to the stored number.",
      "Add print(fuel + 1) above attack(3).",
    ],
    solutions: [
      "fuel = 2\nprint(fuel + 1)\nattack(3)\ndefend()",
      "lamps = 4\nprint(lamps - 1)\ndefend()\nattack(3)",
      "boxes = 3\nprint(boxes + 2)\nskill(3)\ndefend()",
    ],
  },
  {
    title: "บอส: นับพัสดุ",
    prompt:
      "Use a list. Read one item or count the items with len(), then choose a combat action.",
    takeaway: "len() counts the items in a list.",
    contract: { concepts: ["list"] },
    starter: 'parcels = ["tea", "map"]\n# TODO: Print len(parcels).\nattack(3)',
    hints: [
      "The starter already contains a list with two items.",
      "len(parcels) counts those items.",
      "Add print(len(parcels)) above attack(3).",
    ],
    solutions: [
      'parcels = ["tea", "map"]\nprint(len(parcels))\nattack(3)\ndefend()',
      'bag = ["rope", "torch"]\nprint(bag[0])\ndefend()\nattack(3)',
      'items = ["book"]\nprint(len(items))\nskill(3)\ndefend()',
    ],
  },
  {
    title: "บอส: ยามเรียกแถว",
    prompt:
      "Run a for loop at least once and use print(). Choose any combat action.",
    takeaway: "A for loop repeats the indented code.",
    contract: { concepts: ["for", "print"] },
    starter:
      "for step in range(2):\n    # TODO: Replace pass with print().\n    pass\nattack(3)",
    hints: [
      "range(2) makes the loop run twice.",
      "Keep the print() line indented inside the loop.",
      'Replace pass with print("Ready").',
    ],
    solutions: [
      'for step in range(2):\n    print("Ready")\nattack(3)\ndefend()',
      "for count in range(3):\n    print(count)\ndefend()\nattack(3)",
      'for call in range(1):\n    print("Here")\nskill(3)\ndefend()',
    ],
  },
  {
    title: "บอส: เรียกผู้ช่วย",
    prompt: "Define a function and call it. Choose any combat action.",
    takeaway: "def creates a function. Its code runs when you call it.",
    contract: { concepts: ["function"] },
    starter:
      'def ready():\n    print("Ready")\n# TODO: Call ready().\nattack(3)',
    hints: [
      "The function is already defined. It still needs a call.",
      "Call ready() on a new line without indentation.",
      "Add ready() above attack(3).",
    ],
    solutions: [
      'def ready():\n    print("Ready")\nready()\nattack(3)\ndefend()',
      'def greet():\n    print("Hello")\ngreet()\ndefend()\nattack(3)',
      'def signal():\n    print("Go")\nsignal()\nskill(3)\ndefend()',
    ],
  },
  {
    title: "บอส: อ่านเครื่องวัดดาว",
    prompt:
      "Create a class and an object. Read an attribute through the object and choose a combat action.",
    takeaway: "An object stores attributes. object.name reads one attribute.",
    contract: { concepts: ["class"] },
    starter:
      "class Gauge:\n    power = 3\ngauge = Gauge()\n# TODO: Use gauge.power in attack().\nattack()",
    hints: [
      "gauge is an object created from Gauge.",
      "gauge.power reads the object's power attribute.",
      "Change attack() to attack(gauge.power).",
    ],
    solutions: [
      "class Gauge:\n    power = 3\ngauge = Gauge()\nattack(gauge.power)\ndefend()",
      "class Dial:\n    power = 2\ndial = Dial()\ndefend()\nattack(dial.power)",
      "class Sensor:\n    power = 3\nsensor = Sensor()\nskill(sensor.power)\ndefend()",
    ],
  },
];

export const CHAPTERS: ChapterDefinition[] = meta.map((m, i) => {
  const encounters: EncounterDefinition[] = SOURCE_LESSONS[i].map((l, r) => ({
    id: `${i + 1}-${r + 1}`,
    chapter: i + 1,
    room: r + 1,
    title: l.title,
    enemy: ["ผู้เฝ้าทาง", "ผู้เฝ้าห้อง", "ผู้เฝ้าประตู"][r],
    enemyKind: m[6] as EncounterDefinition["enemyKind"],
    boss: false,
    prompt: l.prompt,
    takeaway: l.takeaway,
    contract: { concepts: l.concepts, sourceExercise: l.sourceExercise },
    starter: l.starter ?? "",
    hints: l.hints,
    solutions: l.solutions,
  }));
  const challenge = bossChallenges[i];
  encounters.push({
    id: `${i + 1}-4`,
    chapter: i + 1,
    room: 4,
    title: challenge.title,
    enemy: m[5],
    enemyKind: m[6] as EncounterDefinition["enemyKind"],
    boss: true,
    prompt: challenge.prompt,
    takeaway: challenge.takeaway,
    contract: challenge.contract,
    starter: challenge.starter,
    hints: challenge.hints,
    solutions: challenge.solutions,
  });
  return {
    id: i + 1,
    title: m[0],
    subtitle: m[1],
    region: m[2],
    color: m[3],
    icon: m[4],
    encounters,
  };
});
export const ENCOUNTERS = CHAPTERS.flatMap((c) => c.encounters);
export const encounterById = (id: string) =>
  ENCOUNTERS.find((e) => e.id === id)!;
export const isUnlocked = (id: string, completed: string[]) => {
  const n = ENCOUNTERS.findIndex((e) => e.id === id);
  return n === 0 || (n > 0 && completed.includes(ENCOUNTERS[n - 1].id));
};
export const nextEncounter = (completed: string[]) =>
  ENCOUNTERS.find((e) => !completed.includes(e.id)) ?? ENCOUNTERS[23];
export const API_GUIDE = [
  [
    "attack(power)",
    "Attack • 1 AP • power is an integer from 1 to 3; defaults to 1",
  ],
  ["defend()", "Reduce incoming damage by 65% • 1 AP"],
  [
    "skill(power)",
    "Class skill • 2 AP + 4 MP • uses power like attack(); defaults to 1",
  ],
  [
    "power 1 / 2 / 3",
    "Add 0 / 4 / 8 to base attack before skill and shield calculations • AP/MP costs stay the same",
  ],
  ["heal()", "Restore 35 HP • 1 AP + 1 potion"],
  ["focus()", `Restore up to ${FOCUS_MP} MP • 1 AP • once per turn`],
  [
    "hp / mp",
    "Copies of HP / MP at the start of the turn • assigning these variables does not change your actual stats",
  ],
  ["enemy_hp", "Enemy HP"],
  ["enemy_intent", "attack, heavy, guard, charge, poison"],
];
