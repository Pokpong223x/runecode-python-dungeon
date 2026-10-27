import type Phaser from "phaser";
import type { ActorKind } from "./pixels";
import { composePose, poseFor, type Pose } from "./pose";
export type { Pose } from "./pose";

function highlight(color: number, amount: number) {
  const mix = (shift: number, light: number) =>
    Math.round(((color >> shift) & 255) * (1 - amount) + light * amount);
  return (mix(16, 255) << 16) | (mix(8, 243) << 8) | mix(0, 207);
}

/** Rasterize the entire current pose together, including connected joints and hit lighting. */
export function createPixelRig(
  scene: Phaser.Scene,
  kind: ActorKind,
  rows: string[],
  palette: Record<string, number>,
) {
  const root = scene.add.container(0, 0).setName("pixel-body");
  const art = scene.add.graphics().setName("complete-pixel-pose");
  root.add(art);
  const width = Math.max(...rows.map((row) => row.length)),
    height = rows.length;
  const state = poseFor(kind, "idle"),
    flash = { amount: 0 };
  let blinkTime = 0,
    fallen = false,
    moving = false,
    poseVersion = 0,
    previous = "";
  function draw(blink: boolean) {
    const key = `${Object.values(state)
      .map((n) => Math.round(n))
      .join(",")}:${blink}:${Math.round(flash.amount * 20)}`;
    if (key === previous) return;
    previous = key;
    const frame = composePose(kind, rows, state, blink);
    art.clear();
    for (const pixel of frame.pixels) {
      const color = palette[pixel.color];
      if (color !== undefined)
        art
          .fillStyle(highlight(color, flash.amount))
          .fillRect(pixel.x - width / 2, pixel.y - height, 1, 1);
    }
  }
  draw(false);
  function pose(name: Pose, duration = 100) {
    if (fallen) return;
    moving = true;
    const version = ++poseVersion;
    scene.tweens.killTweensOf(state);
    scene.tweens.add({
      targets: state,
      ...poseFor(kind, name),
      duration,
      ease: name === "strike" ? "Cubic.easeOut" : "Sine.easeInOut",
      onComplete: () => {
        if (version === poseVersion && name === "idle") moving = false;
      },
    });
  }
  const update = (time: number, delta: number) => {
    if (!fallen && !scene.registry.get("reducedMotion")) {
      blinkTime = (blinkTime + delta) % 3500;
      if (!moving) {
        const idle = poseFor(kind, "idle");
        state.fu = idle.fu + Math.sin(time / 850) * 1.5;
        state.bu = idle.bu - Math.sin(time / 850) * 1.5;
      }
    }
    draw(!fallen && !scene.registry.get("reducedMotion") && blinkTime > 3370);
  };
  scene.events.on("update", update);
  root.once("destroy", () => {
    scene.events.off("update", update);
    scene.tweens.killTweensOf(state);
    scene.tweens.killTweensOf(flash);
  });
  return {
    root,
    pose,
    hit() {
      scene.tweens.killTweensOf(flash);
      flash.amount = 0.38;
      scene.tweens.add({ targets: flash, amount: 0, duration: 120 });
    },
    fall() {
      fallen = true;
    },
  };
}
export type PixelRig = ReturnType<typeof createPixelRig>;
