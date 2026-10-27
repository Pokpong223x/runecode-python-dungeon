import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { drawBackdrop, createActor } from "../art/pixels";
import { createBattleTimeline } from "../art/motion";
import type { CombatEvent, EncounterDefinition, HeroId } from "../types";
import { HEROES } from "../content";
import { actionCall, getSkill } from "../skills";
import { HERO_TRAITS } from "../heroTraits";
const EMPTY_EVENTS: CombatEvent[] = [];
export function Scene({
  chapter = 1,
  hero = "adventurer",
  enemy = "slime",
  boss = false,
  reduced = false,
  events = EMPTY_EVENTS,
  status = "active",
  enemyName = "ศัตรู",
  onPlayback,
  onBeat,
}: {
  chapter?: number;
  hero?: HeroId;
  enemy?: EncounterDefinition["enemyKind"];
  boss?: boolean;
  reduced?: boolean;
  events?: CombatEvent[];
  status?: "active" | "won" | "lost";
  enemyName?: string;
  onPlayback?: (busy: boolean) => void;
  onBeat?: (event: CombatEvent, impact: boolean, source?: CombatEvent) => void;
}) {
  const [cue, setCue] = useState<{
    label: string;
    detail: string;
    tone: string;
  } | null>(null);
  const host = useRef<HTMLDivElement>(null),
    handler = useRef<((events: CombatEvent[]) => void) | null>(null),
    latest = useRef(events),
    delivered = useRef<CombatEvent[] | null>(null),
    currentStatus = useRef(status);
  const callbacks = useRef({ onPlayback, onBeat, enemyName });
  callbacks.current = { onPlayback, onBeat, enemyName };
  latest.current = events;
  currentStatus.current = status;
  useEffect(() => {
    if (!host.current) return;
    setCue(null);
    const element = host.current;
    let timeline: ReturnType<typeof createBattleTimeline> | undefined;
    class Diorama extends Phaser.Scene {
      constructor() {
        super("diorama");
      }
      create() {
        this.registry.set("reducedMotion", reduced);
        drawBackdrop(this, chapter, 800, 450);
        const player = createActor(this, hero, 210, 344, 4.1),
          monster = createActor(this, enemy, 610, 344, boss ? 4.7 : 3.8, boss);
        timeline = createBattleTimeline(
          this,
          player,
          monster,
          reduced,
          (busy) => {
            element.setAttribute("aria-busy", String(busy));
            callbacks.current.onPlayback?.(busy);
            if (!busy) setCue(null);
          },
          (event, impact, source) => {
            callbacks.current.onBeat?.(event, impact, source);
            if (impact) {
              if (event.trait)
                setCue({
                  label: HERO_TRAITS[event.trait.hero].name,
                  detail: event.trait.text,
                  tone: event.trait.hero === "knight" ? "focus" : "hero",
                });
              return;
            }
            const healing = event.text.startsWith("+");
            const victory =
              event.animation === "defeat" && event.target === "enemy";
            const action =
              event.action === "focus"
                ? "ตั้งสมาธิ · ฟื้น MP"
                : event.animation === "skill"
                  ? healing
                    ? "ฟื้นฟูพลัง"
                    : (getSkill(hero, event.skill)?.name ?? HEROES[hero].skill)
                  : event.animation === "charge"
                    ? event.text.startsWith("มึนงง")
                      ? "ขัดจังหวะสำเร็จ"
                      : "รวบรวมพลัง"
                    : event.animation === "defend"
                      ? "ตั้งรับ"
                      : event.animation === "defeat"
                        ? "พักแล้วลองใหม่"
                        : "โจมตี";
            setCue({
              label: victory ? "พิชิตห้องสำเร็จ" : action,
              detail: victory
                ? "ทุกบรรทัดคือพลังของคุณ"
                : event.trait
                  ? event.trait.text
                  : event.target === "enemy"
                    ? `${callbacks.current.enemyName} · ${event.text.startsWith("มึนงง") ? "ข้ามการตอบโต้" : event.animation === "charge" ? "เตรียมท่าถัดไป" : "ตอบโต้"}`
                    : event.action
                      ? `${actionCall({ kind: event.action, skill: event.skill, power: event.power })} · ${event.action === "skill" ? 2 : 1} AP`
                      : "รับมือศัตรู",
              tone: victory
                ? "victory"
                : event.action === "focus"
                  ? "focus"
                  : healing
                    ? "heal"
                    : event.target,
            });
          },
        );
        // Rebuilding for motion preferences must not replay a committed turn.
        if (delivered.current === latest.current || !latest.current.length) {
          if (currentStatus.current === "won") {
            monster.setAlpha(0.25).setData("fallen", true);
            monster.getData("rig").fall();
            monster.getData("idle")?.stop();
          }
          if (currentStatus.current === "lost") {
            player.setAlpha(0.25).setData("fallen", true);
            player.getData("rig").fall();
            player.getData("idle")?.stop();
          }
        }
        handler.current = (events) => {
          if (delivered.current === events) return;
          delivered.current = events;
          timeline?.enqueue(events);
        };
        handler.current(latest.current);
      }
    }
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      width: 800,
      height: 450,
      pixelArt: true,
      backgroundColor: "#193e45",
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: Diorama,
      audio: { noAudio: true },
      render: { antialias: false },
      fps: { target: 30 },
    });
    return () => {
      handler.current = null;
      timeline?.dispose();
      element.setAttribute("aria-busy", "false");
      callbacks.current.onPlayback?.(false);
      game.destroy(true);
    };
  }, [chapter, hero, enemy, boss, reduced]);
  useEffect(() => {
    if (events.length) handler.current?.(events);
  }, [events]);
  return (
    <div className={`scene-frame${reduced ? " motion-reduced" : ""}`}>
      <div
        className="pixel-scene"
        ref={host}
        role="img"
        aria-busy="false"
        aria-label={`ฉากพิกเซล ${chapter} ${boss ? "บอส" : "การผจญภัย"}`}
      />
      {cue && (
        <div className={`scene-cue cue-${cue.tone}`} aria-hidden="true">
          <span className="cue-rune">
            {cue.tone === "victory"
              ? "✦"
              : cue.tone === "heal"
                ? "+"
                : cue.tone === "enemy"
                  ? "!"
                  : "◆"}
          </span>
          <div>
            <strong>{cue.label}</strong>
            <small>{cue.detail}</small>
          </div>
        </div>
      )}
    </div>
  );
}
