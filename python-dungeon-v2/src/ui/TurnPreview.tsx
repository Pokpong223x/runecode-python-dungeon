import { Check, Play, Pencil, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { actionCall, getSkill } from "../skills";
import { actionAP } from "../engine";
import type { CombatState, GameAction } from "../types";
import { SkillIcon } from "./SkillIcon";

export interface TurnForecast {
  before: CombatState;
  after: CombatState;
  actions: GameAction[];
  source: string;
  traits: string[];
}

export function TurnPreview({
  forecast,
  onRun,
  onEdit,
  onClose,
  disabled,
}: {
  forecast: TurnForecast;
  onRun: () => void;
  onEdit: () => void;
  onClose: () => void;
  disabled: boolean;
}) {
  const { before, after, actions } = forecast;
  const host = useRef<HTMLElement>(null);
  useEffect(() => {
    host.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, []);
  const labels = {
    attack: "โจมตี",
    defend: "ป้องกัน",
    skill: "สกิล",
    heal: "ใช้ยา",
    focus: "ตั้งสมาธิ · ฟื้น MP",
  };
  const ap = actions.reduce(
    (total, action) => total + actionAP(action.kind),
    0,
  );
  return (
    <section ref={host} className="turn-preview" aria-label="ผลตรวจแผน">
      <div className="turn-preview-heading">
        <div>
          <Check size={18} />
          <b role="status">ตรวจผ่าน · ยังไม่เสียเทิร์น</b>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="ปิดผลตรวจแผน"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </div>
      <ol className="turn-preview-actions" aria-label="ลำดับคำสั่งที่โค้ดจะทำ">
        {actions.map((action, i) => (
          <li key={`${i}-${action.kind}`}>
            <SkillIcon
              hero={before.hero}
              action={action.kind}
              skill={action.skill}
            />
            <span>
              <b>
                {action.kind === "skill"
                  ? getSkill(before.hero, action.skill)?.name
                  : labels[action.kind]}
              </b>
              <small>
                <code>{actionCall(action)}</code> · {actionAP(action.kind)} AP
              </small>
            </span>
          </li>
        ))}
      </ol>
      {forecast.traits.length > 0 && (
        <ul className="forecast-traits" aria-label="พลังอาชีพที่จะทำงาน">
          {forecast.traits.map((message, index) => (
            <li key={index}>{message}</li>
          ))}
        </ul>
      )}
      <div className="turn-preview-vitals">
        <span>
          <small>AP ที่ใช้</small>
          <b>{ap} / 3</b>
        </span>
        <span>
          <small>HP ของคุณ</small>
          <b>
            {before.hp} → {after.hp}
          </b>
        </span>
        <span>
          <small>HP ศัตรู</small>
          <b>
            {before.enemyHp} → {after.enemyHp}
          </b>
        </span>
        <span>
          <small>MP / ยา หลังจบเทิร์น</small>
          <b>
            {after.mp} MP · {after.potions} ขวด
          </b>
        </span>
      </div>
      <p
        className={
          after.status === "lost" ? "forecast-warning" : "forecast-explanation"
        }
      >
        {after.status === "won"
          ? "แผนนี้เอาชนะก่อนศัตรูตอบโต้ได้"
          : after.status === "lost"
            ? "แผนนี้ทำให้ HP หมด ลองปรับการป้องกันหรือใช้ยาก่อนรันจริง"
            : actions.some(
                  (action) =>
                    action.kind === "skill" &&
                    getSkill(before.hero, action.skill)?.stun,
                )
              ? "รวมผลขัดจังหวะแล้ว ศัตรูข้ามการตอบโต้ แต่พิษเดิมยังทำงาน"
              : `รวมผลที่ศัตรูจะ${before.intent.kind === "charge" ? "รวบรวมพลัง" : before.intent.kind === "guard" ? "ตั้งโล่" : "ตอบโต้"}แล้ว`}
      </p>
      <div className="turn-preview-buttons">
        <button type="button" className="btn secondary" onClick={onEdit}>
          <Pencil size={16} />
          แก้ไขโค้ด
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={disabled}
          onClick={onRun}
        >
          <Play size={16} />
          รันแผนนี้
        </button>
      </div>
    </section>
  );
}
