import {
  ArrowRight,
  BookOpen,
  Download,
  Flag,
  Star,
  Swords,
} from "lucide-react";
import { ENCOUNTERS, HEROES } from "../content";
import type { SaveGameV1 } from "../types";
import { SkillIcon } from "./SkillIcon";
import "./journey.css";

export function CampaignSummary({
  save,
  disabled,
  onJournal,
  onExport,
  onReplay,
}: {
  save: SaveGameV1;
  disabled: boolean;
  onJournal: (trigger: HTMLButtonElement) => void;
  onExport: () => void;
  onReplay: (id: string) => void;
}) {
  if (!save.hero || !ENCOUNTERS.every((e) => save.completed.includes(e.id)))
    return null;
  const stars = ENCOUNTERS.reduce(
    (total, e) => total + (save.stars[e.id] ?? 0),
    0,
  );
  const nextPractice =
    ENCOUNTERS.find((e) => (save.stars[e.id] ?? 0) < 3) ?? ENCOUNTERS[0];
  return (
    <section className="campaign-summary" aria-label="บทสรุปการผจญภัย">
      <div className="campaign-title">
        <SkillIcon hero={save.hero} action="skill" />
        <div>
          <span className="eyebrow">YOUR PYTHON CHRONICLES</span>
          <h2>คาถาบทใหม่ เริ่มจากสิ่งที่คุณเรียนรู้</h2>
          <p>
            {HEROES[save.hero].name}ของคุณผ่านทั้ง 6 ดินแดนแล้ว
            ตั้งแต่คำสั่งแรกจนถึงการสร้าง object
          </p>
        </div>
      </div>
      <ul className="campaign-milestones" aria-label="ผลงานของคุณ">
        <li>
          <Flag size={18} aria-hidden="true" />
          <b>24 / 24</b>
          <span>ห้องที่พิชิต</span>
        </li>
        <li>
          <Swords size={18} aria-hidden="true" />
          <b>6 / 6</b>
          <span>บอสที่เอาชนะ</span>
        </li>
        <li>
          <Star size={18} aria-hidden="true" />
          <b>{stars} / 72</b>
          <span>ดาวสถิติดีที่สุด</span>
        </li>
      </ul>
      <p className="campaign-next">
        กลับไปปรับแผนเพื่อเพิ่มดาวได้ สถิติเดิมไม่ลดลง
        เหรียญรางวัลรับได้ครั้งแรกเท่านั้น
      </p>
      <div className="campaign-actions">
        <button
          type="button"
          className="btn primary"
          disabled={disabled}
          onClick={() => onReplay(nextPractice.id)}
        >
          {stars < 72 ? "ฝึกเก็บดาว" : "ฝึกคาถาอีกครั้ง"}
          <ArrowRight size={17} />
        </button>
        <button
          type="button"
          className="btn secondary"
          onClick={(event) => onJournal(event.currentTarget)}
        >
          <BookOpen size={17} />
          เปิดสมุดบทเรียน
        </button>
        <button type="button" className="btn ghost" onClick={onExport}>
          <Download size={17} />
          ส่งออกบันทึก
        </button>
      </div>
      <small className="campaign-practice">
        ห้องแนะนำ: {nextPractice.title}
      </small>
    </section>
  );
}
