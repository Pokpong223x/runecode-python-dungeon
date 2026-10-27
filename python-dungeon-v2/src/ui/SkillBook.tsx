import { useEffect, useState } from "react";
import { ArrowDownToLine, Check, FlaskConical, Sparkles } from "lucide-react";
import { encounterById, HEROES } from "../content";
import {
  FOCUS_MP,
  getSkill,
  HERO_SKILLS,
  skillCommand,
  starterActionCall,
} from "../skills";
import { resolveTurn } from "../engine";
import type {
  ActionKind,
  CombatState,
  OffensiveAction,
  SkillId,
} from "../types";
import type { OffenseMode } from "./offenseCode";
import { SkillIcon } from "./SkillIcon";
import { HeroTrait } from "./HeroTrait";
import "./skills.css";

export function SkillBook({
  battle,
  onInsert,
  offenseMode,
  offenseSkill,
  onChooseOffense,
  disabled,
  variant = "dialog",
}: {
  battle: CombatState;
  onInsert: (action: ActionKind, skill?: SkillId) => void;
  offenseMode: OffenseMode;
  offenseSkill: SkillId | "mixed";
  onChooseOffense: (action: OffensiveAction, skill?: SkillId) => void;
  disabled: boolean;
  variant?: "dialog" | "player";
}) {
  const [selected, setSelected] = useState<string>(
    offenseMode === "skill" && offenseSkill !== "mixed"
      ? offenseSkill
      : "attack",
  );
  useEffect(() => {
    if (offenseMode === "attack") setSelected("attack");
    if (offenseMode === "skill" && offenseSkill !== "mixed")
      setSelected(offenseSkill);
  }, [offenseMode, offenseSkill]);
  const hero = HEROES[battle.hero];
  const sourceExercise =
    encounterById(battle.encounterId).contract.sourceExercise !== undefined;
  const abilities = [
    {
      key: "attack",
      kind: "attack" as ActionKind,
      skill: undefined,
      name: "โจมตีปกติ",
      label: "ท่าพื้นฐาน",
      command: "attack",
      cost: "1 AP",
      description: sourceExercise
        ? "โจมตีด้วยอาวุธ ไม่ใช้ MP ห้องนี้ออกท่าโจมตีหนึ่งครั้งตามโจทย์ และใช้ร่วมกับสกิลในเทิร์นเดียวกันไม่ได้"
        : "โจมตีด้วยอาวุธ ไม่ใช้ MP ใช้ซ้ำได้ภายใน 3 AP แต่ใช้ร่วมกับสกิลในเทิร์นเดียวกันไม่ได้",
      unavailable: "",
    },
    ...HERO_SKILLS[battle.hero].map((skill) => ({
      key: skill.id,
      kind: "skill" as ActionKind,
      skill: skill.id,
      name: skill.name,
      label: "สกิลอาชีพ",
      command: skillCommand(skill.id),
      cost: `2 AP · ${skill.mp} MP`,
      description: skill.description,
      unavailable:
        battle.mp < skill.mp ? `MP ไม่พอ ต้องมีอย่างน้อย ${skill.mp} MP` : "",
    })),
    {
      key: "defend",
      kind: "defend" as ActionKind,
      skill: undefined,
      name: "ป้องกัน",
      label: "คำสั่งเสริม",
      command: "defend",
      cost: "1 AP",
      description:
        "ลดดาเมจโจมตี 65% ในเทิร์นนี้ การป้องกันซ้ำไม่เพิ่มผล และไม่ลดดาเมจพิษ",
      unavailable: "",
    },
    {
      key: "heal",
      kind: "heal" as ActionKind,
      skill: undefined,
      name: "ใช้ยา",
      label: "ฟื้นพลัง",
      command: "heal",
      cost: "1 AP · ยา 1 ขวด",
      description: "ใช้ยาฟื้นพลังชีวิตสูงสุด 35 HP โดยไม่เกินพลังชีวิตเต็ม",
      unavailable:
        battle.potions < 1
          ? "ยาหมดแล้ว ซื้อเพิ่มที่ร้านค้าเพื่อใช้เมื่อเริ่มห้องใหม่"
          : battle.hp === battle.maxHp
            ? "HP เต็มแล้ว เก็บยาไว้ใช้เมื่อบาดเจ็บ"
            : "",
    },
    {
      key: "focus",
      kind: "focus" as ActionKind,
      skill: undefined,
      name: "ตั้งสมาธิ",
      label: "ฟื้นมานา",
      command: "focus",
      cost: `1 AP · +${FOCUS_MP} MP · 1 ครั้ง/เทิร์น`,
      description: `ฟื้นสูงสุด ${FOCUS_MP} MP โดยไม่เกินมานาเต็ม ใช้ได้หนึ่งครั้งต่อเทิร์น และไม่ได้ป้องกัน หาก MP เต็มให้วางหลังสกิล หาก MP ไม่พอให้วางก่อนสกิลในโค้ด หรือฟื้นไว้ใช้เทิร์นหน้า`,
      unavailable: battle.maxMp < 1 ? "ไม่มี MP สูงสุดสำหรับฟื้นมานา" : "",
    },
  ];
  const ability = abilities.find((a) => a.key === selected) ?? abilities[0];
  const preview = resolveTurn(battle, [
    {
      kind: ability.kind,
      ...(ability.skill && ability.skill !== "class"
        ? { skill: ability.skill }
        : {}),
    },
  ]);
  const impact = preview.events.find(
    (event) => event.target === "enemy" && event.animation === "hurt",
  );
  const healing = preview.events.find((event) => event.action === "heal");
  const damage = impact?.vitals ? battle.enemyHp - impact.vitals.enemyHp : 0;
  const healed = healing?.vitals ? healing.vitals.hp - battle.hp : 0;
  const effect =
    ability.kind === "attack" || ability.kind === "skill"
      ? `ตัวอย่างพลัง 1 · สร้าง ${damage} ดาเมจ${battle.intent.kind === "guard" && !(ability.kind === "skill" && getSkill(battle.hero, ability.skill)?.pierce) ? " · คิดผลโล่ศัตรูแล้ว" : ""}`
      : ability.kind === "defend"
        ? "ลดดาเมจโจมตี 65%"
        : ability.kind === "focus"
          ? battle.mp === battle.maxMp
            ? `MP เต็มตอนนี้ · วางหลังสกิลเพื่อฟื้นสูงสุด ${FOCUS_MP} MP`
            : `ฟื้นได้สูงสุด ${Math.min(FOCUS_MP, battle.maxMp - battle.mp)} MP · 1 ครั้ง/เทิร์น`
          : `ฟื้น ${healed} HP`;
  const blocked = disabled || battle.status !== "active";
  const command = starterActionCall(ability.kind, ability.skill);
  const offensive = ability.kind === "attack" || ability.kind === "skill";
  const choices = (
    <>
      <HeroTrait hero={battle.hero} sourceExercise={sourceExercise} />
      <p className="skill-mode-label">ท่าโจมตี · เลือกหนึ่งแบบต่อเทิร์น</p>
      <p
        className="skill-mode-help"
        role="status"
        data-offense-mode={offenseMode}
      >
        {offenseMode === "mixed" ||
        (offenseMode === "skill" && offenseSkill === "mixed")
          ? "โค้ดมีหลายท่า เลือกหนึ่งท่าเพื่อเปลี่ยนคำสั่งให้ตรงกัน"
          : offenseMode === "none"
            ? "เลือกท่าเพื่อเพิ่มคำสั่งในโค้ดอัตโนมัติ"
            : `โค้ดใช้คำสั่ง ${offenseMode === "skill" ? skillCommand(offenseSkill === "mixed" ? "class" : offenseSkill) : "attack"} · กดอีกท่าเพื่อเปลี่ยนชื่อคำสั่ง โดยเก็บค่าพลังในวงเล็บไว้`}
        {offenseMode === "skill" && (
          <span>
            สกิลใช้ได้ 1 ครั้งต่อเทิร์น · เหลือ 1 AP สำหรับป้องกัน ยา หรือฟื้น
            MP
          </span>
        )}
      </p>
      <p className="skill-mode-help">
        ใส่พลัง 1–3 ในวงเล็บได้ เช่น <code>attack(2)</code> หรือ{" "}
        <code>skill(3)</code> ·{" "}
        {sourceExercise
          ? "ห้องนี้ระบุค่าพลังตามโจทย์และออกท่าโจมตีหนึ่งครั้ง"
          : "ไม่ใส่ค่าจะใช้พลัง 1"}
        พลังเพิ่มดาเมจแต่ไม่เพิ่ม AP หรือ MP ที่ใช้
        กดตรวจแผนเพื่อดูผลของโค้ดที่เขียนจริง
      </p>
      {(["offense", "support"] as const).map((group) => (
        <div key={group}>
          {group === "support" && (
            <p className="skill-mode-label">
              คำสั่งเสริม · ใช้ร่วมกับท่าโจมตีได้
            </p>
          )}
          <div
            className={`skill-choices skill-choices-${group}`}
            role="group"
            aria-label={
              group === "offense" ? "เลือกท่าโจมตี" : "เลือกคำสั่งเสริม"
            }
          >
            {abilities
              .filter((a) =>
                group === "offense"
                  ? a.kind === "attack" || a.kind === "skill"
                  : a.kind !== "attack" && a.kind !== "skill",
              )
              .map((a) => {
                const pressed =
                  a.kind === "attack"
                    ? offenseMode === "attack"
                    : a.kind === "skill"
                      ? offenseMode === "skill" && offenseSkill === a.skill
                      : selected === a.key;
                return (
                  <button
                    type="button"
                    key={a.key}
                    className={`skill-choice${a.kind === "focus" ? " skill-choice-focus" : ""}`}
                    aria-pressed={pressed}
                    disabled={
                      blocked || (a.kind === "skill" && !!a.unavailable)
                    }
                    aria-description={a.unavailable || undefined}
                    onClick={(event) => {
                      event.currentTarget.focus({ preventScroll: true });
                      setSelected(a.key);
                      if (a.kind === "attack" || a.kind === "skill")
                        onChooseOffense(a.kind, a.skill);
                    }}
                  >
                    <span className="skill-choice-top">
                      <SkillIcon
                        action={a.kind}
                        hero={battle.hero}
                        skill={a.skill}
                      />
                      <span>{pressed && <Check size={17} />}</span>
                    </span>
                    <b>{a.name}</b>
                    <code>{starterActionCall(a.kind, a.skill)}</code>
                    <small>{a.cost}</small>
                    {a.kind === "skill" && (
                      <span className="skill-trait">
                        {getSkill(battle.hero, a.skill)?.stun
                          ? "หยุดตอบโต้"
                          : getSkill(battle.hero, a.skill)?.pierce
                            ? "ทะลุโล่"
                            : getSkill(battle.hero, a.skill)?.guard
                              ? "ตั้งรับด้วย"
                              : "ดาเมจแรง"}
                      </span>
                    )}
                    {a.unavailable && (
                      <span className="skill-unavailable">
                        {a.kind === "skill"
                          ? "MP ไม่พอ"
                          : a.kind === "focus"
                            ? "ไม่มีมานา"
                            : battle.potions < 1
                              ? "ยาหมด"
                              : "HP เต็ม"}
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </>
  );
  const insert = (
    <button
      type="button"
      className={`btn primary ${variant === "player" ? "player-skill-insert" : ""}`}
      disabled={blocked || !!ability.unavailable}
      onClick={() => onInsert(ability.kind, ability.skill)}
    >
      <ArrowDownToLine size={15} />
      {offensive ? "เขียนโค้ดด้วย" : "แทรก"} {command}
    </button>
  );
  if (variant === "player")
    return (
      <div className="skill-book skill-book-player">
        {choices}
        <div
          className={`player-skill-feedback ${ability.unavailable ? "skill-warning" : ""}`}
          role="status"
          aria-live="polite"
        >
          <div>
            <b>{ability.unavailable || effect}</b>
            {!ability.unavailable &&
              (ability.kind === "skill" || ability.kind === "focus") && (
                <p className="player-skill-description">
                  {ability.description}
                </p>
              )}
          </div>
        </div>
        {insert}
      </div>
    );
  return (
    <div className="skill-book">
      <div className="skill-book-status">
        <div>
          <span className="eyebrow">{hero.name}</span>
          <b>เลือกท่าของคุณ</b>
        </div>
        <div className="skill-balance">
          <span>
            <Sparkles size={15} /> {battle.mp} MP
          </span>
          <span>
            <FlaskConical size={15} /> {battle.potions} ขวด
          </span>
        </div>
      </div>
      <p className="skill-instructions">
        เลือกโจมตีปกติหรือสกิลหนึ่งท่าเพื่อเปลี่ยนโค้ดทันที
        ป้องกันหรือยาใช้เสริมได้ รวมไม่เกิน 3 AP ทุกสกิลใช้ 2 AP และใช้ MP
        ตามที่แสดง
      </p>
      {choices}
      <section
        className={`skill-detail skill-detail-${ability.kind}`}
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="skill-detail-heading">
          <span className="skill-emblem">
            <SkillIcon
              action={ability.kind}
              hero={battle.hero}
              skill={ability.skill}
            />
          </span>
          <div>
            <small>{ability.label}</small>
            <h3>{ability.name}</h3>
          </div>
          <span className="skill-cost">{ability.cost}</span>
        </div>
        <p>{ability.description}</p>
        {ability.unavailable ? (
          <p className="skill-warning">{ability.unavailable}</p>
        ) : (
          <strong className="skill-effect">{effect}</strong>
        )}
        <div className="skill-code-preview">
          <span>คำสั่ง Python</span>
          <code>{command}</code>
        </div>
      </section>
      <div className="skill-book-footer">
        <span>
          {offensive ? "เปลี่ยนโค้ดตามท่าที่เลือก" : "แทรกในบรรทัดถัดไป"}
          <br />
          <small>ยังไม่เสียเทิร์นหรือทรัพยากร</small>
        </span>
        {insert}
      </div>
      {blocked && (
        <p className="skill-warning" role="status">
          รอจบการต่อสู้ในเทิร์นนี้ก่อนเลือกใช้สกิล
        </p>
      )}
    </div>
  );
}
