/**
 * Sound.
 *
 * Synthesised, not sampled. Partly so there is no licence question, but
 * mostly because the whole point is that it answers the weather: the wind
 * bed opens as the wind rises, rain comes up through the same filter, and
 * the fire is only there when there is wood on it.
 *
 * There is no music. There are no stings, no cues and nothing that plays
 * because the player did something correct.
 */

import { Snapshot } from '../game/snapshot.js';
import { seasonOfDay } from '../sim/calendar.js';

/** Two seconds of pink-ish noise, looped. Cheap and endless. */
function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    // A simple pink filter: white noise has too much hiss to sit under a
    // scene for an hour without becoming tiring.
    b0 = 0.99765 * b0 + white * 0.099;
    b1 = 0.963 * b1 + white * 0.2965;
    b2 = 0.57 * b2 + white * 1.0526;
    d[i] = (b0 + b1 + b2 + white * 0.1848) * 0.16;
  }
  return buf;
}

interface Bed {
  gain: GainNode;
  filter: BiquadFilterNode;
}

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private wind: Bed | null = null;
  private rain: Bed | null = null;
  private stream: Bed | null = null;
  private started = false;
  private muted = false;
  private volume = 0.5;

  /** Timers for the intermittent things. */
  private nextCrackle = 0;
  private nextBird = 0;
  private hearthLit = false;
  private birdsAllowed = false;

  /**
   * Browsers will not start audio without a gesture. Call this from the
   * first click or keypress; calling it again is harmless.
   */
  start(): void {
    if (this.started) return;
    this.started = true;

    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(ctx.destination);

    const buf = noiseBuffer(ctx);
    this.wind = this.bed(ctx, buf, 'lowpass', 420, 0);
    this.rain = this.bed(ctx, buf, 'bandpass', 1800, 0);
    this.stream = this.bed(ctx, buf, 'bandpass', 900, 0.012);
  }

  private bed(
    ctx: AudioContext,
    buf: AudioBuffer,
    type: BiquadFilterType,
    freq: number,
    gain: number
  ): Bed {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = type === 'bandpass' ? 0.7 : 1;

    const g = ctx.createGain();
    g.gain.value = gain;

    src.connect(filter).connect(g).connect(this.master!);
    src.start();
    return { gain: g, filter };
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    return this.muted;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Follow the day. Called when the snapshot changes, not every frame. */
  setWorld(s: Snapshot, hour: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const w = s.weather;
    const season = seasonOfDay(s.dayOfYear);
    const night = hour < 5 || hour > 21;

    // Wind. Rises with the wind speed, and opens the filter as it does —
    // a gale is not just a louder breeze, it is a brighter one.
    if (this.wind) {
      const strength = Math.min(1, w.wind / 55);
      ramp(this.wind.gain.gain, 0.02 + strength * 0.3, t);
      ramp(this.wind.filter.frequency, 300 + strength * 900, t);
    }

    // Rain, or the hiss of snow, which is quieter and duller.
    if (this.rain) {
      const freezing = w.tempC < 1;
      const wet = w.precip > 0.1 ? w.precip : 0;
      ramp(this.rain.gain.gain, wet * (freezing ? 0.06 : 0.26), t);
      ramp(this.rain.filter.frequency, freezing ? 900 : 1900, t);
    }

    // The stream, always there, a little fuller after rain.
    if (this.stream) {
      ramp(this.stream.gain.gain, 0.01 + w.soilMoisture * 0.018, t);
    }

    this.hearthLit = night && s.store.firewood > 0;
    this.birdsAllowed = !night && (season === 'spring' || season === 'summer') && w.precip < 0.3;
  }

  /** The intermittent things. Called each frame; almost always does nothing. */
  tick(): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;

    if (this.hearthLit && now > this.nextCrackle) {
      this.crackle(now);
      this.nextCrackle = now + 0.15 + Math.random() * 1.4;
    }
    if (this.birdsAllowed && now > this.nextBird) {
      this.bird(now);
      // Sparse on purpose. A dawn chorus would be a different game.
      this.nextBird = now + 4 + Math.random() * 14;
    }
  }

  /** A single pop of a log settling. */
  private crackle(now: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 90 + Math.random() * 220;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.05, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.06 + Math.random() * 0.07);

    osc.connect(g).connect(this.master!);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  /** Two or three notes, from somewhere in the wood. */
  private bird(now: number): void {
    const ctx = this.ctx!;
    const notes = 2 + Math.floor(Math.random() * 2);
    const base = 1700 + Math.random() * 1400;
    for (let i = 0; i < notes; i++) {
      const at = now + i * (0.09 + Math.random() * 0.07);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.3), at);
      osc.frequency.exponentialRampToValueAtTime(base * 1.25, at + 0.05);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.03, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);

      osc.connect(g).connect(this.master!);
      osc.start(at);
      osc.stop(at + 0.2);
    }
  }
}

function ramp(param: AudioParam, value: number, at: number): void {
  param.cancelScheduledValues(at);
  param.setTargetAtTime(value, at, 1.2);
}
