import type { ActionKind, GameAction, HeroId, SkillId } from "./types";

export const TURN_AP = 3;
export const FOCUS_MP = 3;
/** Lesson power changes damage only; AP and MP remain the action's normal costs. */
export const POWER_STEP = 4;
export interface SkillDefinition {
  id: SkillId;
  name: string;
  mp: number;
  multiplier: number;
  description: string;
  pierce?: boolean;
  guard?: boolean;
  stun?: boolean;
  refund?: number;
}
/** The catalog owns names, costs and effects for UI and deterministic combat. */
export const HERO_SKILLS: Record<HeroId, readonly SkillDefinition[]> = {
  adventurer: [
    {
      id: "class",
      name: "ฟันสองจังหวะ",
      mp: 4,
      multiplier: 2.35,
      refund: 1,
      description: "ฟันต่อเนื่องสองจังหวะ พร้อมคืน 1 MP หลังใช้สกิล",
    },
    {
      id: "pierce",
      name: "แทงทะลวง",
      mp: 4,
      multiplier: 2,
      pierce: true,
      description:
        "แทงผ่านโล่ ศัตรูตั้งรับก็ได้รับดาเมจเต็ม เหมาะกับเทิร์นตั้งโล่",
    },
    {
      id: "stun",
      name: "ด้ามดาบหยุดท่า",
      mp: 5,
      multiplier: 1.2,
      stun: true,
      description:
        "โจมตีและขัดจังหวะการตอบโต้ในเทิร์นนี้ ไม่หยุดพิษที่ติดอยู่แล้ว",
    },
  ],
  knight: [
    {
      id: "class",
      name: "กระแทกโล่",
      mp: 4,
      multiplier: 1.9,
      guard: true,
      description: "กระแทกศัตรูด้วยโล่ พร้อมลดดาเมจที่ได้รับในเทิร์นนี้ 65%",
    },
    {
      id: "pierce",
      name: "คมดาบเจาะเกราะ",
      mp: 5,
      multiplier: 2.3,
      pierce: true,
      description: "ปล่อยแรงแทงทะลุโล่ ทำดาเมจเต็ม แต่ไม่ได้ตั้งรับอัตโนมัติ",
    },
    {
      id: "stun",
      name: "โล่สะกดจังหวะ",
      mp: 5,
      multiplier: 1.25,
      stun: true,
      description: "ใช้โล่หยุดการตอบโต้ของศัตรูในเทิร์นนี้ ไม่ล้างพิษเดิม",
    },
  ],
  wizard: [
    {
      id: "class",
      name: "อัคคีรูน",
      mp: 4,
      multiplier: 2.7,
      pierce: true,
      description: "ปล่อยเวทอัคคีทะลุโล่ ศัตรูตั้งรับก็ยังโดนดาเมจเต็ม",
    },
    {
      id: "burst",
      name: "มหาอัคคี",
      mp: 6,
      multiplier: 3.5,
      description: "ทุ่มมานาเพื่อดาเมจแรงขึ้น แต่โล่ศัตรูยังลดดาเมจได้",
    },
    {
      id: "stun",
      name: "พันธนาการเหมันต์",
      mp: 5,
      multiplier: 1.4,
      stun: true,
      description:
        "ผนึกศัตรูด้วยความเย็น ขัดจังหวะการตอบโต้เทิร์นนี้ แต่พิษเดิมยังทำงาน",
    },
  ],
};
export const getSkill = (hero: HeroId, id: SkillId = "class") =>
  HERO_SKILLS[hero].find((skill) => skill.id === id);
export const skillCommand = (id: SkillId = "class") =>
  id === "class" ? "skill" : id;
export const actionCommand = (action: GameAction) =>
  action.kind === "skill" ? skillCommand(action.skill) : action.kind;
/** Show the evaluated argument, not an unevaluated variable or loop expression. */
export const actionCall = (action: GameAction) =>
  `${actionCommand(action)}(${action.power ?? ""})`;
/** A new offensive statement starts with explicit power for ordinary exercises. */
export const starterActionCall = (kind: ActionKind, skill?: SkillId) =>
  actionCall({
    kind,
    skill,
    ...(kind === "attack" || kind === "skill" ? { power: 1 } : {}),
  });
