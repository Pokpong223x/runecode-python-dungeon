import { ChevronLeft, X } from "lucide-react";
import { LEARNING_EXAMPLES } from "../learningExamples";
import type { EncounterDefinition } from "../types";
import "./hints.css";

export function LessonHints({
  encounter,
  level,
  onLevelChange,
}: {
  encounter: EncounterDefinition;
  level: number;
  onLevelChange: (level: number) => void;
}) {
  const example = LEARNING_EXAMPLES[encounter.contract.concepts[0]];
  const labels = ["ชี้แนวคิด", "ลองสังเกต", "ตัวอย่างฝึก"];
  return (
    <aside
      id="lesson-hint-panel"
      className="hint-box"
      aria-labelledby="lesson-hint-heading"
    >
      <div className="hint-heading">
        <b id="lesson-hint-heading" role="status" aria-live="polite">
          คำใบ้ {level}/3 · {labels[level - 1]}
        </b>
        <button
          className="btn ghost small hint-close"
          aria-label="ปิดคำใบ้"
          onClick={() => onLevelChange(0)}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <p>{encounter.hints[level - 1]}</p>
      {level === 3 && (
        <div className="hint-example">
          <p>{example.question}</p>
          <pre tabIndex={0} role="region" aria-label="โค้ดตัวอย่างฝึก">
            <code>{example.code}</code>
          </pre>
          <details className="hint-prediction">
            <summary>ลองคาดผลลัพธ์ แล้วเปิดดู</summary>
            <pre tabIndex={0} role="region" aria-label="ผลลัพธ์ตัวอย่าง">
              {example.output.join("\n")}
            </pre>
          </details>
        </div>
      )}
      {level > 1 && (
        <button
          className="btn ghost small hint-previous"
          onClick={() => onLevelChange(level - 1)}
        >
          <ChevronLeft size={16} aria-hidden="true" /> คำใบ้ก่อนหน้า
        </button>
      )}
    </aside>
  );
}
