import { useEffect, useRef } from "react";
import { ArrowRight, Check, ChevronRight } from "lucide-react";
import type { RunResult } from "../types";

interface Props {
  result: (RunResult & { preview?: boolean }) | null;
  ready: boolean;
  reveal: boolean;
  onJump: (line: number) => void;
}

export function PythonFeedback({ result, ready, reveal, onJump }: Props) {
  const diagnostic = useRef<HTMLDivElement>(null);
  const lastResult = useRef<Props["result"]>(null);
  const line = result?.diagnostic?.line;
  useEffect(() => {
    if (lastResult.current === result) return;
    lastResult.current = result;
    // Reveal each new correction once without moving focus or reopening a
    // phone keyboard. An open dialog keeps its own scroll/focus position.
    if (!reveal || !result?.diagnostic || !diagnostic.current) return;
    const viewport = window.visualViewport;
    const top = viewport?.offsetTop ?? 0;
    const bottom = top + (viewport?.height ?? window.innerHeight);
    const box = diagnostic.current.getBoundingClientRect();
    if (box.top < top + 16 || box.bottom > bottom - 16)
      diagnostic.current.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [result, reveal]);

  return (
    <div
      className={`output-box ${result && !result.ok ? "output-error" : ""}`}
      data-testid="python-output"
    >
      <div
        id="python-feedback"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="output-heading">
          <span>
            {result && !result.ok ? "ลองปรับโค้ดอีกนิด" : "ผลลัพธ์จาก Python"}
          </span>
          <span
            className={`status-dot ${ready ? "" : "loading"}`}
            aria-hidden="true"
          />
        </div>
        {result?.diagnostic && (
          <div className="diagnostic-message" ref={diagnostic}>
            <p>{result.diagnostic.message}</p>
            {line && (
              <button
                type="button"
                className="diagnostic-jump"
                onClick={() => onJump(line)}
              >
                ไปบรรทัด {line}
                <ArrowRight size={14} />
              </button>
            )}
          </div>
        )}
        {result?.ok && (
          <p className="success-text">
            <Check size={15} aria-hidden="true" />
            {result.preview
              ? `ตรวจแผนผ่าน · ${result.actions.length} คำสั่ง ยังไม่เสียเทิร์น`
              : `รันสำเร็จ · ${result.actions.length} คำสั่งถูกส่งเข้าสู่การต่อสู้`}
          </p>
        )}
        {!result && (
          <p>ผลพิมพ์และคำแนะนำจะแสดงที่นี่ ลองเริ่มจากภารกิจด้านบน</p>
        )}
      </div>
      {!!result?.budget && (
        <details className="ap-breakdown" open={result.budget.total > 3}>
          <summary>
            AP ตามบรรทัด · {result.budget.limited ? "อย่างน้อย " : ""}
            {result.budget.total} / 3 AP
            <ChevronRight size={18} aria-hidden="true" />
          </summary>
          <p>
            นับจากคำสั่งที่ Python เรียกจริง รวมการวนลูปและการเรียกฟังก์ชันซ้ำ
            ตัวเลขในวงเล็บคือพลัง ไม่ใช่ AP
          </p>
          <ul>
            {result.budget.rows.map((row) => (
              <li
                key={`${row.line}-${row.command}`}
                data-ap-line={row.line}
                className={
                  row.line === result.budget?.firstOverLine
                    ? "ap-row-over"
                    : undefined
                }
              >
                <div>
                  <b>
                    บรรทัด {row.line} · <code>{row.command}</code>
                  </b>
                  <span>
                    {row.count} ครั้ง × {row.ap / row.count} AP = {row.ap} AP
                  </span>
                  {row.suggestedCalls !== undefined && (
                    <span className="ap-suggestion">
                      {row.suggestedCalls === 0
                        ? "ลองนำคำสั่งนี้ออกจากเทิร์น เพื่อเหลือ AP ให้คำสั่งอื่น"
                        : `ลองลดให้คำสั่งนี้ทำงานไม่เกิน ${row.suggestedCalls} ครั้งในเทิร์นนี้`}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onJump(row.line)}
                  aria-label={`ดูคำสั่งบรรทัด ${row.line}`}
                  className="ap-jump"
                >
                  ดูโค้ด <ArrowRight size={14} />
                </button>
                {row.loopLine && (
                  <button
                    type="button"
                    className="ap-loop-jump"
                    onClick={() => onJump(row.loopLine!)}
                  >
                    แก้จำนวนรอบ · ลูปบรรทัด {row.loopLine}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p>
            {result.budget.total > 3
              ? `เริ่มเกิน 3 AP ที่บรรทัด ${result.budget.firstOverLine} · ยังไม่เสียเทิร์นหรือทรัพยากร`
              : "แสดงเฉพาะค่า AP · ภารกิจและทรัพยากรตรวจแยกตามผลด้านบน"}
          </p>
        </details>
      )}
      {!!result?.stdout.length && (
        <div
          className="python-stdout"
          role="region"
          aria-label="ข้อความที่พิมพ์"
          tabIndex={0}
        >
          {result.stdout.map((line, index) => (
            <pre key={index}>{line}</pre>
          ))}
        </div>
      )}
    </div>
  );
}
