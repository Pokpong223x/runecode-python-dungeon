import { describe, it, expect } from "vitest";
import { composePose, interpolatePose, poseFor, POSES } from "../src/art/pose";
import { sprites, spritePalette, type ActorKind } from "../src/art/pixels";

function connected(frame: ReturnType<typeof composePose>) {
  const all = new Set(frame.pixels.map((p) => `${p.x},${p.y}`));
  const start = frame.anchors.chest;
  const queue = [`${Math.round(start.x)},${Math.round(start.y)}`];
  expect(all.has(queue[0]), "chest anchor must be an opaque body pixel").toBe(
    true,
  );
  const seen = new Set(queue);
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i].split(",").map(Number);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const key = `${x + dx},${y + dy}`;
        if (all.has(key) && !seen.has(key)) {
          seen.add(key);
          queue.push(key);
        }
      }
  }
  return { all, seen };
}

describe("complete animated pixel silhouettes", () => {
  for (const kind of [
    "adventurer",
    "knight",
    "wizard",
    "skeleton",
    "golem",
    "lich",
  ] as ActorKind[]) {
    it(`${kind}: every body part and weapon stays joined through every pose transition`, () => {
      for (const from of POSES)
        for (const to of POSES)
          for (let step = 0; step <= 10; step++) {
            const frame = composePose(
              kind,
              sprites[kind],
              interpolatePose(
                poseFor(kind, from),
                poseFor(kind, to),
                step / 10,
              ),
            );
            const { all, seen } = connected(frame);
            const missing = [...all].filter((p) => !seen.has(p));
            expect(
              missing,
              `${kind} ${from} → ${to} ${step}/10 detached pixels`,
            ).toEqual([]);
            for (const [name, anchor] of Object.entries(frame.anchors))
              expect(
                seen.has(`${Math.round(anchor.x)},${Math.round(anchor.y)}`),
                `${kind} ${to} ${name}`,
              ).toBe(true);
            expect(
              frame.pixels.every((p) => spritePalette[p.color] !== undefined),
            ).toBe(true);
            // Include raised swords and staves, not merely the original idle rectangle.
            expect(
              frame.pixels.every(
                (p) => p.x >= -24 && p.x < 56 && p.y >= -24 && p.y < 56,
              ),
            ).toBe(true);
          }
    });
  }
});
