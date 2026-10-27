import { ChevronRight, Star } from "lucide-react";
import { STAR_HP_PERCENT } from "../engine";

export function StarRules({ maxHp }: { maxHp: number }) {
  const three = Math.floor((maxHp * STAR_HP_PERCENT.three) / 100) + 1;
  const two = Math.floor((maxHp * STAR_HP_PERCENT.two) / 100) + 1;
  const bands = [
    {
      stars: 3,
      min: three,
      max: maxHp,
      note: `มากกว่า ${STAR_HP_PERCENT.three}%`,
    },
    {
      stars: 2,
      min: two,
      max: three - 1,
      note: `มากกว่า ${STAR_HP_PERCENT.two}%`,
    },
    { stars: 1, min: 1, max: two - 1, note: "ชนะได้ก็รับดาว" },
  ];
  return (
    <details className="star-rules">
      <summary>
        <Star size={16} aria-hidden="true" />
        ดาวคิดจาก HP ตอนชนะ
        <ChevronRight size={16} aria-hidden="true" />
      </summary>
      <p>โค้ดผิดและคำใบ้ไม่หักดาว ลองปรับแผนได้เสมอ</p>
      <ul aria-label="ช่วง HP สำหรับดาวของฮีโร่นี้">
        {bands.map(({ stars, min, max, note }) => (
          <li key={stars}>
            <span
              className="rating-glyph"
              role="img"
              aria-label={`${stars} ดาว`}
            >
              {"★".repeat(stars)}
            </span>
            <span>{min <= max ? `${min}–${max} HP` : "ไม่มีช่วง HP นี้"}</span>
            <small>{note}</small>
          </li>
        ))}
      </ul>
    </details>
  );
}
