import type { CombatEvent, HeroId } from "./types";

export const COMBO_STEP = 0.2;
export const GUARD_MP = 2;
export const FOCUSED_SPELL_BONUS = 0.25;

/** Passive rules and player-facing explanations share one catalog. */
export const HERO_TRAITS: Record<
  HeroId,
  { name: string; description: string; tip: string; example: string }
> = {
  adventurer: {
    name: "ต่อคอมโบ",
    description: `attack() ติดต่อกันในเทิร์นเดียวกัน: ครั้งที่ 2 แรงขึ้น ${COMBO_STEP * 100}% และครั้งที่ 3 แรงขึ้น ${COMBO_STEP * 200}% จากพลังโจมตี ก่อนคิดโล่ศัตรู`,
    tip: "คำสั่งต่อสู้อื่นคั่นจะเริ่มคอมโบใหม่ ส่วน print() และการคำนวณไม่ตัดคอมโบ เริ่มนับใหม่ทุกเทิร์น",
    example: "attack()\nattack()\ndefend()",
  },
  knight: {
    name: "โล่คืนพลัง",
    description: `เมื่อตั้งรับแล้วลดดาเมจการโจมตีได้จริง และยังรอดชีวิต ฟื้นสูงสุด ${GUARD_MP} MP หลังศัตรูตอบโต้ โดยไม่เกิน MP เต็ม`,
    tip: "ใช้ได้ทั้ง defend() และกระแทกโล่ ไม่ฟื้นจากพิษอย่างเดียว ศัตรูที่ไม่โจมตี หรือการขัดจังหวะ และใช้ MP ที่จะฟื้นมาจ่ายสกิลล่วงหน้าไม่ได้",
    example: "attack()\ndefend()",
  },
  wizard: {
    name: "ร่ายเสริมพลัง",
    description: `ใช้ focus() ก่อนสกิลในเทิร์นเดียวกัน เพิ่มพลังดาเมจสกิล ${FOCUSED_SPELL_BONUS * 100}% ก่อนคิดโล่ศัตรู พร้อมฟื้น MP ตามปกติ`,
    tip: "ต้องมี MP ขาดอยู่จึงใช้ focus() ได้ โบนัสไม่ข้ามเทิร์น วาง focus() หลังสกิลจะฟื้น MP อย่างเดียว และมหาอัคคียังถูกโล่ลดดาเมจ",
    example: "focus()\nskill()",
  },
};

export function traitMessages(events: CombatEvent[]): string[] {
  return events.flatMap((event) =>
    event.trait
      ? [`${HERO_TRAITS[event.trait.hero].name} · ${event.trait.text}`]
      : [],
  );
}
