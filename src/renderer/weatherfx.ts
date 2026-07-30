/**
 * Weather you can see.
 *
 * Rain and snow are one pooled InstancedMesh each, allocated once and
 * never grown. When frames get expensive the particle count comes down
 * before anything else does — the spec is explicit that the frame rate
 * outranks the weather.
 *
 * Smoke drifts downwind from the hearth. Fog colour and density come
 * straight from the weather state, so a fog bank and an overcast day
 * look properly different.
 */

import * as THREE from 'three';
import { Snapshot } from '../game/snapshot.js';
import { GRID_W, GRID_H } from '../sim/grid.js';
import { seasonOfDay } from '../sim/calendar.js';

/** Ceiling on drops in the air at once. Never exceeded. */
const MAX_DROPS = 2600;
const MAX_FLAKES = 1800;
const MAX_SMOKE = 60;

/** The column the weather falls through, a little wider than the plot. */
const FIELD = Math.max(GRID_W, GRID_H) * 1.15;
const CEILING = 16;

interface Particle {
  x: number;
  y: number;
  z: number;
  vy: number;
  drift: number;
  spin: number;
  life: number;
}

export class WeatherFX {
  readonly group = new THREE.Group();

  private rain: THREE.InstancedMesh;
  private snow: THREE.InstancedMesh;
  private smoke: THREE.InstancedMesh;

  private drops: Particle[] = [];
  private flakes: Particle[] = [];
  private puffs: Particle[] = [];

  private dummy = new THREE.Object3D();
  private wind = new THREE.Vector2(1, 0);
  private windSpeed = 0;
  private rainCount = 0;
  private snowCount = 0;
  private smokeOn = false;

  /** Scales every particle budget. Dropped when frames get long. */
  private quality = 1;

  constructor() {
    // A drop is a thin streak, a flake a small quad. Both unlit so they
    // stay visible against a dark winter scene without costing anything.
    const dropGeo = new THREE.BoxGeometry(0.012, 0.42, 0.012);
    const rainMat = new THREE.MeshBasicMaterial({
      color: 0xaebccb,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    this.rain = new THREE.InstancedMesh(dropGeo, rainMat, MAX_DROPS);

    const flakeGeo = new THREE.PlaneGeometry(0.075, 0.075);
    const snowMat = new THREE.MeshBasicMaterial({
      color: 0xf2f5f8,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.snow = new THREE.InstancedMesh(flakeGeo, snowMat, MAX_FLAKES);

    const smokeGeo = new THREE.PlaneGeometry(0.5, 0.5);
    const smokeMat = new THREE.MeshBasicMaterial({
      color: 0x9aa0a4,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.smoke = new THREE.InstancedMesh(smokeGeo, smokeMat, MAX_SMOKE);

    for (const m of [this.rain, this.snow, this.smoke]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.castShadow = false;
      m.receiveShadow = false;
      m.count = 0;
      this.group.add(m);
    }

    for (let i = 0; i < MAX_DROPS; i++) this.drops.push(spawn(CEILING, 9 + Math.random() * 5));
    for (let i = 0; i < MAX_FLAKES; i++) this.flakes.push(spawn(CEILING, 0.6 + Math.random() * 0.5));
    for (let i = 0; i < MAX_SMOKE; i++) this.puffs.push(spawn(0, 0));
  }

  /**
   * Degrade the particle count before the frame rate. Called with the
   * measured frame time; recovers slowly once there is headroom again.
   */
  setBudget(frameMs: number): void {
    if (frameMs > 20) this.quality = Math.max(0.25, this.quality - 0.06);
    else if (frameMs < 13) this.quality = Math.min(1, this.quality + 0.01);
  }

  get particleBudget(): number {
    return this.quality;
  }

  /** Take the weather for the day and work out what should be in the air. */
  configure(s: Snapshot, scene: THREE.Scene): void {
    const w = s.weather;
    const season = seasonOfDay(s.dayOfYear);
    const freezing = w.tempC < 1;
    const snowing = freezing && w.precip > 0.15;
    const raining = !freezing && w.precip > 0.12;

    this.windSpeed = w.wind;
    // Wind direction is stable for a day; derive it from the front so a
    // wet week blows the same way all week.
    const angle = (w.daysSinceRain * 0.7 + w.frontDaysLeft * 1.3) % (Math.PI * 2);
    this.wind.set(Math.cos(angle), Math.sin(angle));

    this.rainCount = raining ? Math.floor(MAX_DROPS * w.precip * this.quality) : 0;
    this.snowCount = snowing ? Math.floor(MAX_FLAKES * w.precip * this.quality) : 0;
    this.smokeOn = s.store.firewood > 0;

    // —— fog ——
    // The camera is orthographic and sits a long way back, so the whole
    // scene is roughly 60 to 90 units deep. FogExp2 squares the product
    // of density and distance, which means these numbers are much smaller
    // than they look: 0.013 is already a proper fog bank, and 0.05 would
    // erase the farm entirely.
    let density = 0.0015;
    let colour = 0x9aa8b2;
    if (w.frontType === 'fog') {
      density = 0.013;
      colour = 0xa8aeb2;
    } else if (w.precip > 0.35) {
      density = 0.006;
      colour = 0x8d979e;
    } else if (w.cloud > 0.6) {
      density = 0.004;
      colour = 0x97a1a8;
    }
    if (season === 'winter') {
      density *= 1.15;
      colour = blend(colour, 0xb9c6d0, 0.4);
    }
    scene.fog = new THREE.FogExp2(colour, density);
  }

  /** Advance the particles. dt in seconds. */
  update(dt: number, hearth: THREE.Vector3): void {
    const wx = this.wind.x * (this.windSpeed * 0.035);
    const wz = this.wind.y * (this.windSpeed * 0.035);

    this.step(this.drops, this.rain, this.rainCount, dt, wx, wz, true);
    this.step(this.flakes, this.snow, this.snowCount, dt, wx, wz, false);
    this.stepSmoke(dt, wx, wz, hearth);
  }

  private step(
    pool: Particle[],
    mesh: THREE.InstancedMesh,
    count: number,
    dt: number,
    wx: number,
    wz: number,
    streak: boolean
  ): void {
    mesh.count = count;
    if (count === 0) return;

    for (let i = 0; i < count; i++) {
      const p = pool[i]!;
      p.y -= p.vy * dt;
      p.x += wx * dt * (streak ? 1 : 2.2);
      p.z += wz * dt * (streak ? 1 : 2.2);
      if (!streak) {
        // Flakes wander; drops do not.
        p.spin += dt * 0.6;
        p.x += Math.sin(p.spin) * dt * 0.35;
      }
      if (p.y < 0) {
        p.y = CEILING;
        p.x = (Math.random() - 0.5) * FIELD;
        p.z = (Math.random() - 0.5) * FIELD;
      }

      this.dummy.position.set(p.x, p.y, p.z);
      if (streak) {
        // Lean the streak into the wind.
        this.dummy.rotation.set(wz * 0.08, 0, -wx * 0.08);
        this.dummy.scale.set(1, 1, 1);
      } else {
        this.dummy.rotation.set(0, p.spin, p.spin * 0.5);
        this.dummy.scale.setScalar(0.7 + (p.drift % 0.6));
      }
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  private stepSmoke(dt: number, wx: number, wz: number, hearth: THREE.Vector3): void {
    const count = this.smokeOn ? Math.floor(MAX_SMOKE * this.quality) : 0;
    this.smoke.count = count;
    if (count === 0) return;

    for (let i = 0; i < count; i++) {
      const p = this.puffs[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        p.life = 3.2 + Math.random() * 2.4;
        p.x = hearth.x + (Math.random() - 0.5) * 0.2;
        p.y = hearth.y + 1.1;
        p.z = hearth.z + (Math.random() - 0.5) * 0.2;
        p.spin = Math.random() * Math.PI;
      }
      // Rises, spreads, and goes with the wind.
      p.y += dt * 0.62;
      p.x += wx * dt * 2.6;
      p.z += wz * dt * 2.6;

      const age = 1 - p.life / 5.6;
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.rotation.set(0, p.spin + age, 0);
      this.dummy.scale.setScalar(0.35 + age * 2.2);
      this.dummy.updateMatrix();
      this.smoke.setMatrixAt(i, this.dummy.matrix);
    }
    this.smoke.instanceMatrix.needsUpdate = true;
  }
}

function spawn(ceiling: number, vy: number): Particle {
  return {
    x: (Math.random() - 0.5) * FIELD,
    y: Math.random() * ceiling,
    z: (Math.random() - 0.5) * FIELD,
    vy,
    drift: Math.random(),
    spin: Math.random() * Math.PI * 2,
    life: Math.random() * 5,
  };
}

function blend(a: number, b: number, t: number): number {
  const ca = new THREE.Color(a);
  return ca.lerp(new THREE.Color(b), t).getHex();
}
