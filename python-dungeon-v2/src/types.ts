export type HeroId = "adventurer" | "knight" | "wizard";
export type ActionKind = "attack" | "defend" | "skill" | "heal" | "focus";
export type OffensiveAction = Extract<ActionKind, "attack" | "skill">;
export type SkillId = "class" | "pierce" | "stun" | "burst";
export interface GameAction {
  kind: ActionKind;
  skill?: SkillId;
  /** Optional offensive power, an integer 1–3; omitted means 1. */
  power?: number;
}
export interface ActionTrace extends GameAction {
  line: number;
  loopLine?: number;
}
export interface APBudget {
  total: number;
  limited: boolean;
  firstOverLine?: number;
  rows: Array<{
    line: number;
    command: string;
    count: number;
    ap: number;
    loopLine?: number;
    suggestedCalls?: number;
  }>;
}
export type Concept =
  | "print"
  | "sequence"
  | "comment"
  | "variable"
  | "string"
  | "arithmetic"
  | "list"
  | "tuple"
  | "set"
  | "if"
  | "for"
  | "while"
  | "function"
  | "parameter"
  | "math"
  | "class"
  | "method"
  | "exception";
export interface LessonContract {
  concepts: Concept[];
  output?: string;
  /** Stable identifier 1–18 for the active curriculum; bosses keep open contracts. */
  sourceExercise?: number;
}
export interface EncounterDefinition {
  id: string;
  chapter: number;
  room: number;
  title: string;
  enemy: string;
  enemyKind: "slime" | "skeleton" | "spider" | "wisp" | "golem" | "lich";
  boss: boolean;
  prompt: string;
  takeaway: string;
  hints: [string, string, string];
  starter: string;
  contract: LessonContract;
  solutions: string[];
}
export interface ChapterDefinition {
  id: number;
  title: string;
  subtitle: string;
  region: string;
  color: string;
  icon: string;
  encounters: EncounterDefinition[];
}
export type IntentKind = "attack" | "heavy" | "guard" | "charge" | "poison";
export interface EnemyIntent {
  kind: IntentKind;
  label: string;
  damage: number;
  description: string;
}
export interface CombatState {
  encounterId: string;
  hero: HeroId;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  enemyHp: number;
  maxEnemyHp: number;
  attack: number;
  turn: number;
  potions: number;
  guard: number;
  poison: number;
  status: "active" | "won" | "lost";
  /** Retained for SaveGameV1 compatibility; attempts no longer change or score it. */
  mistakes: number;
  intent: EnemyIntent;
  log: string[];
}
export interface CombatEvent {
  target: "hero" | "enemy";
  animation: "attack" | "hurt" | "defend" | "skill" | "defeat" | "charge";
  action?: GameAction["kind"];
  /** Zero-based executed command; presentation evidence only, never saved. */
  actionIndex?: number;
  skill?: SkillId;
  power?: number;
  text: string;
  /** A passive triggered at this beat; transient, never saved or used as input. */
  trait?: { hero: HeroId; text: string };
  /** Read-only vitals at this animation beat; saves still commit atomically. */
  vitals?: Pick<CombatState, "hp" | "enemyHp" | "mp" | "potions" | "poison">;
}
export interface SaveGameV1 {
  version: 1;
  revision: number;
  updatedAt: string;
  hero: HeroId | null;
  completed: string[];
  stars: Record<string, number>;
  gold: number;
  upgrades: { attack: number; hp: number };
  potions: number;
  drafts: Record<string, string>;
  notes: string;
  battle: CombatState | null;
  settings: { sound: boolean; reducedMotion: boolean; editorSize: number };
  onboarding: boolean;
}
export interface Diagnostic {
  message: string;
  line?: number;
  kind: string;
}
export interface RunResult {
  ok: boolean;
  actions: GameAction[];
  stdout: string[];
  diagnostic?: Diagnostic;
  trace?: ActionTrace[];
  traceLimited?: boolean;
  budget?: APBudget;
}
export interface RunContext {
  hp: number;
  mp: number;
  enemy_hp: number;
  enemy_intent: string;
  potions: number;
}
