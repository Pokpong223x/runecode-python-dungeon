import type Phaser from "phaser";

const themes = [
  { color: 0xa1c3af, opacity: 0.1 },
  { color: 0xbda98e, opacity: 0.075 },
  { color: 0xa3c5d4, opacity: 0.1 },
  { color: 0xb8a4ce, opacity: 0.105 },
  { color: 0xa4c4b7, opacity: 0.075 },
  { color: 0xb6b4d0, opacity: 0.09 },
];

/** A small, feathered pixel texture; reused by all three mist ribbons. */
function mistTexture(scene: Phaser.Scene, chapter: number, color: number) {
  const key = `chapter-mist-${chapter}`;
  if (scene.textures.exists(key)) return key;
  const width = 128,
    height = 32;
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) return null;
  const context = texture.getContext();
  const pixels = context.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1),
        v = y / (height - 1);
      const cloud =
        0.65 * Math.exp(-(((u - 0.22) / 0.26) ** 2 + ((v - 0.6) / 0.29) ** 2)) +
        0.72 *
          Math.exp(-(((u - 0.54) / 0.31) ** 2 + ((v - 0.44) / 0.24) ** 2)) +
        0.5 * Math.exp(-(((u - 0.82) / 0.23) ** 2 + ((v - 0.62) / 0.28) ** 2));
      // Every edge fades to zero, so there is no moving rectangular boundary.
      const feather = Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
      const i = (y * width + x) * 4;
      pixels.data[i] = (color >> 16) & 255;
      pixels.data[i + 1] = (color >> 8) & 255;
      pixels.data[i + 2] = color & 255;
      pixels.data[i + 3] = Math.round(Math.min(1, cloud) * feather * 210);
    }
  }
  context.putImageData(pixels, 0, 0);
  texture.refresh();
  return key;
}

/** Ambient presentation stays inside the backdrop, behind actors and combat FX. */
export function addMist(
  scene: Phaser.Scene,
  backdrop: Phaser.GameObjects.Container,
  chapter: number,
) {
  const index = Math.max(0, Math.min(5, chapter - 1));
  const theme = themes[index];
  const key = mistTexture(scene, index + 1, theme.color);
  if (!key) return;
  const reduced = !!scene.registry.get("reducedMotion");
  const layers = [
    {
      x: 415,
      y: 228,
      width: 1140,
      height: 100,
      opacity: 1,
      drift: 72,
      duration: 48000,
    },
    {
      x: 380,
      y: 310,
      width: 1020,
      height: 66,
      opacity: 0.9,
      drift: -86,
      duration: 36000,
    },
    {
      x: 435,
      y: 382,
      width: 1080,
      height: 76,
      opacity: 0.42,
      drift: 58,
      duration: 60000,
    },
  ];
  layers.forEach((layer, i) => {
    const mist = scene.add
      .image(layer.x, layer.y, key)
      .setName(`ambient-mist-${i}`)
      .setDisplaySize(layer.width, layer.height)
      .setAlpha(theme.opacity * layer.opacity);
    if (i % 2) mist.setFlipX(true);
    backdrop.add(mist);
    if (!reduced) {
      const tween = scene.tweens.add({
        targets: mist,
        x: layer.x + layer.drift,
        y: layer.y + (i === 1 ? -4 : 3),
        duration: layer.duration,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      mist.once("destroy", () => tween.remove());
    }
  });
}
