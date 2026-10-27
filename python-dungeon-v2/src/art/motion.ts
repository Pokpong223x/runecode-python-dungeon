import type Phaser from "phaser";
import type { CombatEvent, SkillId } from "../types";
import type { ActorKind } from "./pixels";
import type { PixelRig } from "./rig";

type Actor = Phaser.GameObjects.Container;
type G = Phaser.GameObjects.Graphics;
const GOLD = 0xffd479,
  MINT = 0x8df1c9,
  WHITE = 0xfff6d9;

function pixel(
  g: G,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  alpha = 1,
) {
  g.fillStyle(color, alpha).fillRect(Math.round(x), Math.round(y), w, h);
}

function fade(
  scene: Phaser.Scene,
  object: Phaser.GameObjects.Graphics | Phaser.GameObjects.Text,
  duration = 400,
  delay = 0,
) {
  scene.tweens.add({
    targets: object,
    alpha: 0,
    duration,
    delay,
    onComplete: () => object.destroy(),
  });
}

function burst(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: number,
  count = 12,
  radius = 65,
) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const p = scene.add.graphics().setPosition(x, y).setDepth(32);
    pixel(p, -3, -3, i % 3 ? 4 : 7, 4, i % 3 ? color : WHITE);
    scene.tweens.add({
      targets: p,
      x: x + Math.cos(a) * radius * (i % 2 ? 1 : 0.65),
      y: y + Math.sin(a) * radius * 0.7,
      alpha: 0,
      scale: 0.3,
      duration: 380 + i * 14,
      ease: "Cubic.easeOut",
      onComplete: () => p.destroy(),
    });
  }
}

function slash(
  scene: Phaser.Scene,
  x: number,
  y: number,
  reverse = false,
  color = GOLD,
) {
  const g = scene.add
    .graphics()
    .setPosition(x, y)
    .setDepth(31)
    .setScale(reverse ? -1 : 1, 1);
  // Pixel-stepped crescent, with a bright leading edge and a tapered tail.
  for (let i = 0; i < 24; i++) {
    const a = -2 + i * 0.12;
    const radius = 58;
    const thickness = Math.round(Math.sin((i / 24) * Math.PI) * 12) + 2;
    const px = Math.round((Math.cos(a) * radius) / 3) * 3;
    const py = Math.round((Math.sin(a) * radius) / 3) * 3;
    pixel(g, px - thickness / 2, py - 4, thickness, 9, color, 0.9);
    if (i > 4 && i < 20) pixel(g, px + 2, py - 2, 3, 5, WHITE);
  }
  g.setAngle(reverse ? 30 : -30);
  scene.tweens.add({
    targets: g,
    angle: reverse ? -25 : 25,
    duration: 170,
    ease: "Cubic.easeOut",
  });
  fade(scene, g, 190, 65);
}

function shockwave(scene: Phaser.Scene, x: number, y: number, color: number) {
  const g = scene.add.graphics().setPosition(x, y).setDepth(12);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    pixel(g, Math.cos(a) * 45, Math.sin(a) * 13, 10, 3, color, 0.8);
  }
  scene.tweens.add({
    targets: g,
    scaleX: 2.8,
    scaleY: 1.4,
    alpha: 0,
    duration: 400,
    ease: "Cubic.easeOut",
    onComplete: () => g.destroy(),
  });
}

function rushTrail(
  scene: Phaser.Scene,
  from: number,
  to: number,
  y: number,
  color: number,
) {
  const g = scene.add.graphics().setDepth(8);
  const left = Math.min(from, to),
    distance = Math.abs(from - to);
  for (let i = 0; i < 5; i++)
    pixel(
      g,
      left + i * 12,
      y - 20 - i * 14,
      distance * (0.6 + (i % 2) * 0.2),
      2,
      color,
      0.18 + i * 0.025,
    );
  fade(scene, g, 200);
}

export function actionTiming(
  kind: ActorKind,
  event: CombatEvent,
  reduced = false,
) {
  if (reduced) return { contact: 0, duration: 460 };
  if (event.animation === "defeat") return { contact: 0, duration: 1300 };
  if (
    event.animation === "defend" ||
    event.animation === "charge" ||
    event.text.startsWith("+")
  )
    return { contact: 0, duration: 650 };
  const special = event.animation === "skill";
  if (["wizard", "wisp", "lich"].includes(kind))
    return { contact: special ? 600 : 440, duration: special ? 1060 : 820 };
  if (kind === "golem") return { contact: 440, duration: 940 };
  if (kind === "slime") return { contact: 390, duration: 870 };
  if (special)
    return { contact: kind === "adventurer" ? 460 : 340, duration: 950 };
  return { contact: 280, duration: 740 };
}

function shield(
  scene: Phaser.Scene,
  actor: Actor,
  reduced: boolean,
  strong = false,
) {
  const direction = actor.getData("restX") < 400 ? 1 : -1;
  const g = scene.add
    .graphics()
    .setDepth(25)
    .setPosition(actor.x + direction * 48, actor.y - 65);
  for (let row = 0; row < 8; row++) {
    const w = row < 4 ? 36 : 36 - (row - 3) * 7;
    pixel(g, -w / 2, -38 + row * 10, w, 10, strong ? GOLD : MINT, 0.28);
    pixel(g, -w / 2, -38 + row * 10, 3, 10, WHITE, 0.9);
    pixel(g, w / 2 - 3, -38 + row * 10, 3, 10, GOLD, 0.9);
  }
  pixel(g, -3, -27, 6, 39, WHITE);
  pixel(g, -13, -15, 26, 6, WHITE);
  if (!reduced) {
    g.setScale(0.5).setAlpha(0.3);
    scene.tweens.add({
      targets: g,
      scale: 1.12,
      alpha: 1,
      duration: 180,
      ease: "Back.easeOut",
    });
  }
  fade(scene, g, reduced ? 160 : 280, reduced ? 180 : 420);
}

function heal(
  scene: Phaser.Scene,
  actor: Actor,
  reduced: boolean,
  mana = false,
) {
  const color = mana ? 0x68c9f3 : MINT;
  const rune = scene.add
    .graphics()
    .setPosition(actor.x, actor.y - 48)
    .setDepth(25);
  pixel(rune, -5, -24, 10, 48, color);
  pixel(rune, -24, -5, 48, 10, color);
  if (mana) {
    for (const [x, y] of [
      [-20, -20],
      [16, -20],
      [-20, 16],
      [16, 16],
    ])
      pixel(rune, x, y, 4, 4, WHITE);
  }
  if (!reduced) {
    for (let i = 0; i < 9; i++) {
      const p = scene.add
        .graphics()
        .setPosition(actor.x - 50 + i * 12, actor.y - 10)
        .setDepth(23);
      pixel(p, -2, -6, 4, 12, color);
      pixel(p, -6, -2, 12, 4, color);
      scene.tweens.add({
        targets: p,
        y: p.y - 100 - (i % 3) * 14,
        alpha: 0,
        delay: (i % 3) * 65,
        duration: 700,
        ease: "Sine.easeOut",
        onComplete: () => p.destroy(),
      });
    }
    scene.tweens.add({ targets: rune, y: rune.y - 22, duration: 700 });
  }
  fade(scene, rune, reduced ? 250 : 500, 100);
}

function projectile(
  scene: Phaser.Scene,
  actor: Actor,
  opponent: Actor,
  fire: boolean,
  duration: number,
  skill?: SkillId,
) {
  const x = actor.x + (opponent.x > actor.x ? 45 : -45),
    y = actor.y - 75;
  const color =
    skill === "stun"
      ? 0xc6b6ff
      : skill === "burst"
        ? 0xff8f63
        : fire
          ? 0xffb95b
          : actor.getData("artKind") === "lich"
            ? 0xd5a3ff
            : MINT;
  const direction = Math.sign(opponent.x - x);
  const orb = scene.add
    .graphics()
    .setPosition(x, y)
    .setDepth(28)
    .setScale(skill === "burst" ? 1.8 : fire ? 1.4 : 1);
  for (const [w, h, alpha] of [
    [42, 20, 0.12],
    [30, 30, 0.22],
    [22, 22, 1],
  ] as const)
    pixel(orb, -w / 2, -h / 2, w, h, color, alpha);
  pixel(orb, -6, -14, 12, 28, color);
  pixel(orb, -5, -6, 10, 12, WHITE);
  pixel(orb, direction * 10, -6, 5, 12, 0xffe99c);
  for (let i = 1; i <= 6; i++)
    pixel(
      orb,
      -direction * (12 + i * 10),
      -7 + (i % 2) * 5,
      12 - i,
      12 - i,
      color,
      0.8 - i * 0.11,
    );
  scene.tweens.add({
    targets: orb,
    x: opponent.x,
    y: opponent.y - 62,
    duration,
    ease: "Quad.easeIn",
    onComplete: () => {
      orb.destroy();
      burst(
        scene,
        opponent.x,
        opponent.y - 62,
        color,
        fire ? 22 : 12,
        fire ? 105 : 65,
      );
      if (fire) shockwave(scene, opponent.x, opponent.y - 4, color);
    },
  });
}

function reset(scene: Phaser.Scene, actor: Actor) {
  scene.tweens.killTweensOf(actor);
  actor
    .setPosition(actor.getData("restX"), actor.getData("restY"))
    .setAngle(0)
    .setAlpha(1);
}

/** Renderer-only poses. Each attack has anticipation, contact and recovery. */
export function animateAction(
  scene: Phaser.Scene,
  actor: Actor,
  opponent: Actor,
  event: CombatEvent,
  reduced: boolean,
) {
  if (!actor.active) return;
  reset(scene, actor);
  const x = actor.x,
    y = actor.y;
  const direction = x < opponent.getData("restX") ? 1 : -1;
  const kind = actor.getData("artKind") as ActorKind;
  const rig = actor.getData("rig") as PixelRig;
  const timing = actionTiming(kind, event, reduced);
  const healing = event.animation === "skill" && event.text.startsWith("+");
  if (healing) {
    heal(scene, actor, reduced, event.action === "focus");
    if (!reduced) {
      rig.pose("cast", 150);
      scene.time.delayedCall(440, () => rig.pose("idle", 180));
    }
    return;
  }
  if (event.animation === "charge") {
    const interrupted = event.text.startsWith("มึนงง");
    const rune = scene.add
      .graphics()
      .setPosition(x, y - 48)
      .setDepth(23);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      pixel(
        rune,
        Math.cos(a) * (interrupted ? 27 : 48),
        Math.sin(a) * (interrupted ? 10 : 48) - (interrupted ? 50 : 0),
        5,
        5,
        interrupted ? 0xc6b6ff : GOLD,
        0.7,
      );
    }
    if (!reduced) {
      rig.pose(interrupted ? "hurt" : "windup", 220);
      rune.setScale(0.7);
      scene.tweens.add({
        targets: rune,
        angle: interrupted ? 0 : 45,
        scale: 1.18,
        duration: 500,
      });
      scene.time.delayedCall(470, () => rig.pose("idle", 150));
    }
    fade(scene, rune, reduced ? 200 : 180, 400);
    return;
  }
  if (event.animation === "defend") {
    shield(scene, actor, reduced);
    if (!reduced) {
      rig.pose("guard", 140);
      scene.time.delayedCall(440, () => rig.pose("idle", 160));
      scene.tweens.add({
        targets: actor,
        x: x - direction * 9,
        angle: -direction * 3,
        duration: 160,
        yoyo: true,
        hold: 220,
        ease: "Sine.easeOut",
      });
    }
    return;
  }
  if (reduced) {
    const fx = scene.add.graphics().setDepth(25);
    pixel(fx, opponent.x - 22, opponent.y - 84, 44, 4, GOLD);
    pixel(fx, opponent.x - 2, opponent.y - 104, 4, 44, WHITE);
    fade(scene, fx, 180, 120);
    return;
  }
  const magic = kind === "wizard" || kind === "wisp" || kind === "lich";
  const special = event.animation === "skill";
  if (magic) {
    rig.pose("cast", special ? 250 : 150);
    const charge = special ? 340 : 210;
    scene.tweens.add({
      targets: actor,
      y: y - 12,
      angle: -direction * 4,
      duration: charge,
      yoyo: true,
      hold: 120,
      ease: "Sine.easeOut",
    });
    const rune = scene.add
      .graphics()
      .setPosition(x, y - 60)
      .setDepth(22);
    const tint =
      event.skill === "stun"
        ? 0xc6b6ff
        : event.skill === "burst"
          ? 0xff8f63
          : special
            ? GOLD
            : kind === "lich"
              ? 0xc6a4ef
              : MINT;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      pixel(
        rune,
        Math.cos(a) * (special ? 61 : 43) - 3,
        Math.sin(a) * (special ? 61 : 43) - 3,
        6,
        6,
        tint,
      );
    }
    rune.setScale(0.5).setAlpha(0.3);
    scene.tweens.add({
      targets: rune,
      angle: special ? 110 : 50,
      scale: 1.1,
      alpha: 1,
      duration: charge,
    });
    fade(scene, rune, 190, charge);
    scene.time.delayedCall(charge, () => {
      rig.pose("strike", 90);
      projectile(
        scene,
        actor,
        opponent,
        special && event.skill !== "stun",
        timing.contact - charge,
        event.skill,
      );
    });
    scene.time.delayedCall(timing.duration - 200, () => rig.pose("idle", 180));
    return;
  }
  const contactX =
    (opponent.getData("restX") as number) -
    direction * (kind === "slime" ? 74 : 88);
  const body = actor.getData("body") as Phaser.GameObjects.Container;
  const idle = actor.getData("idle") as Phaser.Tweens.Tween | undefined;
  if (kind === "slime") {
    idle?.pause();
    const sx = body.scaleX,
      sy = body.scaleY;
    scene.tweens.add({
      targets: body,
      scaleX: sx * 1.2,
      scaleY: sy * 0.75,
      duration: 125,
      yoyo: true,
      onComplete: () => idle?.resume(),
    });
  }
  const windup =
    kind === "golem" ? 300 : special && kind === "knight" ? 160 : 130;
  const travel =
    kind === "slime"
      ? 260
      : kind === "golem"
        ? 140
        : special && kind === "knight"
          ? 180
          : 150;
  rig.pose("windup", windup);
  // Hold the planted feet during the anticipation, then commit to the strike.
  scene.tweens.add({
    targets: actor,
    x: x - direction * 12,
    angle: -direction * 3,
    duration: windup,
    onComplete: () => {
      rushTrail(scene, x, contactX, y, special ? GOLD : MINT);
      rig.pose("strike", 120);
      scene.tweens.add({
        targets: actor,
        x: contactX,
        angle: direction * 3,
        duration: travel,
        ease: "Cubic.easeIn",
        onUpdate: (tween) => {
          if (kind === "slime" || kind === "spider")
            actor.setY(
              y -
                Math.sin(tween.progress * Math.PI) *
                  (kind === "slime" ? 52 : 25),
            );
        },
        onComplete: () => {
          actor.setY(y);
          if (event.skill === "pierce" || event.skill === "stun") {
            scene.time.delayedCall(
              Math.max(0, timing.contact - windup - travel),
              () => {
                const color = event.skill === "stun" ? 0xc6b6ff : 0x95e1ef;
                if (event.skill === "pierce") {
                  const ray = scene.add.graphics().setDepth(29);
                  pixel(
                    ray,
                    opponent.x - direction * 100,
                    y - 70,
                    direction * 130,
                    5,
                    color,
                  );
                  fade(scene, ray, 180);
                } else shockwave(scene, opponent.x, y - 4, color);
                burst(scene, opponent.x, y - 60, color, 12, 55);
              },
            );
          } else if (special && kind === "knight") {
            shield(scene, actor, false, true);
            burst(scene, opponent.x - direction * 28, y - 54, GOLD, 18, 90);
            shockwave(scene, opponent.x, y - 3, GOLD);
          } else if (kind === "golem") {
            shockwave(scene, opponent.x, y - 3, GOLD);
            burst(scene, opponent.x, y - 8, 0xb6c3ad, 15, 84);
          } else if (kind === "slime" || kind === "spider") {
            burst(
              scene,
              opponent.x,
              y - 48,
              kind === "slime" ? MINT : 0xc6a4ef,
              13,
              60,
            );
          } else {
            slash(scene, opponent.x - direction * 20, y - 65, false, GOLD);
            if (special) {
              (opponent.getData("rig") as PixelRig).hit();
              scene.time.delayedCall(70, () => rig.pose("windup", 85));
              scene.time.delayedCall(180, () => {
                rig.pose("strike", 65);
                slash(scene, opponent.x - direction * 12, y - 65, true, MINT);
              });
            }
          }
          scene.tweens.add({
            targets: actor,
            x,
            y,
            angle: 0,
            delay: special ? 280 : 110,
            duration: 230,
            ease: "Cubic.easeOut",
          });
        },
      });
    },
  });
  // Dust stays on the ground; it never covers the sprites or UI.
  scene.time.delayedCall(windup, () =>
    burst(scene, x - direction * 20, y - 3, 0xa3b69b, 6, 30),
  );
  scene.time.delayedCall(timing.duration - 150, () => rig.pose("idle", 140));
}

export function animateHurt(
  scene: Phaser.Scene,
  actor: Actor,
  reduced: boolean,
) {
  if (!actor.active || actor.getData("fallen")) return;
  const x = actor.getData("restX") as number,
    direction = x < 400 ? 1 : -1;
  if (reduced) return;
  scene.tweens.killTweensOf(actor);
  const rig = actor.getData("rig") as PixelRig;
  rig.pose("hurt", 60);
  rig.hit();
  burst(scene, x, actor.y - 60, 0xffcf9b, 9, 46);
  scene.cameras.main.shake(95, 0.002, true);
  scene.tweens.add({
    targets: actor,
    x: x - direction * 14,
    angle: -direction * 5,
    duration: 120,
    yoyo: true,
    ease: "Quad.easeOut",
    onComplete: () => {
      actor.setX(x).setAngle(0).setAlpha(1);
      rig.pose("idle", 130);
    },
  });
}

export function floatText(
  scene: Phaser.Scene,
  actor: Actor,
  message: string,
  reduced: boolean,
) {
  if (!message || message === "VICTORY") return;
  const healing = message.startsWith("+");
  const label = scene.add
    .text(actor.getData("restX"), actor.getData("restY") - 132, message, {
      fontFamily: '"Chakra Petch", sans-serif',
      fontSize: "25px",
      fontStyle: "bold",
      color: healing
        ? message.endsWith("MP")
          ? "#68c9f3"
          : "#9ff1c6"
        : message.startsWith("−")
          ? "#ffe1a5"
          : "#fff6d9",
      stroke: "#102c32",
      strokeThickness: 6,
    })
    .setOrigin(0.5)
    .setDepth(40);
  if (!reduced) {
    label.setScale(0.7);
    scene.tweens.add({
      targets: label,
      scale: 1.15,
      duration: 130,
      yoyo: true,
      hold: 70,
    });
    scene.tweens.add({
      targets: label,
      y: label.y - 34,
      duration: 800,
      ease: "Sine.easeOut",
    });
  }
  fade(scene, label, reduced ? 160 : 300, reduced ? 260 : 550);
}

export function animateDefeat(
  scene: Phaser.Scene,
  actor: Actor,
  winner: Actor,
  victory: boolean,
  reduced: boolean,
) {
  reset(scene, actor);
  actor.setData("fallen", true);
  const idle = actor.getData("idle") as Phaser.Tweens.Tween | undefined;
  idle?.stop();
  const rig = actor.getData("rig") as PixelRig;
  if (!reduced) rig.pose("hurt", 120);
  rig.fall();
  if (reduced) actor.setAlpha(0.25);
  else {
    burst(scene, actor.x, actor.y - 52, victory ? MINT : GOLD, 24, 110);
    scene.tweens.add({
      targets: actor,
      alpha: 0.12,
      y: actor.y + 18,
      angle: actor.x < 400 ? -14 : 14,
      duration: 480,
      ease: "Quad.easeIn",
    });
  }
  if (!victory) return;
  const banner = scene.add
    .text(400, 110, "VICTORY", {
      fontFamily: "monospace",
      fontSize: "38px",
      fontStyle: "bold",
      color: "#ffe1a5",
      stroke: "#102c32",
      strokeThickness: 8,
      letterSpacing: 7,
    })
    .setOrigin(0.5)
    .setDepth(45);
  if (!reduced) {
    banner.setScale(0.65).setAlpha(0);
    scene.tweens.add({
      targets: banner,
      scale: 1,
      alpha: 1,
      duration: 380,
      ease: "Back.easeOut",
    });
    reset(scene, winner);
    (winner.getData("rig") as PixelRig).pose("cheer", 180);
    scene.tweens.add({
      targets: winner,
      y: winner.y - 22,
      duration: 210,
      yoyo: true,
      repeat: 1,
      repeatDelay: 80,
      ease: "Sine.easeOut",
    });
    for (let i = 0; i < 32; i++) {
      const x = 110 + ((i * 79) % 580);
      const p = scene.add
        .graphics()
        .setPosition(x, 40 - (i % 5) * 16)
        .setDepth(35);
      pixel(p, 0, 0, i % 2 ? 4 : 7, 5, i % 3 ? GOLD : MINT);
      scene.tweens.add({
        targets: p,
        x: x + (i % 2 ? 42 : -42),
        y: 350,
        angle: i % 2 ? 190 : -190,
        alpha: 0,
        delay: (i % 4) * 90,
        duration: 1600 + i * 15,
        ease: "Quad.easeIn",
        onComplete: () => p.destroy(),
      });
    }
  }
  fade(scene, banner, reduced ? 180 : 400, reduced ? 700 : 1700);
}

/** The event queue belongs to this disposable view, never to the combat engine. */
export function createBattleTimeline(
  scene: Phaser.Scene,
  player: Actor,
  enemy: Actor,
  reduced: boolean,
  onBusy: (busy: boolean) => void,
  onBeat?: (event: CombatEvent, impact: boolean, source?: CombatEvent) => void,
) {
  const batches: CombatEvent[][] = [];
  let running = false;
  let disposed = false;
  function playNext() {
    if (disposed) return;
    const events = batches.shift();
    if (!events) {
      running = false;
      onBusy(false);
      return;
    }
    running = true;
    onBusy(true);
    let cursor = 0;
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const actor = event.target === "hero" ? player : enemy;
      const opponent = event.target === "hero" ? enemy : player;
      const next = events[i + 1];
      const attack =
        (event.animation === "attack" || event.animation === "skill") &&
        !event.text.startsWith("+");
      const paired =
        next?.animation === "hurt" && next.target !== event.target && attack;
      const timing = actionTiming(actor.getData("artKind"), event, reduced);
      scene.time.delayedCall(cursor, () => {
        if (disposed) return;
        onBeat?.(event, false);
        if (event.animation === "defeat")
          animateDefeat(
            scene,
            actor,
            opponent,
            event.target === "enemy",
            reduced,
          );
        else if (event.animation === "hurt") animateHurt(scene, actor, reduced);
        else animateAction(scene, actor, opponent, event, reduced);
        floatText(scene, actor, event.text, reduced);
      });
      if (paired) {
        scene.time.delayedCall(cursor + timing.contact, () => {
          if (disposed) return;
          onBeat?.(next, true, event);
          animateHurt(scene, opponent, reduced);
          floatText(scene, opponent, next.text, reduced);
        });
        i++;
      }
      cursor += timing.duration;
    }
    scene.time.delayedCall(cursor, playNext);
  }
  return {
    enqueue(events: CombatEvent[]) {
      if (!events.length || disposed) return;
      batches.push(events);
      if (!running) playNext();
    },
    dispose() {
      disposed = true;
      batches.length = 0;
    },
  };
}
