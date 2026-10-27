import { useEffect, useRef } from "react";
import { ArrowRight } from "lucide-react";
import { victoryStars } from "../engine";
import type { CombatState, EncounterDefinition } from "../types";
import { StarRules } from "./StarRules";
import "./battle-result.css";

export function BattleResult({
  battle,
  encounter,
  bestStars,
  reveal,
  onAdvance,
  onMap,
  onKeepCode,
}: {
  battle: CombatState;
  encounter: EncounterDefinition;
  bestStars: number;
  reveal: boolean;
  onAdvance: () => void;
  onMap: () => void;
  onKeepCode: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const revealed = useRef(false);
  const won = battle.status === "won";

  useEffect(() => {
    if (revealed.current) return;
    revealed.current = true;
    // A dialog owns focus and scroll. Closing it must not replay a result that
    // completed in the background. This component mounts only after playback.
    if (!reveal || !heading.current || !primary.current) return;
    heading.current.focus({ preventScroll: true });
    const viewport = window.visualViewport;
    const top = viewport?.offsetTop ?? 0;
    const bottom = top + (viewport?.height ?? window.innerHeight);
    const title = heading.current.getBoundingClientRect();
    const action = primary.current.getBoundingClientRect();
    if (title.top < top + 16 || action.bottom > bottom - 16)
      heading.current.scrollIntoView({ block: "start", behavior: "auto" });
  }, [reveal]);

  return (
    <section
      className={`result-panel ${battle.status}`}
      aria-label="ผลการต่อสู้"
    >
      <span className="eyebrow">
        {won ? "CHAPTER OF YOUR STORY" : "EVERY TRY IS PROGRESS"}
      </span>
      <h2 ref={heading} tabIndex={-1}>
        {won ? "อีกหนึ่งก้าวของนักโค้ด!" : "พักหายใจ แล้วลองอีกครั้ง"}
      </h2>
      <p>
        {won
          ? encounter.takeaway
          : "โค้ดที่เขียนยังอยู่ครบ ลองอ่านท่าศัตรูและใช้ defend() เมื่อเจอท่าหนัก"}
      </p>
      <div className="result-actions">
        <button ref={primary} className="btn primary" onClick={onAdvance}>
          {won
            ? encounter.id === "6-4"
              ? "ชมการเดินทางของคุณ"
              : "ไปห้องถัดไป"
            : "ลองห้องนี้อีกครั้ง"}
          <ArrowRight size={18} aria-hidden="true" />
        </button>
        <button className="btn secondary" onClick={onMap}>
          กลับแผนที่
        </button>
        <button className="btn ghost" onClick={onKeepCode}>
          เก็บโค้ดในสมุด
        </button>
      </div>
      {won && (
        <>
          <div className="result-stars">
            <span
              role="img"
              aria-label={`รอบนี้ ${victoryStars(battle)} ดาว จาก 3`}
            >
              {"★".repeat(victoryStars(battle))}
            </span>
            <small className="star-caption">
              รอบนี้ {victoryStars(battle)}/3 · สถิติดีที่สุด {bestStars}/3
            </small>
          </div>
          <p className="result-rating-reason">
            HP ตอนชนะ {battle.hp}/{battle.maxHp}
          </p>
          <StarRules maxHp={battle.maxHp} />
        </>
      )}
    </section>
  );
}
