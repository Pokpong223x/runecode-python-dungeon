import { Flame, Shield, Skull, Sparkles, Swords } from "lucide-react";
import { bossPhase } from "../engine";
import type { CombatState } from "../types";
import "./tactics.css";

export function EnemyTactics({
  battle,
  boss,
  playing,
}: {
  battle: CombatState;
  boss: boolean;
  playing: boolean;
}) {
  const { intent, status } = battle;
  const phase = bossPhase(battle.enemyHp, battle.maxEnemyHp);
  const ended = status !== "active" && !playing;
  const Icon = {
    attack: Swords,
    heavy: Flame,
    guard: Shield,
    charge: Sparkles,
    poison: Skull,
  }[intent.kind];
  const advice = {
    attack: "defend() ลดดาเมจจากการโจมตี 65% ในเทิร์นนี้",
    heavy: `ถ้าใช้ defend() จะรับดาเมจจากท่านี้ ${Math.ceil(intent.damage * 0.35)} HP`,
    guard:
      battle.hero === "wizard"
        ? "skill() ของพ่อมดทะลุโล่ได้ ส่วน attack() ถูกลดดาเมจครึ่งหนึ่ง"
        : "โล่ศัตรูลดดาเมจครึ่งหนึ่ง ลองเก็บ MP หรือฟื้น HP ในจังหวะนี้",
    charge: "มีจังหวะฟื้น HP หรือโจมตี แต่พิษที่ติดอยู่ยังทำงาน",
    poison: "defend() ลดแรงโจมตี แต่ไม่กันพิษ 4 HP ต่อเทิร์น",
  }[intent.kind];
  return (
    <section className="enemy-tactics" aria-label="ท่าถัดไปฝั่งศัตรู">
      <div className="tactics-heading">
        <span>
          <Swords size={15} /> ศัตรู
        </span>
        {boss && !ended && (
          <span
            className="boss-phase"
            aria-label={`บอส ช่วงที่ ${phase} จาก 3`}
          >
            <span aria-hidden="true" className="boss-phase-pips">
              {[1, 2, 3].map((step) => (
                <i key={step} data-reached={step <= phase} />
              ))}
            </span>
            ช่วง {phase}/3
          </span>
        )}
      </div>
      <div className={`intent-bar intent-${intent.kind}`}>
        <span className="intent-icon" aria-hidden="true">
          <Icon size={20} />
        </span>
        <div>
          <small>
            {ended
              ? "การต่อสู้จบแล้ว"
              : playing
                ? "ท่าตอบโต้ในเทิร์นนี้"
                : "ท่าถัดไปของศัตรู"}
          </small>
          <b data-testid="enemy-intent">
            {ended
              ? status === "won"
                ? "ศัตรูพ่ายแพ้"
                : "ลองวางแผนใหม่"
              : intent.label}
          </b>
        </div>
      </div>
      <p className="enemy-intent-description">
        {ended
          ? status === "won"
            ? "คุณชนะด้วยการลด HP ศัตรูจนหมดแล้ว"
            : "กลับมาสู้ห้องเดิมได้ทันที โดยเก็บโค้ดและเหรียญไว้"
          : intent.description}
      </p>
      <div className="enemy-response-note">
        <span className="eyebrow">
          {ended ? "การเดินทางของคุณ" : "อ่านจังหวะ"}
        </span>
        <p>
          {ended
            ? "HP และ MP ฟื้นเมื่อเริ่มห้องใหม่"
            : playing
              ? "กำลังแสดงผลเทิร์นที่รันแล้ว รอจบก่อนเลือกแผนถัดไป"
              : advice}
        </p>
      </div>
      {boss && !ended && (
        <p className="boss-phase-note">
          บอสเปลี่ยนลำดับท่าเมื่อ HP ต่ำกว่า 67% และ 34% อ่านท่าที่แสดงทุกเทิร์น
        </p>
      )}
    </section>
  );
}

export function PlayerEffects({ battle }: { battle: CombatState }) {
  if (battle.poison <= 0 || battle.status !== "active") return null;
  return (
    <div className="player-effect" role="status" aria-label="สถานะผู้เล่น">
      <Skull size={18} aria-hidden="true" />
      <div>
        <b>ติดพิษ · 4 HP ต่อเทิร์น · เหลือ {battle.poison} เทิร์น</b>
        <p>
          พิษทำงานหลังศัตรูตอบโต้ แม้ตั้งโล่หรือศัตรูรวบรวมพลัง ยาฟื้น HP
          แต่ไม่ล้างพิษ
        </p>
      </div>
    </div>
  );
}
