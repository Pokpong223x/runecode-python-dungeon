import { HEROES, encounterById } from "./content";
import { FOCUS_MP, getSkill, POWER_STEP, TURN_AP } from "./skills";
import { COMBO_STEP, FOCUSED_SPELL_BONUS, GUARD_MP } from "./heroTraits";
import type {
  CombatEvent,
  CombatState,
  EnemyIntent,
  GameAction,
  SaveGameV1,
  ActionKind,
} from "./types";
export const actionAP = (kind: ActionKind) => (kind === "skill" ? 2 : 1);
/** One-based boss stage, shared by the move pattern and its visible indicator. */
export const bossPhase = (hp: number, maxHp: number): 1 | 2 | 3 =>
  hp / maxHp < 0.34 ? 3 : hp / maxHp < 0.67 ? 2 : 1;
export function intentFor(
  encounterId: string,
  turn: number,
  enemyHp: number,
  maxHp: number,
): EnemyIntent {
  const e = encounterById(encounterId),
    damage = 7 + e.chapter * 2 + (e.boss ? 3 : 0),
    phase = e.boss ? bossPhase(enemyHp, maxHp) - 1 : 0;
  const pattern = e.boss
    ? ["charge", "heavy", "guard", "attack", "poison"]
    : ["attack", "guard", "heavy", "charge"];
  const kind = pattern[
    (turn - 1 + phase) % pattern.length
  ] as EnemyIntent["kind"];
  return {
    kind,
    damage:
      kind === "heavy"
        ? damage * 2
        : kind === "charge" || kind === "guard"
          ? 0
          : damage,
    label: {
      attack: "โจมตี",
      heavy: "โจมตีหนัก!",
      guard: "ตั้งโล่",
      charge: "รวบรวมพลัง",
      poison: "พิษเงา",
    }[kind],
    description:
      kind === "guard"
        ? "โล่ลดดาเมจปกติ 50% • เวทพ่อมดทะลุโล่"
        : kind === "charge"
          ? "เทิร์นนี้ไม่โจมตี • เตรียมรับมือท่าถัดไป"
          : kind === "poison"
            ? "โจมตีและติดพิษ 2 เทิร์น"
            : `ศัตรูจะสร้างความเสียหาย ${kind === "heavy" ? damage * 2 : damage} HP`,
  };
}
export function startCombat(save: SaveGameV1, id: string): CombatState {
  const e = encounterById(id),
    h = HEROES[save.hero!],
    maxHp = h.hp + (e.chapter - 1) * 10 + save.upgrades.hp * 12,
    enemyHp = e.boss ? 86 + e.chapter * 12 : 22 + e.chapter * 8 + e.room * 7;
  return {
    encounterId: id,
    hero: save.hero!,
    hp: maxHp,
    maxHp,
    mp: h.mp,
    maxMp: h.mp,
    enemyHp,
    maxEnemyHp: enemyHp,
    attack: h.attack + (e.chapter - 1) * 2 + save.upgrades.attack * 2,
    turn: 1,
    potions: save.potions,
    guard: 0,
    poison: 0,
    status: "active",
    mistakes: 0,
    intent: intentFor(id, 1, enemyHp, enemyHp),
    log: [`${e.enemy} ปรากฏตัว อ่านท่าถัดไปก่อนออกคำสั่ง`],
  };
}
export function resolveTurn(
  current: CombatState,
  actions: GameAction[],
): {
  state: CombatState;
  events: CombatEvent[];
  error?: string;
  actionIndex?: number;
} {
  const reject = (error: string, actionIndex?: number) => ({
    state: current,
    events: [],
    error,
    actionIndex,
  });
  if (current.status !== "active") return reject("การต่อสู้นี้จบแล้ว");
  if (!Array.isArray(actions) || !actions.length || actions.length > 3)
    return reject("ออกคำสั่งอย่างน้อยหนึ่งครั้ง และใช้ไม่เกิน 3 AP");
  let ap = 0,
    focuses = 0;
  for (const [index, a] of actions.entries()) {
    if (!a || !["attack", "defend", "skill", "heal", "focus"].includes(a.kind))
      return reject("พบคำสั่งที่ไม่รู้จัก");
    if (a.power !== undefined) {
      if (a.kind !== "attack" && a.kind !== "skill")
        return reject("กำหนดพลังได้เฉพาะ attack() หรือสกิลเท่านั้น", index);
      if (
        typeof a.power !== "number" ||
        !Number.isInteger(a.power) ||
        a.power < 1 ||
        a.power > 3
      )
        return reject("พลังต้องเป็นจำนวนเต็ม 1 ถึง 3 โดยไม่ใช่จำนวน AP", index);
    }
    ap += actionAP(a.kind);
    if (a.kind === "skill") {
      const skill = getSkill(current.hero, a.skill);
      if (!skill)
        return reject(
          "สกิลนี้ไม่ใช่ของอาชีพคุณ เลือกจากแผงสกิลฝั่งผู้เล่น",
          index,
        );
    }
    if (a.kind === "focus" && ++focuses > 1)
      return reject(
        "focus() ใช้ได้ครั้งเดียวต่อเทิร์น ลองเลือกคำสั่งอื่นเสริม",
        index,
      );
  }
  if (
    actions.some((a) => a.kind === "attack") &&
    actions.some((a) => a.kind === "skill")
  )
    return reject(
      "เลือกโจมตีปกติหรือสกิลอย่างใดอย่างหนึ่งต่อเทิร์น ใช้ attack() กับ skill() พร้อมกันไม่ได้",
    );
  if (ap > TURN_AP) {
    let used = 0;
    const index = actions.findIndex(
      (a) => (used += actionAP(a.kind)) > TURN_AP,
    );
    return reject(`ใช้ ${ap} AP แต่มีเพียง 3 AP ลองลดคำสั่งลง`, index);
  }
  // Validate the entire plan in order before mutating the checkpoint. Mana
  // restored later cannot pay for a skill earlier in the same Python run.
  let mp = current.mp,
    potions = current.potions;
  for (const [index, a] of actions.entries()) {
    if (a.kind === "skill") {
      const skill = getSkill(current.hero, a.skill)!;
      if (mp < skill.mp)
        return reject(
          "MP ไม่พอสำหรับสกิล ลองวาง focus() ก่อนสกิล หรือใช้ attack() หรือ defend()",
          index,
        );
      mp = Math.min(current.maxMp, mp - skill.mp + (skill.refund ?? 0));
    }
    if (a.kind === "focus") {
      if (mp >= current.maxMp)
        return reject(
          "MP เต็มแล้ว วาง focus() หลังสกิลที่ใช้ MP หรือเลือกคำสั่งอื่น",
          index,
        );
      mp = Math.min(current.maxMp, mp + FOCUS_MP);
    }
    if (a.kind === "heal" && --potions < 0)
      return reject("ยาไม่พอ ลองป้องกันหรือเปลี่ยนแผน", index);
  }
  const s = structuredClone(current),
    events: CombatEvent[] = [];
  let guard = 0,
    stunned = false,
    attackStreak = 0,
    focused = false;
  const log = (text: string) => s.log.push(text);
  const vitals = () => ({
    hp: s.hp,
    enemyHp: s.enemyHp,
    mp: s.mp,
    potions: s.potions,
    poison: s.poison,
  });
  for (const [actionIndex, a] of actions.entries()) {
    if (s.enemyHp <= 0) break;
    attackStreak = a.kind === "attack" ? attackStreak + 1 : 0;
    if (a.kind === "defend") {
      guard = Math.max(guard, 0.65);
      log("ยกโล่ • ลดความเสียหายเทิร์นนี้ 65%");
      events.push({
        target: "hero",
        animation: "defend",
        action: "defend",
        actionIndex,
        text: "ตั้งรับ",
        vitals: vitals(),
      });
      continue;
    }
    if (a.kind === "heal") {
      s.potions--;
      const heal = Math.min(35, s.maxHp - s.hp);
      s.hp += heal;
      log(`ใช้ยา ฟื้น ${heal} HP`);
      events.push({
        target: "hero",
        animation: "skill",
        action: "heal",
        actionIndex,
        text: `+${heal} HP`,
        vitals: vitals(),
      });
      continue;
    }
    if (a.kind === "focus") {
      focused = true;
      const restored = Math.min(FOCUS_MP, s.maxMp - s.mp);
      s.mp += restored;
      log(`ตั้งสมาธิ ฟื้น ${restored} MP`);
      events.push({
        target: "hero",
        animation: "skill",
        action: "focus",
        actionIndex,
        text: `+${restored} MP`,
        vitals: vitals(),
      });
      continue;
    }
    const baseDamage = s.attack + ((a.power ?? 1) - 1) * POWER_STEP;
    let damage = baseDamage;
    let trait: CombatEvent["trait"];
    const skill = a.kind === "skill" ? getSkill(s.hero, a.skill)! : undefined;
    if (a.kind === "attack" && s.hero === "adventurer" && attackStreak > 1) {
      const bonus = (attackStreak - 1) * COMBO_STEP;
      damage = Math.round(baseDamage * (1 + bonus));
      trait = {
        hero: s.hero,
        text: `คอมโบ ${attackStreak} · +${Math.round(bonus * 100)}%`,
      };
    }
    if (a.kind === "skill") {
      s.mp -= skill!.mp;
      const spellBonus =
        s.hero === "wizard" && focused ? FOCUSED_SPELL_BONUS : 0;
      damage = Math.round(baseDamage * skill!.multiplier * (1 + spellBonus));
      if (spellBonus)
        trait = { hero: s.hero, text: `พลังสกิล +${spellBonus * 100}%` };
      if (skill!.guard) guard = 0.65;
      if (skill!.refund) s.mp = Math.min(s.maxMp, s.mp + skill!.refund);
      if (skill!.stun) stunned = true;
    }
    if (s.intent.kind === "guard" && !skill?.pierce)
      damage = Math.ceil(damage * 0.5);
    const beforeHit = vitals();
    s.enemyHp = Math.max(0, s.enemyHp - damage);
    log(
      `${skill?.name ?? "โจมตี"}${a.power !== undefined ? ` · พลัง ${a.power}` : ""} สร้าง ${damage} ดาเมจ${trait ? ` · ${trait.text}` : ""}`,
    );
    events.push(
      {
        target: "hero",
        animation: a.kind === "skill" ? "skill" : "attack",
        action: a.kind,
        actionIndex,
        ...(a.skill ? { skill: a.skill } : {}),
        ...(a.power !== undefined ? { power: a.power } : {}),
        text: "",
        ...(trait ? { trait } : {}),
        vitals: beforeHit,
      },
      {
        target: "enemy",
        animation: "hurt",
        actionIndex,
        text: `−${damage}`,
        vitals: vitals(),
      },
    );
  }
  if (s.enemyHp === 0) {
    s.status = "won";
    log("ชนะด้วยแผนและโค้ดของคุณ!");
    events.push({
      target: "enemy",
      animation: "defeat",
      text: "VICTORY",
      vitals: vitals(),
    });
  } else {
    const poison = s.poison > 0 ? 4 : 0;
    s.poison = Math.max(0, s.poison - 1);
    const damage = stunned ? 0 : Math.ceil(s.intent.damage * (1 - guard));
    const beforeCounter = { ...vitals(), poison: current.poison };
    s.hp = Math.max(0, s.hp - damage - poison);
    if (s.intent.kind === "poison" && !stunned) s.poison = 2;
    // Restore only at the actual counter contact, never while validating a plan.
    const restored =
      s.hero === "knight" &&
      s.hp > 0 &&
      guard > 0 &&
      !stunned &&
      s.intent.damage > damage
        ? Math.min(GUARD_MP, s.maxMp - s.mp)
        : 0;
    if (restored > 0) s.mp += restored;
    log(
      `${stunned ? "ขัดจังหวะสำเร็จ ศัตรูตอบโต้ไม่ได้" : s.intent.label} • เสีย ${damage + poison} HP${guard ? " (ป้องกันแล้ว)" : ""}`,
    );
    if (restored > 0)
      log(`โล่คืนพลัง · ป้องกันการโจมตีแล้วฟื้น ${restored} MP`);
    events.push(
      {
        target: "enemy",
        animation: stunned
          ? "charge"
          : s.intent.kind === "guard"
            ? "defend"
            : s.intent.kind === "charge"
              ? "charge"
              : "attack",
        text: stunned ? "มึนงง · ข้ามการตอบโต้" : "",
        vitals: beforeCounter,
      },
      ...(damage + poison > 0
        ? [
            {
              target: "hero",
              animation: "hurt",
              text: `−${damage + poison}`,
              ...(restored > 0
                ? {
                    trait: {
                      hero: s.hero,
                      text: `ป้องกันแล้ว +${restored} MP`,
                    },
                  }
                : {}),
              vitals: vitals(),
            } satisfies CombatEvent,
          ]
        : []),
    );
    if (s.hp === 0) {
      s.status = "lost";
      events.push({
        target: "hero",
        animation: "defeat",
        text: "ลองใหม่ได้เสมอ",
        vitals: vitals(),
      });
    } else {
      s.turn++;
      s.intent = intentFor(s.encounterId, s.turn, s.enemyHp, s.maxEnemyHp);
    }
  }
  s.guard = 0;
  s.log = s.log.slice(-40);
  return { state: s, events };
}
export const STAR_HP_PERCENT = { three: 60, two: 30 } as const;
/** Ratings describe the won battle; editing and Python mistakes carry no penalty. */
export const victoryStars = (battle: CombatState): 1 | 2 | 3 =>
  battle.hp * 100 > battle.maxHp * STAR_HP_PERCENT.three
    ? 3
    : battle.hp * 100 > battle.maxHp * STAR_HP_PERCENT.two
      ? 2
      : 1;

/** Keep shop reserves for the next room; only consume this battle's used potions. */
export function commitBattle(
  save: SaveGameV1,
  battle: CombatState,
): SaveGameV1 {
  const previousPotions =
    save.battle?.encounterId === battle.encounterId
      ? save.battle.potions
      : save.potions;
  return {
    ...save,
    battle,
    potions: save.potions - (previousPotions - battle.potions),
  };
}

export function rewardVictory(
  save: SaveGameV1,
  battle: CombatState,
): SaveGameV1 {
  if (battle.status !== "won") return save;
  const next = structuredClone(commitBattle(save, battle)),
    e = encounterById(battle.encounterId),
    first = !next.completed.includes(e.id);
  if (first) {
    next.completed.push(e.id);
    next.gold += e.boss ? 65 + e.chapter * 5 : 25 + e.chapter * 5;
  }
  next.stars[e.id] = Math.max(next.stars[e.id] ?? 0, victoryStars(battle));
  return next;
}
export function purchase(
  save: SaveGameV1,
  item: "attack" | "hp" | "potion",
): { save: SaveGameV1; error?: string } {
  const level = item === "potion" ? save.potions : save.upgrades[item],
    cap = item === "potion" ? 9 : 5,
    cost = item === "potion" ? 25 : 60 + level * 25;
  if (level >= cap) return { save, error: "อัปเกรดถึงระดับสูงสุดแล้ว" };
  if (save.gold < cost)
    return { save, error: "เหรียญยังไม่พอ ลองสำรวจห้องถัดไป" };
  const next = structuredClone(save);
  next.gold -= cost;
  if (item === "potion") next.potions++;
  else next.upgrades[item]++;
  return { save: next };
}
