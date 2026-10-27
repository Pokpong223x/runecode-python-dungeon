import { HERO_TRAITS } from "../heroTraits";
import type { HeroId } from "../types";

/** One read-only disclosure shared by the player tools and full skill book. */
export function HeroTrait({
  hero,
  sourceExercise = false,
}: {
  hero: HeroId;
  sourceExercise?: boolean;
}) {
  const trait = HERO_TRAITS[hero];
  return (
    <details className="hero-trait" key={hero}>
      <summary>พลังอาชีพ · {trait.name}</summary>
      <p>{trait.description}</p>
      {sourceExercise && hero === "adventurer" ? (
        <p>
          ห้องนี้ออกท่าโจมตีได้หนึ่งครั้งตามโจทย์
          คอมโบของนักผจญภัยใช้ในห้องบอสที่ให้วางแผนหลายท่า
        </p>
      ) : (
        <p>{trait.tip}</p>
      )}
      {sourceExercise ? (
        <p>
          ใช้ค่าพลังและโค้ดตามโจทย์ เลือกโจมตีหนึ่งครั้งแล้วเสริมป้องกัน ยา
          หรือฟื้น MP ได้ตามทรัพยากร
        </p>
      ) : (
        <>
          <span>ตัวอย่างลำดับท่า · เติมโค้ดให้ตรงโจทย์ของห้องด้วย</span>
          <pre>
            <code>{trait.example}</code>
          </pre>
        </>
      )}
      <p>พลังติดตัวทำงานอัตโนมัติ ไม่เสีย AP เพิ่ม ดูผลจริงด้วย “ตรวจแผน”</p>
    </details>
  );
}
