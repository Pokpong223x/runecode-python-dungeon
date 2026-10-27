import type { ActorKind } from "./pixels";

export const POSES = [
  "idle",
  "windup",
  "strike",
  "recover",
  "guard",
  "cast",
  "hurt",
  "cheer",
] as const;
export type Pose = (typeof POSES)[number];
export type PoseState = {
  fu: number;
  fl: number;
  bu: number;
  bl: number;
  blade: number;
  lt: number;
  rt: number;
};
export type Pixel = { x: number; y: number; color: string };
type Point = { x: number; y: number };

const poses: Record<Pose, PoseState> = {
  idle: { fu: 20, fl: 20, bu: -15, bl: -10, blade: 35, lt: -5, rt: 5 },
  windup: { fu: -40, fl: -145, bu: -30, bl: -35, blade: -35, lt: -14, rt: 18 },
  strike: { fu: 80, fl: 70, bu: -50, bl: -25, blade: 95, lt: -22, rt: 28 },
  recover: { fu: 45, fl: 30, bu: -20, bl: -15, blade: 65, lt: -10, rt: 14 },
  guard: { fu: 35, fl: -100, bu: -15, bl: 95, blade: 10, lt: -10, rt: 14 },
  cast: { fu: 75, fl: 35, bu: -40, bl: -70, blade: 15, lt: -7, rt: 9 },
  hurt: { fu: 10, fl: 50, bu: -40, bl: -25, blade: -15, lt: 5, rt: -8 },
  cheer: { fu: 135, fl: 155, bu: -135, bl: -155, blade: 0, lt: -12, rt: 16 },
};

export function poseFor(kind: ActorKind, name: Pose): PoseState {
  const pose = { ...poses[name] };
  if (kind === "wizard" || kind === "lich") {
    pose.blade = name === "strike" ? 45 : name === "windup" ? -15 : 10;
    pose.lt *= 0.35;
    pose.rt *= 0.35;
  }
  if (kind === "knight" && ["windup", "strike", "guard"].includes(name)) {
    pose.bu = name === "strike" ? 90 : 25;
    pose.bl = name === "strike" ? 75 : 85;
  }
  if (kind === "golem") {
    if (name === "windup") {
      pose.fu = 145;
      pose.fl = 165;
      pose.bu = -145;
      pose.bl = -165;
    }
    if (name === "strike") {
      pose.fu = 55;
      pose.fl = 25;
      pose.bu = -55;
      pose.bl = -25;
    }
  }
  return pose;
}

export function interpolatePose(
  from: PoseState,
  to: PoseState,
  t: number,
): PoseState {
  return Object.fromEntries(
    Object.keys(from).map((key) => {
      const k = key as keyof PoseState;
      return [k, from[k] + (to[k] - from[k]) * t];
    }),
  ) as PoseState;
}

const rad = Math.PI / 180;
function end(p: Point, angle: number, length: number): Point {
  return {
    x: p.x + Math.sin(angle * rad) * length,
    y: p.y + Math.cos(angle * rad) * length,
  };
}

/** Whole-frame pixel composition. Limbs grow from their joints; no source cutouts rotate away. */
export function composePose(
  kind: ActorKind,
  rows: string[],
  state: PoseState,
  blink = false,
): { pixels: Pixel[]; anchors: Record<string, Point> } {
  const pixels = new Map<string, Pixel>();
  const anchors: Record<string, Point> = {};
  const h = rows.length;
  const put = (x: number, y: number, color: string) => {
    x = Math.round(x);
    y = Math.round(y);
    pixels.set(`${x},${y}`, { x, y, color });
  };
  const box = (
    x: number,
    y: number,
    w: number,
    height: number,
    color: string,
  ) => {
    for (let yy = 0; yy < height; yy++)
      for (let xx = 0; xx < w; xx++) put(x + xx, y + yy, color);
  };
  const disk = (p: Point, radius: number, color: string) => {
    const r = Math.ceil(radius);
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++)
        if (x * x + y * y <= radius * radius + 0.5)
          put(p.x + x, p.y + y, color);
  };
  const line = (a: Point, b: Point, width: number, color: string) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 3));
    for (let i = 0; i <= n; i++)
      disk(
        { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n },
        (width - 1) / 2,
        color,
      );
  };
  const organic = ["slime", "spider", "wisp"].includes(kind);
  if (organic) {
    rows.forEach((row, y) =>
      [...row].forEach((color, x) => {
        if (color !== ".")
          put(x, y, blink && kind === "slime" && color === "e" ? "k" : color);
      }),
    );
    return { pixels: [...pixels.values()], anchors };
  }

  const wizard = kind === "wizard",
    knight = kind === "knight",
    golem = kind === "golem",
    skeleton = kind === "skeleton",
    lich = kind === "lich";
  const cloth =
    wizard || lich ? "v" : knight ? "s" : golem ? "l" : skeleton ? "w" : "g";
  const skin = golem ? "l" : skeleton || lich ? "w" : knight ? "s" : "t";
  const armWidth = golem ? 5 : skeleton ? 1 : 2;
  const shoulderY = golem ? 9 : wizard ? 16 : lich ? 12 : 13;
  const frontShoulder = {
    x: golem ? 17 : knight ? 16 : wizard || lich ? 15 : 13,
    y: shoulderY,
  };
  const backShoulder = {
    x: golem ? 7 : knight ? 9 : wizard || lich ? 6 : skeleton ? 8 : 6,
    y: shoulderY,
  };
  const upperLength = golem ? 4.5 : skeleton ? 4 : 3.5;
  const lowerLength = golem ? 4.5 : skeleton ? 4 : 3.5;

  function limb(
    a: Point,
    upper: number,
    lower: number,
    width: number,
    upperColor: string,
    lowerColor: string,
    length = upperLength,
    length2 = lowerLength,
  ) {
    const elbow = end(a, upper, length),
      wrist = end(elbow, lower, length2);
    line(a, elbow, width + 2, "o");
    line(elbow, wrist, width + 2, "o");
    line(a, elbow, width, upperColor);
    line(elbow, wrist, width, lowerColor);
    return wrist;
  }
  function leg(side: "left" | "right", x: number, angle: number) {
    const hip = { x, y: wizard ? h - 4 : h - 7 };
    const length = wizard ? 0.9 : 2.3;
    const foot = limb(
      hip,
      angle,
      -angle * 0.4,
      golem ? 4 : skeleton ? 1 : 2,
      knight || golem || skeleton ? cloth : "x",
      knight || golem || skeleton ? cloth : "x",
      length,
      length,
    );
    box(
      foot.x - 1.5,
      Math.min(h - 2, Math.round(foot.y)),
      golem ? 5 : 4,
      2,
      "o",
    );
    box(
      foot.x - 0.5,
      Math.min(h - 2, Math.round(foot.y)),
      golem ? 3 : 2,
      1,
      knight || golem ? cloth : skeleton ? "w" : "n",
    );
    anchors[`${side}Hip`] = hip;
    anchors[`${side}Foot`] = foot;
  }
  // Legs and rear arm extend underneath the complete body core.
  leg("left", knight ? 11 : 8, state.lt);
  leg("right", knight ? 15 : 14, state.rt);
  const backHand = limb(
    backShoulder,
    state.bu,
    state.bl,
    armWidth,
    cloth,
    wizard || lich ? cloth : skin,
  );
  disk(backHand, golem ? 2.5 : 1, skin);

  // Underpainting makes the neck, shoulders and pelvis continuous when a limb changes pose.
  if (kind === "adventurer") {
    box(5, 10, 9, 11, "o");
    box(6, 11, 7, 9, "g");
  }
  if (knight) {
    box(8, 10, 10, 12, "o");
    box(9, 11, 8, 10, "s");
  }
  if (golem) {
    box(7, 7, 11, 14, "o");
    box(8, 8, 9, 12, "l");
  }
  if (lich) box(8, 10, 9, 13, "v");
  if (skeleton) {
    line({ x: 11, y: 8 }, { x: 11, y: h - 6 }, 3, "o");
    line({ x: 11, y: 8 }, { x: 11, y: h - 6 }, 1, "w");
    line({ x: 8, y: h - 7 }, { x: 14, y: h - 7 }, 3, "w");
  }
  function isCore(x: number, y: number) {
    if (wizard)
      return y < 16 ? x < 19 : y < 20 ? x >= 5 && x <= 16 : y < h - 2 && x < 20;
    if (lich) return y < 10 || y >= 18 || (x >= 7 && x <= 17);
    if (golem) return y < 7 || (y < h - 6 && x >= 7 && x <= 17);
    if (knight) return y < 10 || (y < h - 6 && x >= 9 && x <= 17);
    if (skeleton) return y < 10 || (y < h - 6 && x >= 8 && x <= 15);
    return y < 12 || (y < h - 6 && x >= 5 && x <= 13);
  }
  rows.forEach((row, y) =>
    [...row].forEach((color, x) => {
      if (color === "." || !isCore(x, y)) return;
      put(
        x,
        y,
        blink && y < h * 0.58 && color === "e" && !skeleton && !lich
          ? knight
            ? "x"
            : "t"
          : color,
      );
    }),
  );
  // Preserve a neck/hip overlap rather than exposing transparent cut edges.
  const hipY = wizard ? h - 4 : h - 7;
  line(
    { x: knight ? 11 : 8, y: hipY },
    { x: knight ? 15 : 14, y: hipY },
    skeleton ? 1 : 3,
    skeleton ? "w" : wizard || lich ? "v" : knight || golem ? cloth : "x",
  );
  const hand = limb(
    frontShoulder,
    state.fu,
    state.fl,
    armWidth,
    cloth,
    wizard || lich ? cloth : skin,
  );

  function weaponPoint(u: number, v: number): Point {
    const a = state.blade * rad;
    return {
      x: hand.x + Math.cos(a) * u + Math.sin(a) * v,
      y: hand.y + Math.sin(a) * u - Math.cos(a) * v,
    };
  }
  if (kind === "adventurer" || knight) {
    line(weaponPoint(0, -3), weaponPoint(0, 11), 3, "o");
    line(weaponPoint(0, -3), weaponPoint(0, 1), 1, "n");
    line(weaponPoint(0, 2), weaponPoint(0, 10), 2, "s");
    line(weaponPoint(0, 3), weaponPoint(0, 10), 1, "w");
    line(weaponPoint(-2, 1), weaponPoint(2, 1), 1, "q");
    anchors.weaponGrip = hand;
    anchors.weaponTip = weaponPoint(0, 11);
  } else if (wizard) {
    line(weaponPoint(0, -6), weaponPoint(0, 12), 3, "o");
    line(weaponPoint(0, -6), weaponPoint(0, 12), 1, "n");
    const tip = weaponPoint(0, 12);
    disk(tip, 2, "c");
    disk(tip, 1, "w");
    anchors.weaponGrip = hand;
    anchors.weaponTip = tip;
  }
  disk(hand, golem ? 2.5 : 1, skin);
  if (knight) {
    // The shield is held by the connected rear hand, never by an independent cutout.
    const widths = [5, 7, 9, 9, 9, 7, 7, 5, 3];
    widths.forEach((w, y) => {
      box(backHand.x + 1 - Math.floor(w / 2), backHand.y - 4 + y, w, 1, "q");
      if (w > 3)
        box(
          backHand.x + 2 - Math.floor(w / 2),
          backHand.y - 4 + y,
          w - 2,
          1,
          "j",
        );
    });
    box(backHand.x, backHand.y - 2, 2, 4, "q");
  }
  anchors.frontShoulder = frontShoulder;
  anchors.frontHand = hand;
  anchors.backShoulder = backShoulder;
  anchors.backHand = backHand;
  anchors.chest = { x: 11, y: wizard ? 16 : 12 };
  return { pixels: [...pixels.values()], anchors };
}
