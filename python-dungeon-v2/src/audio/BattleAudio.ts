import type { CombatEvent, HeroId } from "../types";

export type SoundCue =
  | HeroId
  | "strike"
  | "guard"
  | "heal"
  | "focus"
  | "enemy"
  | "charge"
  | "victory"
  | "defeat"
  | "hurt";
export interface SoundTone {
  wave: OscillatorType;
  from: number;
  to: number;
  duration: number;
  gain: number;
  delay?: number;
}
// Original quiet, short pixel-game sounds. No downloads or perpetual sources.
export const SOUND_PATTERNS: Readonly<Record<SoundCue, readonly SoundTone[]>> =
  {
    strike: [
      { wave: "triangle", from: 640, to: 130, duration: 0.1, gain: 0.035 },
    ],
    adventurer: [
      { wave: "sawtooth", from: 900, to: 220, duration: 0.09, gain: 0.018 },
      {
        wave: "sawtooth",
        from: 1150,
        to: 300,
        duration: 0.11,
        gain: 0.017,
        delay: 0.085,
      },
    ],
    knight: [
      { wave: "square", from: 130, to: 65, duration: 0.16, gain: 0.022 },
      { wave: "triangle", from: 740, to: 240, duration: 0.09, gain: 0.018 },
    ],
    wizard: [
      { wave: "sawtooth", from: 210, to: 60, duration: 0.22, gain: 0.019 },
      {
        wave: "sine",
        from: 520,
        to: 1040,
        duration: 0.18,
        gain: 0.025,
        delay: 0.035,
      },
    ],
    guard: [
      { wave: "triangle", from: 520, to: 700, duration: 0.1, gain: 0.02 },
    ],
    heal: [
      { wave: "sine", from: 440, to: 660, duration: 0.13, gain: 0.025 },
      {
        wave: "sine",
        from: 880,
        to: 990,
        duration: 0.13,
        gain: 0.02,
        delay: 0.08,
      },
    ],
    focus: [
      { wave: "sine", from: 520, to: 780, duration: 0.16, gain: 0.018 },
      {
        wave: "triangle",
        from: 780,
        to: 1040,
        duration: 0.13,
        gain: 0.012,
        delay: 0.08,
      },
    ],
    enemy: [{ wave: "square", from: 110, to: 65, duration: 0.1, gain: 0.017 }],
    charge: [{ wave: "sine", from: 150, to: 300, duration: 0.22, gain: 0.016 }],
    victory: [
      { wave: "sine", from: 523.25, to: 523.25, duration: 0.13, gain: 0.022 },
      {
        wave: "sine",
        from: 659.25,
        to: 659.25,
        duration: 0.13,
        gain: 0.022,
        delay: 0.1,
      },
      {
        wave: "sine",
        from: 784,
        to: 784,
        duration: 0.17,
        gain: 0.022,
        delay: 0.2,
      },
    ],
    defeat: [
      { wave: "triangle", from: 200, to: 100, duration: 0.26, gain: 0.023 },
    ],
    hurt: [{ wave: "sine", from: 90, to: 70, duration: 0.09, gain: 0.02 }],
  };

/** Attack anticipation is silent; the paired hurt carries its attacking source. */
export function cueForBeat(
  event: CombatEvent,
  hero: HeroId,
  source?: CombatEvent,
): SoundCue | null {
  if (event.animation === "hurt") {
    if (!source) return "hurt";
    if (source.target === "hero")
      return source.action === "skill" ? hero : "strike";
    return "enemy";
  }
  if (event.animation === "defeat")
    return event.target === "enemy" ? "victory" : "defeat";
  if (event.animation === "defend") return "guard";
  if (event.action === "focus") return "focus";
  if (event.animation === "charge")
    return event.text.startsWith("มึนงง") ? "guard" : "charge";
  if (event.action === "heal" || event.text.startsWith("+")) return "heal";
  return null;
}

interface Voice {
  oscillator: OscillatorNode;
  gain: GainNode;
}

/** One reusable context per active room, unlocked only by an actual user action. */
export class BattleAudio {
  private context: AudioContext | null = null;
  private enabled = false;
  private voices = new Set<Voice>();

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.close();
  }

  unlock(enabled: boolean) {
    this.setEnabled(enabled);
    if (!enabled || document.hidden) return;
    try {
      if (!this.context || this.context.state === "closed")
        this.context = new AudioContext();
      const context = this.context;
      void context.resume().catch(() => {
        if (this.context === context) this.close();
      });
    } catch {
      this.close();
    }
  }

  play(event: CombatEvent, hero: HeroId, source?: CombatEvent) {
    const context = this.context;
    const cue = cueForBeat(event, hero, source);
    // Never queue a late sound if playback/autoplay is suspended or unavailable.
    if (!cue || !this.enabled || !context || context.state !== "running")
      return;
    for (const tone of SOUND_PATTERNS[cue]) {
      if (this.voices.size >= 16) break;
      let voice: Voice | undefined;
      try {
        const oscillator = context.createOscillator(),
          gain = context.createGain();
        voice = { oscillator, gain };
        this.voices.add(voice);
        const at = context.currentTime + (tone.delay ?? 0);
        oscillator.type = tone.wave;
        oscillator.frequency.setValueAtTime(tone.from, at);
        oscillator.frequency.exponentialRampToValueAtTime(
          tone.to,
          at + tone.duration * 0.85,
        );
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(tone.gain, at + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + tone.duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        const active = voice;
        oscillator.onended = () => this.release(active);
        oscillator.start(at);
        oscillator.stop(at + tone.duration + 0.01);
      } catch {
        if (voice) this.release(voice);
      }
    }
  }

  private release(voice: Voice) {
    voice.oscillator.onended = null;
    try {
      voice.oscillator.stop();
    } catch {
      /* already ended or never started */
    }
    voice.oscillator.disconnect();
    voice.gain.disconnect();
    this.voices.delete(voice);
  }

  stop() {
    for (const voice of this.voices) this.release(voice);
  }

  close() {
    this.stop();
    const context = this.context;
    this.context = null;
    if (context && context.state !== "closed")
      void context.close().catch(() => {});
  }
}
