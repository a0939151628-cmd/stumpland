/**
 * The plot, dressed.
 *
 * Reads a snapshot and writes instance transforms. Never touches the
 * simulation. Everything repeated goes through one InstancedMesh per
 * model, so the draw call count stays flat as the plot fills up.
 */

import * as THREE from 'three';
import { Snapshot } from '../game/snapshot.js';
import { GRID_W, GRID_H } from '../sim/grid.js';
import { Library, ModelName, makeMaterial, makeWindMaterial, loadLibrary, WindUniforms } from './assets.js';
import { isWornPath } from '../sim/work.js';
import { WorksView } from './works.js';
import { Lighting } from './lighting.js';
import { WeatherFX } from './weatherfx.js';
import { LivestockView } from './livestock.js';

/** Grid coordinates to world. The plot sits centred on the origin. */
export function worldX(x: number): number {
  return x - (GRID_W - 1) / 2;
}
export function worldZ(y: number): number {
  return y - (GRID_H - 1) / 2;
}

const MODELS: readonly ModelName[] = [
  'tree_default', 'tree_oak', 'tree_detailed', 'tree_cone', 'tree_blocks',
  'stump_round', 'stump_old', 'stump_square', 'stump_roundDetailed',
  'fence_simple', 'fence_corner', 'fence_gate',
  'crops_wheatStageA', 'crops_wheatStageB',
  'crops_dirtSingle', 'crops_dirtRow',
  'grass', 'grass_large',
  'rock_smallA', 'rock_smallB', 'rock_smallC', 'rock_largeA',
  'ground_grass', 'ground_pathTile', 'ground_riverTile',
  'log_stack', 'log_stackLarge', 'log',
];

const TILE_COUNT = GRID_W * GRID_H;

/** Lying snow reads as this, whatever was underneath. */
const SNOW_WHITE = new THREE.Color(1.65, 1.72, 1.8);
const COTTAGE_THATCH = new THREE.Color(0x6a5947);
const ROOF_SNOW = new THREE.Color(0xdfe6ec);

/** A pool of transforms for one model. Count is set per update. */
class Batch {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;

  constructor(geometry: THREE.BufferGeometry, material: THREE.Material, max: number) {
    this.mesh = new THREE.InstancedMesh(geometry, material, max);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
  }

  reset(): void {
    this.n = 0;
  }

  /** Optional tint multiplies the baked vertex colours. */
  add(m: THREE.Matrix4, tint?: THREE.Color): void {
    if (this.n >= this.mesh.instanceMatrix.count) return; // pool exhausted; drop it
    if (tint) this.mesh.setColorAt(this.n, tint);
    this.mesh.setMatrixAt(this.n++, m);
  }

  commit(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.computeBoundingSphere();
  }
}

export class SceneView {
  readonly scene = new THREE.Scene();
  private batches = new Map<ModelName, Batch>();
  private dummy = new THREE.Object3D();
  private tint = new THREE.Color();
  private water = new THREE.Color(0x5c707b);
  private material = makeMaterial();
  /** Grass and standing crops bend; buildings and rocks do not. */
  readonly wind: WindUniforms = {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector2(0, 0) },
  };
  private windMaterial = makeWindMaterial(this.wind);
  private works = new WorksView();
  private lighting = new Lighting();
  private fx = new WeatherFX();
  private stock = new LivestockView();
  private sky = new THREE.Color();
  private hearthAt = new THREE.Vector3();
  private cottageRoof: THREE.MeshLambertMaterial | null = null;
  private ready = false;
  private pending: Snapshot | null = null;

  constructor() {
    this.scene.background = new THREE.Color(0x8e9aa1);
    this.scene.add(this.works.group);
    this.scene.add(this.lighting.group);
    this.scene.add(this.fx.group);
    this.scene.add(this.stock.group);
    this.hearthAt.set(worldX(15.2), 1.4, worldZ(17.4));
  }

  /** Pull the models in. Nothing draws until this resolves. */
  async load(): Promise<void> {
    const lib: Library = await loadLibrary(MODELS);
    for (const name of MODELS) {
      const max = name.startsWith('tree_') ? 420 : TILE_COUNT * 4;
      const bends = name.startsWith('grass') || name.startsWith('crops_wheat');
      const batch = new Batch(lib[name], bends ? this.windMaterial : this.material, max);
      this.batches.set(name, batch);
      this.scene.add(batch.mesh);
    }

    // The stream. Kenney's river tiles expect connected bends and corners;
    // a plain sheet reads better as running water at this scale.
    const sheet = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const white = new Float32Array(sheet.attributes.position!.count * 3).fill(1);
    sheet.setAttribute('color', new THREE.BufferAttribute(white, 3));
    const water = new Batch(sheet, this.material, TILE_COUNT);
    water.mesh.castShadow = false;
    this.batches.set('water' as ModelName, water);
    this.scene.add(water.mesh);

    // Lying snow is a white sheet laid over the ground, not a tint of it:
    // instance colour multiplies, and olive times white is still olive.
    const snowSheet = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const snowWhite = new Float32Array(snowSheet.attributes.position!.count * 3).fill(1);
    snowSheet.setAttribute('color', new THREE.BufferAttribute(snowWhite, 3));
    const cover = new Batch(snowSheet, this.material, TILE_COUNT);
    cover.mesh.receiveShadow = true;
    cover.mesh.castShadow = false;
    this.batches.set('snowcover' as ModelName, cover);
    this.scene.add(cover.mesh);
    await this.stock.load();
    this.addCottage();
    this.ready = true;
    if (this.pending) {
      this.update(this.pending);
      this.pending = null;
    }
  }

  /** Rebuild instance transforms from the world. Called when the day changes. */
  update(s: Snapshot): void {
    if (!this.ready) {
      this.pending = s;
      return;
    }
    for (const b of this.batches.values()) b.reset();

    const place = (
      name: ModelName,
      x: number,
      z: number,
      y = 0,
      rotY = 0,
      scale = 1,
      tint?: THREE.Color
    ): void => {
      this.dummy.position.set(x, y, z);
      this.dummy.rotation.set(0, rotY, 0);
      this.dummy.scale.setScalar(scale);
      this.dummy.updateMatrix();
      this.batches.get(name)?.add(this.dummy.matrix, tint);
    };

    for (const t of s.plot.tiles) {
      const x = worldX(t.x);
      const z = worldZ(t.y);
      const j = hash2(t.x, t.y);
      const k = hash2(t.y * 31, t.x * 17);
      const spin = j * Math.PI * 2;

      // —— the ground ——
      // A little tone variation per tile so the sward is not a flat sheet.
      const base = 0.92 + j * 0.16;

      if (t.terrain === 'water') {
        place('water' as ModelName, x, z, -0.12, 0, 1, this.water);
      } else if (t.terrain === 'yard') {
        place('ground_pathTile', x, z, 0, 0, 1, this.groundTint(t, base));
      } else if (t.yearsWorked > 0 || t.tilled || t.crop) {
        // Worked ground reads as furrows, and darkens as the soil improves.
        place('ground_grass', x, z, 0, 0, 1, this.groundTint(t, 0.78 - t.soil * 0.16));
        // You plough a field one way, not in a herringbone. Snow buries it.
        if (t.snow < 0.45) place('crops_dirtRow', x, z, 0.01);
      } else if (isWornPath(t)) {
        // Walked over enough times that the grass gave up.
        place('ground_pathTile', x, z, 0, 0, 1, this.groundTint(t, 1.05));
      } else {
        place('ground_grass', x, z, 0, 0, 1, this.groundTint(t, base));
      }

      // Lying snow, thick enough to show. Thin cover goes patchy as it
      // melts, which is most of what makes a thaw look like a thaw.
      if (t.snow > 0.08 && t.terrain !== 'water') {
        const patchy = t.snow > 0.3 || k < t.snow * 3;
        if (patchy) {
          place(
            'snowcover' as ModelName,
            x, z,
            0.035 + t.snow * 0.06, 0, 1,
            this.tint.setRGB(0.82 + t.snow * 0.16, 0.85 + t.snow * 0.14, 0.9 + t.snow * 0.1)
          );
        }
      }

      // —— what stands on it ——
      if (t.terrain === 'forest') {
        const kinds: ModelName[] = ['tree_default', 'tree_oak', 'tree_detailed', 'tree_cone', 'tree_blocks'];
        const kind = kinds[Math.floor(j * kinds.length)] ?? 'tree_default';
        place(kind, x + (j - 0.5) * 0.4, z + (k - 0.5) * 0.4, 0, spin, 0.62 + k * 0.34);
        if (k < 0.18) place('grass', x + (k - 0.3) * 0.6, z + (j - 0.5) * 0.6, 0, spin);
        if (k > 0.93) place('rock_smallB', x + (j - 0.5) * 0.5, z + (k - 0.5) * 0.5, 0, spin);
      }

      if (t.terrain === 'clearing' && !t.stump && !t.crop && t.yearsWorked === 0 && !t.tilled && t.snow < 0.5) {
        // Rough ground: tufts and the odd stone.
        if (k < 0.32) place(k < 0.16 ? 'grass' : 'grass_large', x + (j - 0.5) * 0.5, z + (k - 0.5) * 0.5, 0, spin);
        else if (k > 0.94) place('rock_smallA', x + (j - 0.5) * 0.4, z + (k - 0.5) * 0.4, 0, spin);
      }

      if (t.stump && t.snow < 0.8) {
        const kinds: ModelName[] = ['stump_round', 'stump_old', 'stump_square', 'stump_roundDetailed'];
        const kind = kinds[Math.floor(k * kinds.length)] ?? 'stump_round';
        place(kind, x + (j - 0.5) * 0.2, z + (k - 0.5) * 0.2, 0, spin);
      }

      if (t.crop && t.crop.stage !== 'ruined') {
        // Four plants a tile, so a field reads as a field.
        const model: ModelName = t.crop.stage === 'sown' ? 'crops_dirtSingle' : 'crops_wheatStageB';
        const scale = t.crop.stage === 'growing' ? 0.7 : 1;
        for (let i = 0; i < 4; i++) {
          const ox = (i % 2) * 0.44 - 0.22;
          const oz = Math.floor(i / 2) * 0.44 - 0.22;
          place(model, x + ox, z + oz, 0.01, spin + i, scale);
        }
      }
    }

    this.placeFences(s);
    this.placeWoodpile(s);
    this.works.update(s);
    this.stock.update(s);

    // Snow on the roofs, taken from the ground it is standing on.
    let yardSnow = 0;
    let yardTiles = 0;
    for (const t of s.plot.tiles) {
      if (t.terrain === 'yard') {
        yardSnow += t.snow;
        yardTiles++;
      }
    }
    const depth = yardTiles ? yardSnow / yardTiles : 0;
    this.works.setSnow(depth);
    if (this.cottageRoof) {
      this.cottageRoof.color.copy(COTTAGE_THATCH).lerp(ROOF_SNOW, Math.min(1, depth * 1.6));
    }

    for (const b of this.batches.values()) b.commit();
  }

  /**
   * Fence goes up section by section as the ground gets worked — it rings
   * whatever has carried a crop. Permanent, and visibly earned.
   */
  private placeFences(s: Snapshot): void {
    const worked = (x: number, y: number): boolean => {
      if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return false;
      const t = s.plot.tiles[y * GRID_W + x];
      return !!t && t.yearsWorked > 0;
    };

    for (const t of s.plot.tiles) {
      if (t.yearsWorked === 0) continue;
      const x = worldX(t.x);
      const z = worldZ(t.y);
      // A rail on each edge that faces unworked ground.
      if (!worked(t.x, t.y - 1)) this.fence(x, z - 0.5, 0);
      if (!worked(t.x, t.y + 1)) this.fence(x, z + 0.5, 0);
      if (!worked(t.x - 1, t.y)) this.fence(x - 0.5, z, Math.PI / 2);
      if (!worked(t.x + 1, t.y)) this.fence(x + 0.5, z, Math.PI / 2);
    }
  }

  private fence(x: number, z: number, rotY: number): void {
    this.dummy.position.set(x, 0, z);
    this.dummy.rotation.set(0, rotY, 0);
    this.dummy.scale.setScalar(1);
    this.dummy.updateMatrix();
    this.batches.get('fence_simple')?.add(this.dummy.matrix);
  }

  /** The woodpile grows and shrinks with the store. */
  private placeWoodpile(s: Snapshot): void {
    const logs = Math.min(24, Math.floor(s.store.firewood / 2));
    for (let i = 0; i < logs; i++) {
      const row = Math.floor(i / 4);
      const col = i % 4;
      this.dummy.position.set(worldX(16.8) + col * 0.42, row * 0.34, worldZ(17.4));
      this.dummy.rotation.set(0, Math.PI / 2, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.batches.get('log_stack')?.add(this.dummy.matrix);
    }
  }

  /** Placeholder cottage until a building kit goes in. */
  private addCottage(): void {
    const mat = new THREE.MeshLambertMaterial({ color: 0x8a7c68 });
    const walls = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.3, 2.0), mat);
    walls.position.set(worldX(15.2), 0.65, worldZ(17.4));
    walls.castShadow = true;
    walls.receiveShadow = true;
    this.scene.add(walls);

    const roofMat = new THREE.MeshLambertMaterial({ color: COTTAGE_THATCH.getHex() });
    this.cottageRoof = roofMat;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.1, 1.1, 4), roofMat);
    roof.position.set(worldX(15.2), 1.85, worldZ(17.4));
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    this.scene.add(roof);
  }

  /**
   * Lying snow whitens a tile; standing water darkens it. Both come
   * straight from the simulation, so a patchy thaw looks patchy.
   */
  private groundTint(t: Snapshot['plot']['tiles'][number], shade: number): THREE.Color {
    this.tint.setScalar(shade * (1 - t.puddle * 0.28));
    if (t.snow > 0) {
      // Snow does not tint the ground, it covers it.
      this.tint.lerp(SNOW_WHITE, Math.min(1, t.snow * 1.35));
    }
    return this.tint;
  }

  /** Sun, sky, moon and hearth for this moment. */
  setLight(s: Snapshot, hour: number): void {
    this.lighting.update(s, hour);
    this.scene.background = this.lighting.skyColour(s, hour, this.sky);
    // Fog takes the sky's colour, so the treeline dissolves into it.
    this.fx.configure(s, this.scene);
    if (this.scene.fog) {
      (this.scene.fog as THREE.FogExp2).color.lerp(this.sky, 0.55);
    }
    // Wind drives the sway; the same vector drives the rain and smoke.
    const w = s.weather;
    const angle = (w.daysSinceRain * 0.7 + w.frontDaysLeft * 1.3) % (Math.PI * 2);
    const strength = Math.min(1, w.wind / 45) * 0.5;
    this.wind.uWind.value.set(Math.cos(angle) * strength, Math.sin(angle) * strength);
  }

  /** Per-frame: particles and the sway clock. */
  animate(dt: number, frameMs: number): void {
    this.wind.uTime.value += dt;
    this.fx.setBudget(frameMs);
    this.fx.update(dt, this.hearthAt);
    this.stock.animate(dt);
  }
}

/** Stable pseudo-random in [0,1) from a pair of ints. */
function hash2(a: number, b: number): number {
  let h = Math.imul(a + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x165667b1, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
