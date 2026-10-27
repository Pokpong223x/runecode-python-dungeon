import type Phaser from "phaser";
import { createPixelRig } from "./rig";
import { addMist } from "./ambient";

/** Original, code-native artwork. All coordinates use a crisp 800 × 450 diorama. */
export type ActorKind =
  | "adventurer"
  | "knight"
  | "wizard"
  | "slime"
  | "skeleton"
  | "spider"
  | "wisp"
  | "golem"
  | "lich";
type G = Phaser.GameObjects.Graphics;

const INK = 0x101b2d;
const GOLD = 0xffd479;
const JADE = 0x66dbc0;

const palettes = [
  [0x10292d, 0x1b4142, 0x31594e, 0x68ab79, 0xa3d991, 0x142f35],
  [0x231c2b, 0x403341, 0x65513e, 0xb18b56, 0xffd479, 0x2c2935],
  [0x152436, 0x263d53, 0x3e586b, 0x7297ac, 0xa4e5e0, 0x182e40],
  [0x221c3a, 0x392c53, 0x59456b, 0x9e76b0, 0xf1aeef, 0x2d2743],
  [0x102c34, 0x20424a, 0x3b6063, 0x6d9c91, 0x7ef1d0, 0x17353e],
  [0x211d3b, 0x352b54, 0x5a4d76, 0xa08cb7, 0xffd99a, 0x2b2948],
];

function rect(
  g: G,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  alpha = 1,
) {
  g.fillStyle(color, alpha).fillRect(
    Math.round(x),
    Math.round(y),
    Math.ceil(w),
    Math.ceil(h),
  );
}

function noise(seed: number) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function glow(g: G, x: number, y: number, color: number, size = 40) {
  for (let i = 4; i > 0; i--) {
    const radius = (size * i) / 4;
    rect(
      g,
      x - radius,
      y - radius,
      radius * 2,
      radius * 2,
      color,
      0.025 + (4 - i) * 0.007,
    );
  }
}

function stars(g: G, tint: number, count: number, maxY = 260) {
  for (let i = 0; i < count; i++) {
    const x = Math.floor((noise(i + 9) * 790) / 4) * 4;
    const y = Math.floor((noise(i + 220) * maxY) / 4) * 4;
    rect(g, x, y, i % 11 === 0 ? 4 : 2, 2, tint, 0.15 + noise(i) * 0.5);
    if (i % 17 === 0) rect(g, x + 1, y - 3, 2, 8, tint, 0.35);
  }
}

function bricks(
  g: G,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  edge: number,
) {
  rect(g, x, y, w, h, color);
  for (let row = 0; row < Math.ceil(h / 22); row++) {
    const yy = y + row * 22;
    rect(g, x, yy, w, 2, INK, 0.42);
    for (let xx = x + (row % 2 ? 18 : 0); xx < x + w; xx += 44) {
      rect(g, xx, yy + 2, 2, 20, INK, 0.35);
      rect(g, xx + 4, yy + 4, Math.min(26, x + w - xx - 4), 2, edge, 0.15);
    }
  }
}

function arch(
  g: G,
  x: number,
  y: number,
  width: number,
  height: number,
  stone: number,
  light: number,
) {
  const thick = 18;
  const crown = width * 0.32;
  rect(g, x - thick, y + crown, thick, height - crown, stone);
  rect(g, x + width, y + crown, thick, height - crown, stone);
  rect(g, x, y, width, thick, stone);
  rect(g, x - 12, y + 12, 20, crown, stone);
  rect(g, x + width - 8, y + 12, 20, crown, stone);
  rect(g, x + 8, y - 5, width - 16, 7, light, 0.55);
  rect(g, x - thick, y + crown, 5, height - crown, light, 0.3);
  rect(g, x + width - 2, y + crown, 5, height - crown, INK, 0.4);
  for (let yy = y + crown + 28; yy < y + height; yy += 34) {
    rect(g, x - thick, yy, thick, 3, INK, 0.35);
    rect(g, x + width, yy, thick, 3, INK, 0.35);
  }
  rect(g, x - thick - 7, y + height - 12, 33, 12, stone);
  rect(g, x + width - 8, y + height - 12, 33, 12, stone);
}

function torch(g: G, x: number, y: number, color: number) {
  glow(g, x + 4, y - 7, color, 48);
  rect(g, x - 4, y + 8, 16, 5, INK);
  rect(g, x + 1, y + 9, 6, 23, 0x71564e);
  rect(g, x - 3, y - 6, 14, 15, color);
  rect(g, x, y - 15, 7, 22, color, 0.9);
  rect(g, x + 2, y - 4, 5, 13, 0xfff5cc);
  rect(g, x + 8, y - 20, 3, 5, color, 0.6);
}

function crystal(g: G, x: number, y: number, color: number, size: number) {
  glow(g, x, y - size, color, size * 1.5);
  g.fillStyle(color, 0.7).fillPoints(
    [
      { x: x - size * 0.35, y },
      { x: x - size * 0.4, y: y - size },
      { x, y: y - size * 1.45 },
      { x: x + size * 0.36, y: y - size },
      { x: x + size * 0.3, y },
    ],
    true,
  );
  rect(g, x - size * 0.13, y - size * 1.15, size * 0.14, size, 0xfff9da, 0.65);
}

function tree(
  g: G,
  x: number,
  y: number,
  size: number,
  color: number,
  leaf: number,
) {
  const s = size;
  rect(g, x - 11 * s, y - 150 * s, 23 * s, 156 * s, color);
  rect(g, x - 6 * s, y - 140 * s, 5 * s, 140 * s, 0x6d7660, 0.25);
  rect(g, x - 22 * s, y - 7 * s, 47 * s, 9 * s, color);
  rect(g, x - 31 * s, y - 108 * s, 27 * s, 12 * s, color);
  rect(g, x + 7 * s, y - 137 * s, 27 * s, 10 * s, color);
  rect(g, x - 64 * s, y - 184 * s, 120 * s, 46 * s, leaf);
  rect(g, x - 44 * s, y - 211 * s, 81 * s, 40 * s, leaf);
  rect(g, x - 78 * s, y - 164 * s, 42 * s, 35 * s, leaf);
  rect(g, x + 31 * s, y - 170 * s, 48 * s, 40 * s, leaf);
  rect(g, x - 39 * s, y - 207 * s, 65 * s, 6 * s, 0x99c58c, 0.13);
  rect(g, x - 64 * s, y - 178 * s, 33 * s, 5 * s, 0x99c58c, 0.13);
}

/** A chapter-specific background. Call once when a battle scene is created. */
export function drawBackdrop(
  scene: Phaser.Scene,
  chapter: number,
  width: number,
  height: number,
): void {
  const index = Math.max(0, Math.min(5, chapter - 1));
  const [sky, back, stone, edge, accent, floor] = palettes[index];
  const root = scene.add
    .container(0, 0)
    .setScale(width / 800, height / 450)
    .setDepth(0)
    .setName("pixel-backdrop");
  const g = scene.add.graphics();
  root.add(g);
  rect(g, 0, 0, 800, 450, sky);
  // Deliberate bands and silhouettes, rather than a smooth gradient, preserve pixel texture.
  rect(g, 0, 120, 800, 120, back, 0.35);
  rect(g, 0, 240, 800, 110, back, 0.65);
  stars(g, accent, index === 5 ? 90 : 30);

  if (index === 0) {
    glow(g, 425, 145, 0xb7e6a3, 135);
    rect(g, 401, 60, 48, 46, 0xd9edac, 0.8);
    rect(g, 409, 53, 32, 60, 0xd9edac, 0.8);
    rect(g, 425, 53, 25, 10, sky, 0.7);
    for (let i = 0; i < 10; i++)
      tree(g, i * 98 - 35, 330, 0.75 + noise(i) * 0.3, back, 0x204541);
    arch(g, 458, 174, 105, 159, stone, edge);
    rect(g, 490, 168, 31, 17, back);
    rect(g, 530, 169, 12, 15, accent, 0.3);
    for (let i = 0; i < 7; i++)
      rect(g, 465 + i * 7, 183 + i * 9, 5, 13, 0x5b9963);
    bricks(g, 273, 290, 103, 42, stone, edge);
    rect(g, 279, 286, 85, 8, 0x639b68);
    tree(g, 51, 355, 1.75, 0x162e32, 0x173c37);
    tree(g, 762, 355, 1.65, 0x162e32, 0x173c37);
    rect(g, 201, 314, 58, 16, 0x61806c);
    rect(g, 207, 309, 42, 5, 0x93b57e);
  } else if (index === 1) {
    for (let i = 0; i < 15; i++) {
      const top = 24 + noise(i + 90) * 130;
      rect(g, i * 59 - 15, 0, 65, top, back);
      rect(g, i * 59, top - 3, 20, 30 + noise(i) * 40, back);
    }
    for (const x of [112, 666]) {
      rect(g, x, 83, 26, 253, 0x6c4e40);
      rect(g, x + 4, 83, 5, 249, 0xb28a5e, 0.5);
      rect(g, x - 17, 100, 60, 12, 0x876143);
      for (let y = 125; y < 330; y += 68) rect(g, x - 3, y, 32, 8, INK, 0.7);
    }
    rect(g, 97, 80, 610, 25, 0x785640);
    rect(g, 97, 80, 610, 5, 0xba9361, 0.6);
    for (const [x, y, s] of [
      [266, 312, 35],
      [301, 313, 24],
      [571, 319, 40],
      [546, 321, 22],
    ])
      crystal(g, x, y, accent, s);
    rect(g, 365, 271, 90, 53, 0x4b3d40);
    rect(g, 356, 265, 108, 9, 0xb18b56);
    for (const x of [378, 434]) {
      rect(g, x, 271, 5, 54, 0x9e754b);
      rect(g, x, 321, 12, 12, INK);
    }
    torch(g, 152, 196, 0xffbf67);
    torch(g, 633, 196, 0xffbf67);
  } else if (index === 2) {
    for (const x of [78, 336, 593]) {
      rect(g, x + 10, 106, 102, 218, 0x102335);
      arch(g, x + 8, 103, 104, 227, stone, edge);
      rect(g, x + 52, 145, 18, 139, back);
      rect(g, x + 10, 209, 101, 10, back);
    }
    for (const x of [50, 737]) {
      bricks(g, x, 66, 31, 268, stone, edge);
      rect(g, x - 9, 62, 49, 14, edge, 0.75);
      rect(g, x - 10, 319, 51, 18, stone);
    }
    torch(g, 270, 202, 0x70d9ed);
    torch(g, 520, 202, 0x70d9ed);
    rect(g, 360, 284, 90, 42, 0x4a697a);
    rect(g, 355, 280, 100, 9, 0x6d8d9d);
    rect(g, 400, 292, 7, 23, 0x243e54);
    rect(g, 392, 299, 23, 6, 0x243e54);
    for (let i = 0; i < 5; i++)
      rect(g, i * 180 - 60, 301 + i * 6, 250, 12, 0x86b5c0, 0.07);
  } else if (index === 3) {
    bricks(g, 0, 60, 800, 273, back, edge);
    for (const x of [55, 210, 540, 695]) {
      rect(g, x, 155, 48, 139, sky);
      rect(g, x - 7, 147, 62, 11, stone);
      rect(g, x - 7, 287, 62, 12, stone);
      rect(g, x + 12, 166, 25, 5, edge, 0.2);
    }
    glow(g, 397, 213, 0xcf8beb, 110);
    for (let i = 0; i < 5; i++) {
      const s = i * 8;
      rect(g, 334 + s, 126 + s, 126 - s * 2, 5, accent, 0.12 + i * 0.06);
      rect(g, 334 + s, 126 + s, 5, 187 - s * 2, accent, 0.12 + i * 0.06);
      rect(g, 455 - s, 126 + s, 5, 187 - s * 2, accent, 0.12 + i * 0.06);
    }
    rect(g, 377, 201, 40, 7, accent, 0.7);
    rect(g, 394, 183, 7, 43, accent, 0.7);
    torch(g, 168, 190, 0xd698ef);
    torch(g, 625, 190, 0xd698ef);
    for (let i = 0; i < 11; i++)
      rect(g, 310 + i * 15, 325 - (i % 3) * 3, 9, 5, edge, 0.45);
  } else if (index === 4) {
    const bookColors = [0x7eb5a2, 0xb19169, 0x6a7e9a, 0x9b6a74, 0x587f72];
    for (const x of [35, 164, 528, 657]) {
      rect(g, x - 7, 78, 112, 254, 0x453b3b);
      rect(g, x, 86, 98, 240, 0x182c32);
      for (let row = 0; row < 5; row++) {
        const yy = 93 + row * 46;
        for (let b = 0; b < 8; b++) {
          const hh = 19 + Math.floor(noise(row * 80 + b + x) * 18);
          rect(
            g,
            x + 5 + b * 11,
            yy + 36 - hh,
            8,
            hh,
            bookColors[(b + row + x) % bookColors.length],
          );
          rect(g, x + 6 + b * 11, yy + 39 - hh, 6, 2, GOLD, 0.5);
        }
        rect(g, x - 3, yy + 36, 104, 8, 0x716052);
        rect(g, x - 3, yy + 36, 104, 2, 0xa68a66, 0.5);
      }
    }
    glow(g, 400, 169, JADE, 110);
    arch(g, 330, 79, 140, 243, stone, edge);
    rect(g, 341, 104, 118, 195, 0x224a50);
    rect(g, 397, 96, 7, 211, 0x78a39b);
    rect(g, 341, 182, 118, 8, 0x78a39b);
    rect(g, 370, 121, 22, 23, 0x96d2b4, 0.9);
    rect(g, 376, 116, 12, 33, 0x96d2b4, 0.9);
    rect(g, 325, 317, 150, 12, 0x667a70);
    rect(g, 354, 280, 92, 11, 0x8b8063);
    rect(g, 362, 290, 12, 34, 0x655c4f);
    rect(g, 426, 290, 12, 34, 0x655c4f);
    rect(g, 382, 271, 32, 8, 0xe8ddac);
    rect(g, 397, 270, 2, 10, 0x8e957a);
  } else {
    glow(g, 400, 116, GOLD, 138);
    rect(g, 375, 53, 50, 51, 0xe6d4ad, 0.85);
    rect(g, 384, 45, 32, 67, 0xe6d4ad, 0.85);
    rect(g, 390, 48, 9, 10, 0x9e8dac, 0.65);
    for (const x of [77, 669]) {
      rect(g, x, 65, 39, 265, stone);
      rect(g, x + 6, 71, 7, 252, edge, 0.6);
      rect(g, x - 13, 59, 65, 16, edge);
      rect(g, x - 10, 318, 59, 16, edge);
      rect(g, x + 4, 84, 32, 5, GOLD, 0.7);
    }
    for (let i = 0; i < 4; i++) {
      rect(
        g,
        277 - i * 26,
        291 + i * 11,
        246 + i * 52,
        12,
        i % 2 ? stone : edge,
        0.7,
      );
    }
    rect(g, 350, 169, 100, 121, 0x5e5075);
    rect(g, 358, 178, 84, 97, 0x302843);
    rect(g, 350, 166, 100, 8, GOLD, 0.8);
    rect(g, 367, 160, 15, 13, GOLD, 0.8);
    rect(g, 394, 151, 13, 22, GOLD);
    rect(g, 420, 160, 15, 13, GOLD, 0.8);
    rect(g, 337, 255, 19, 42, edge);
    rect(g, 444, 255, 19, 42, edge);
    crystal(g, 228, 286, 0xa7b2ff, 27);
    crystal(g, 572, 286, 0xa7b2ff, 27);
    for (let i = 0; i < 11; i++)
      rect(
        g,
        111 + i * 56,
        130 + noise(i + 80) * 130,
        13 + noise(i) * 16,
        5,
        edge,
        0.25,
      );
  }

  // Common walkable stone stage and a near-camera edge establish scale across chapters.
  rect(g, 0, 334, 800, 116, floor);
  rect(g, 0, 334, 800, 5, edge, 0.62);
  rect(g, 0, 339, 800, 3, INK, 0.6);
  for (let row = 0; row < 4; row++) {
    const yy = 346 + row * 25;
    for (let col = 0; col < 13; col++) {
      const xx = col * 69 - (row % 2 ? 36 : 0);
      rect(g, xx, yy, 64, 19, stone, 0.17 + noise(row * 20 + col) * 0.2);
      rect(g, xx + 5, yy + 2, 35, 2, edge, 0.12);
      if ((col + row) % 4 === 0) rect(g, xx + 40, yy + 10, 12, 2, INK, 0.25);
    }
  }
  if (index === 1) {
    for (const y of [384, 412]) {
      rect(g, 0, y, 800, 4, 0x9f8770);
      rect(g, 0, y + 4, 800, 3, INK);
    }
    for (let x = 0; x < 800; x += 52) rect(g, x, 380, 10, 40, 0x735944);
  }
  rect(g, 0, 438, 800, 12, INK, 0.8);
  for (let i = 0; i < 35; i++) {
    const x = noise(i + 351) * 800;
    const y = 342 + noise(i + 560) * 95;
    rect(g, x, y, 3 + noise(i) * 6, 2, edge, 0.25);
  }
  if (index === 0 || index === 4) {
    for (const x of [12, 55, 93, 703, 749, 786]) {
      rect(g, x, 328, 4, 17, 0x4d8a65);
      rect(g, x - 6, 336, 8, 5, 0x76ab77);
      rect(g, x + 3, 332, 9, 5, 0x76ab77);
      rect(g, x - 2, 326, 5, 4, accent, 0.8);
    }
  }
  addMist(scene, root, chapter);
  // Tiny ambient motes have their own view-only tweens and respect reduced motion.
  for (let i = 0; i < 14; i++) {
    const mote = scene.add.graphics();
    const x = 90 + noise(i + 125) * 620;
    const y = 80 + noise(i + 380) * 215;
    rect(mote, 0, 0, i % 4 === 0 ? 3 : 2, 2, accent, 0.6);
    mote.setPosition(x, y).setAlpha(0.22 + noise(i) * 0.5);
    root.add(mote);
    if (!scene.registry.get("reducedMotion"))
      scene.tweens.add({
        targets: mote,
        y: y - 10 - noise(i) * 13,
        alpha: 0.15,
        duration: 2200 + i * 131,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
  }
}

export const spritePalette: Record<string, number> = {
  o: 0x152130,
  x: 0x243849,
  m: 0x477267,
  l: 0x7ebd96,
  h: 0xb3ebba,
  w: 0xf3eed1,
  g: 0x53ba9b,
  j: 0x287d71,
  k: 0x91e8bd,
  r: 0xe97965,
  q: GOLD,
  t: 0xe9b88e,
  f: 0x8c5142,
  b: 0x72a9c7,
  v: 0x9d86d3,
  s: 0xc1d1d8,
  e: 0x101926,
  c: 0x96efe0,
  n: 0x70524d,
};

/** Hand-pixelled silhouettes; each string is a row and each letter a palette entry. */
export const sprites: Record<ActorKind, string[]> = {
  adventurer: [
    ".........oooo...........",
    ".......ooqqqqo..........",
    "......oqqqqqqqo.........",
    "......offffqqqo.........",
    ".....offttttffo.........",
    ".....ofttttetto.........",
    "......ottttttto.........",
    "......ootttrto..........",
    ".....orrrrrroo..........",
    "....orrrrrrrrro.........",
    "....ogggggrrgo..........",
    "...ogkgkggrrgo..........",
    "...otgggggrrgoo.......s.",
    "..otttggggggoo......sss.",
    "..ootoggggggggo....sss..",
    "...oooggggggggo...sss...",
    ".....ogjjjgggo...sss....",
    ".....oqqqqqqqo..sss.....",
    ".....ojjjjjjjo..so......",
    ".....oxxxxxxxootto......",
    ".....oxxxoxxxootto......",
    ".....oxxxoxxxo.oo.......",
    ".....oxxo.oxxo..........",
    ".....oxxo.oxxo..........",
    "....onnno.onnno.........",
    "....ooooo.ooooo.........",
  ],
  knight: [
    "..........rr............",
    ".........rrrr...........",
    ".......oossssoo.........",
    "......ossswwssso........",
    "......osssssssso........",
    "......ossxxxssso........",
    "......osexexxsso........",
    "......ossxxssso.........",
    ".......ossssso..........",
    ".....oossqqssoo.........",
    "....ossssssssssso.......",
    "...oswssssssssssso......",
    "...osssssssssssssso.....",
    "..ooqqqqqoossssosso.....",
    ".oqqqqqqqqoosssossso....",
    ".oqqjqqjqqoosssossso....",
    ".oqqjqqjqqoosssottoo..s.",
    ".oqqjjjjqqoosssottoo.sss",
    ".oqqqjjqqqoossssoo..sss.",
    "..oqqjjqqooxxxxxxoo.sss.",
    "..oqqqqqqooxxxxxxoo.sss.",
    "...oqqqqooxxxoxxxoo.sss.",
    "....ooo..oxxxoxxxo..sss.",
    ".........osssoosso..sss.",
    ".........osssoosso..oqo.",
    "........ossssoosssso.q..",
    "........ooooo.oooooo....",
  ],
  wizard: [
    "..........vo............",
    ".........ovvo...........",
    ".........ovvvo..........",
    "........ovvvvvo.........",
    ".......ovvvvvvo.........",
    "......ovvvvvvvvo........",
    ".....ovvvqvvvvvvo.......",
    "....ovvvvvvvvvvvvo......",
    "....oooooooooooooo......",
    "......otttttto..........",
    "......otetteeo..........",
    ".......ottttto........c.",
    "......oowwwwoo.......ccc",
    ".....ovvwwwvvvo.....ccqc",
    "....ovvvvwvvvvvo.....cc.",
    "....ovvvvvvvvvvvo.....no",
    "...ovvvvvvvvvoovo.....no",
    "...otvvvvvvvvo.too....no",
    "...otvvvvvvvvo.ttto...no",
    "....ovvvqvvvvo..oo....no",
    "....ovvvqvvvvvo.......no",
    "...ovvvvqvvvvvvo......no",
    "...ovvvvvvvvvvvo......no",
    "..ovvvvvvvvvvvvvo.....no",
    "..ovvvvvvvvvvvvvvo....no",
    "..oooooooooooooooo....no",
    "....onnno...onnno.....no",
    "....ooooo...ooooo.......",
  ],
  slime: [
    "........................",
    "........................",
    "..........kkkk..........",
    "........kkkhhhkk........",
    "......kkkhhhhhhhkk......",
    ".....kkhhhhhhhhhkkk.....",
    "....kkhhhhhhhhhkkkkk....",
    "...kkhhhhhhhhhkkkkkkk...",
    "...khhhhhhhhhkkkkkkgk...",
    "..kkhhhhhhhhkkkkkkkggk..",
    "..khhhhekkhhkkkekkkggk..",
    "..khhheekkhhkkkeekkggk..",
    "..khhhkkkhhhhkkgkkkggk..",
    "..kkhhhhhhhhhkkggggggk..",
    "..kkkhhhhrhhrkkggggggk..",
    "..kkkghhhhrrhkkggggggk..",
    "...kkggkkkkkkkkgggggk...",
    "..kkkggggggggggggggggk..",
    ".kkgggggggggggggggggggk.",
    ".kkgggggggggggggggggggk.",
    "..kkkkgggkkkkggggkkkkk..",
    "....kkkkk....kkkkk......",
  ],
  skeleton: [
    ".......owwwwwo..........",
    "......owwwwwwwo.........",
    ".....owwwwwwwwwo........",
    ".....owwweewwewo........",
    ".....owwweewwewo........",
    "......owwwwewwo.........",
    "......owweeeewo.........",
    ".......owwwwww..........",
    "........owwwo...........",
    ".....oooowwwoooo........",
    "....owwwoooowwwwo.......",
    "...owwowwwwwwoowwo......",
    "...owwoowwwooo.owwo.....",
    "...owwo.owwo...owwo.....",
    "...owwoowwwooo.owwo.....",
    "...owwoowwwwwwoowwo.....",
    "...owwo.owwo....owwo....",
    "...owwoowwwooo..owwo....",
    "..ottooowwwwwwo.ottoo...",
    "...oo..oowwwoo...oo.....",
    ".......owwwwwwo.........",
    ".......owwoowwo.........",
    ".......owwoowwo.........",
    ".......owwoowwo.........",
    "......owwo..owwo........",
    "......owwo..owwo........",
    ".....owwwo..owwwo.......",
    ".....ooooo..ooooo.......",
  ],
  spider: [
    "........................",
    "........................",
    ".oo.................oo..",
    ".oox...............xoo..",
    "..oox.............xoo...",
    "..ooxx...ooooo...xxoo...",
    "...ooxx.oxxxxoo.xxoo....",
    "....oxxooxvxxxoooxxo....",
    ".....oxoxvvvxxxoxxo.....",
    "..ooooxxxvvvxxxxoooooo..",
    ".ooxxxxxovvxxxxoxxxxxoo.",
    "ooxxxooxxxxxxxxxooxxxoo.",
    "ooxx..oxxqxxqxxxoo..xxo.",
    "oxx...oxxqxxqxxxoo...xo.",
    "ox....oxxxxxxxxoo....xo.",
    "o....ooxxrrxxxxoo.....o.",
    "....ooxxoo..ooxxoo......",
    "...ooxxoo....ooxxoo.....",
    "..ooxxoo......ooxxoo....",
    "..oxxoo........ooxxo....",
    ".oxxoo..........ooxxo...",
    ".oxoo............ooxo...",
    ".ooo..............ooo...",
  ],
  wisp: [
    "..............c.........",
    "............ccc.........",
    "...........cccc.........",
    ".........cccccc.........",
    ".......ccchhhhcc........",
    "......cchhhhhhhcc.......",
    ".....cchhhhhhhhhcc......",
    "....cchhwwwhhhhhcc......",
    "....chhwwwhhhhhhhcc.....",
    "...cchhwwhhhhhhhhcc.....",
    "...chhhhhhhhhhhhhhcc....",
    "...chhheehhhhheehhcc....",
    "...chhheehhhhheehhcc....",
    "...cchhhhhhhhhhhhhc.....",
    "....chhhhhhhhhhhhcc.....",
    "....cchhhhhhhhhhcc......",
    ".....ccchhhhhhhcc.......",
    "......ccccchhhcc........",
    ".......ccccccc..........",
    "......ccc.ccc...........",
    ".....cc...cc............",
    ".....c...cc.............",
    "........cc..............",
    ".......cc...............",
  ],
  golem: [
    ".........ooooooo........",
    "........oxlllllxo.......",
    ".......oxlllllllxo......",
    ".......oxlqqllqlxo......",
    ".......oxlqqllqlxo......",
    "........oxlllllxo.......",
    "....oooooxlqqqxo..ooo...",
    "...oxllllloooooolllllxo.",
    "..oxlllllllllllllllllxo.",
    ".oxllllllxxllllxxlllllxo",
    ".oxlllllxxllqllxxlllllxo",
    ".oxllllxxllqqqllxxllllxo",
    ".oxlllxllqqqqqllxlllxlo",
    ".oxlllxxllqqqllxxlllxlo",
    ".oxlllxlllqqqlllxlllxlo",
    ".oxlllxllllqllllxlllxlo",
    ".oxllloxxxxxxxxxolllxlo",
    ".oxllloxxxxxxxxxolllxlo",
    "..oxxoooxxxxxxxoooxxoo.",
    "..oooo.oxxxxxxxo..ooo..",
    ".......oxxxoxxxo.......",
    ".......oxxxoxxxo.......",
    "......oxllxooxllxo.....",
    "......oxllxooxllxo.....",
    ".....oxlllxooxlllxo....",
    ".....oooooo.ooooooo....",
  ],
  lich: [
    ".........q...q..........",
    "........qqq.qqq.........",
    ".......qqqqqqqqq........",
    ".......ooooooooo........",
    "......ovvwwwwwvvo.......",
    "......ovwwewewwvo.......",
    "......ovwwerewwvo.......",
    "......ovvwwwwwvvo.......",
    ".......ovvwwwvvo........",
    "......oovvwwwvvoo.......",
    ".....ovvvvwwwvvvvo......",
    "....ovvvqvwwwvqvvvo.....",
    "...ovvvvqvvvvvqvvvvo....",
    "..ovvvvovvqqqvvoovvvo...",
    "..ovvvoovvqqqvvvoovvvo..",
    "..owwo.ovvqqqvvvo.owwo..",
    "...wo..ovvvqvvvvo..wo...",
    ".......ovvvqvvvvo.......",
    "......ovvvvqvvvvvo......",
    ".....ovvvvvqvvvvvvo.....",
    "....ovvvvvvvvvvvvvvo....",
    "....ovvvvvvvvvvvvvvvo...",
    "...ovvvvvvvvvvvvvvvvo...",
    "..ovvvvoovvvvvvvoovvvo..",
    "..ovvvo..ovvvvvo..ovvvo.",
    "...ooo....ooooo....ooo..",
  ],
};

const heroKinds = new Set<ActorKind>(["adventurer", "knight", "wizard"]);

/** Bottom-anchored actor; hero silhouettes face right and enemy silhouettes left. */
export function createActor(
  scene: Phaser.Scene,
  kind: ActorKind,
  x: number,
  y: number,
  scale: number,
  boss = false,
): Phaser.GameObjects.Container {
  const actor = scene.add.container(x, y).setDepth(10).setName(`actor-${kind}`);
  const rows = sprites[kind];
  const width = Math.max(...rows.map((row) => row.length));
  const actualScale = scale * (boss ? 1.24 : 1);
  const palette = { ...spritePalette };
  if (kind === "slime") {
    palette.k = boss ? 0xf4bc69 : 0x8cdeac;
    palette.g = boss ? 0xc37b4b : 0x43aa8d;
    palette.h = boss ? 0xffe19c : 0xc3f0ba;
  }
  if (kind === "golem") {
    palette.l = boss ? 0x9d8aad : 0x71918d;
    palette.x = 0x3b515a;
  }
  if (kind === "wisp") {
    palette.h = boss ? 0xe9c2f9 : 0xbbf7e8;
    palette.c = boss ? 0xb18bd2 : 0x6bcabf;
  }
  if (kind === "lich") palette.v = boss ? 0x8a66b0 : 0x6579a6;
  const rig = createPixelRig(scene, kind, rows, palette);
  const body = rig.root;
  const shadow = scene.add
    .graphics()
    .setName("pixel-shadow")
    .setPosition(x, y)
    .setDepth(9);
  rect(
    shadow,
    -width * actualScale * 0.44,
    -4,
    width * actualScale * 0.88,
    7,
    0x080f1c,
    0.35,
  );
  rect(
    shadow,
    -width * actualScale * 0.33,
    3,
    width * actualScale * 0.66,
    3,
    0x080f1c,
    0.19,
  );
  if (boss) {
    rect(
      shadow,
      -width * actualScale * 0.47,
      -7,
      width * actualScale * 0.94,
      2,
      GOLD,
      0.45,
    );
    rect(shadow, -width * actualScale * 0.52, -4, 5, 3, GOLD, 0.65);
    rect(shadow, width * actualScale * 0.47, -4, 5, 3, GOLD, 0.65);
  }
  body.setScale((heroKinds.has(kind) ? 1 : -1) * actualScale, actualScale);
  if (kind === "wisp") body.y = -10;
  actor.add(body);
  actor.setData({
    restX: x,
    restY: y,
    artKind: kind,
    boss,
    body,
    rig,
    artScale: actualScale,
  });
  if (!scene.registry.get("reducedMotion")) {
    const idle = scene.tweens.add({
      targets: body,
      y: body.y - (kind === "wisp" ? 5 : 1.8),
      scaleX: body.scaleX * (kind === "slime" ? 1.07 : 1.012),
      scaleY: body.scaleY * (kind === "slime" ? 0.9 : 1.018),
      duration: kind === "slime" ? 950 : 1500,
      delay: noise(x) * 500,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    actor.setData("idle", idle);
  }
  const followShadow = () => {
    const lift = Math.max(0, y - actor.y);
    shadow
      .setX(actor.x)
      .setAlpha(actor.alpha * Math.max(0.25, 1 - lift / 90))
      .setScale(Math.max(0.6, 1 - lift / 160), 1);
  };
  scene.events.on("update", followShadow);
  actor.once("destroy", () => {
    scene.events.off("update", followShadow);
    shadow.destroy();
  });
  return actor;
}
