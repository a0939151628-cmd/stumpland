/**
 * Animals in the yard.
 *
 * Real models if they are present, simple flat-shaded stand-ins if they
 * are not. Drop a GLB named in ANIMAL_FILES into public/models/ and it is
 * picked up on the next load — nothing here needs editing. See
 * assets/README.md for where to get them.
 *
 * Whatever the source model's size, it is scaled to the footprint below,
 * so a pack authored at any scale drops straight in.
 *
 * Movement is deliberately dumb: no pathfinding, just a slow lerp between
 * waypoints inside each animal's patch of ground, which is what the game
 * wants and all it needs.
 */

import * as THREE from 'three';
import { Snapshot } from '../game/snapshot.js';
import { Stock } from '../sim/animals.js';
import { worldX, worldZ } from './scene.js';
import { loadGeometry, makeMaterial } from './assets.js';

interface Pen {
  cx: number;
  cz: number;
  r: number;
}

/** Where each kind lives, in grid tiles. */
const PENS: Record<Stock, Pen> = {
  hens: { cx: 15.8, cz: 15.0, r: 1.3 },
  rabbits: { cx: 16.9, cz: 14.0, r: 0.5 },
  goat: { cx: 13.2, cz: 16.6, r: 1.4 },
  sheep: { cx: 12.6, cz: 15.4, r: 1.5 },
  pig: { cx: 14.2, cz: 15.6, r: 1.0 },
  ox: { cx: 13.0, cz: 17.6, r: 1.2 },
};

type Kind = Stock | 'dog' | 'cat';

/**
 * The file each kind looks for, and how tall it should stand in tiles.
 * One tile is roughly five paces, so an ox at 0.9 is about right.
 */
const ANIMALS: Record<Kind, { file: string; height: number; colour: number; speed: number }> = {
  hens:    { file: 'animal_hen.glb',    height: 0.26, colour: 0x9a8f7c, speed: 0.5 },
  rabbits: { file: 'animal_rabbit.glb', height: 0.20, colour: 0x8b8172, speed: 0.45 },
  goat:    { file: 'animal_goat.glb',   height: 0.52, colour: 0x8d8272, speed: 0.35 },
  sheep:   { file: 'animal_sheep.glb',  height: 0.55, colour: 0xa9a293, speed: 0.28 },
  pig:     { file: 'animal_pig.glb',    height: 0.50, colour: 0x8e7d74, speed: 0.30 },
  ox:      { file: 'animal_ox.glb',     height: 0.90, colour: 0x6d6154, speed: 0.18 },
  dog:     { file: 'animal_dog.glb',    height: 0.42, colour: 0x77695a, speed: 0.80 },
  cat:     { file: 'animal_cat.glb',    height: 0.28, colour: 0x6f6558, speed: 0.55 },
};

interface Wanderer {
  mesh: THREE.Object3D;
  from: THREE.Vector2;
  to: THREE.Vector2;
  t: number;
  speed: number;
  pen: Pen;
}

/** A stand-in: body, head, and legs on the larger kinds. */
function placeholder(kind: Kind): THREE.Object3D {
  const spec = ANIMALS[kind];
  const h = spec.height;
  const legged = h > 0.3;
  const w = h * 0.62;
  const d = h * 1.15;

  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: spec.colour });
  const bodyY = legged ? h * 0.45 : h * 0.35;

  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.55, d), mat);
  body.position.y = bodyY;
  body.castShadow = true;
  g.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(w * 0.62, h * 0.4, h * 0.4), mat);
  head.position.set(0, bodyY + h * 0.22, d * 0.55);
  head.castShadow = true;
  g.add(head);

  if (legged) {
    const legGeo = new THREE.BoxGeometry(w * 0.18, bodyY, w * 0.18);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const leg = new THREE.Mesh(legGeo, mat);
      leg.position.set(sx * w * 0.32, bodyY / 2, sz * d * 0.3);
      g.add(leg);
    }
  }
  return g;
}

export class LivestockView {
  readonly group = new THREE.Group();
  private wanderers: Wanderer[] = [];
  private prototypes = new Map<Kind, THREE.Object3D>();
  private material = makeMaterial();
  private lastSignature = '';

  /** True for each kind whose real model was found. */
  readonly loaded = new Set<Kind>();

  /**
   * Try for a real model per kind; fall back silently to the stand-in.
   * A missing file is the expected case until the pack is dropped in, so
   * it is not an error and does not warn.
   */
  async load(): Promise<void> {
    await Promise.all(
      (Object.keys(ANIMALS) as Kind[]).map(async (kind) => {
        const spec = ANIMALS[kind];
        try {
          const geom = await loadGeometry(spec.file as never);
          geom.computeBoundingBox();
          const box = geom.boundingBox;
          if (!box) throw new Error('no bounds');

          // Sit it on the ground and scale it to the intended height,
          // whatever scale the pack was authored at.
          const size = new THREE.Vector3();
          box.getSize(size);
          const scale = spec.height / Math.max(1e-6, size.y);
          geom.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
          geom.scale(scale, scale, scale);

          const mesh = new THREE.Mesh(geom, this.material);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          this.prototypes.set(kind, mesh);
          this.loaded.add(kind);
          console.log(`[animals] ${kind}: loaded ${spec.file}, scaled to ${spec.height} tiles`);
        } catch {
          this.prototypes.set(kind, placeholder(kind));
        }
      })
    );
  }

  private make(kind: Kind): THREE.Object3D {
    const proto = this.prototypes.get(kind) ?? placeholder(kind);
    return proto.clone(true);
  }

  /** Rebuild the cast when the herd changes. Cheap; happens once a day. */
  update(s: Snapshot): void {
    const wanted: { kind: Kind; pen: Pen }[] = [];

    for (const h of s.animals.herds) {
      // Show up to six of anything; a yard is not a stockyard.
      for (let i = 0; i < Math.min(6, h.count); i++) {
        wanted.push({ kind: h.kind, pen: PENS[h.kind] });
      }
    }
    if (s.animals.dog?.present) {
      wanted.push({ kind: 'dog', pen: { cx: 14.6, cz: 18.2, r: 2.2 } });
    }
    if (s.animals.cat?.present) {
      // The cat goes where it likes.
      wanted.push({ kind: 'cat', pen: { cx: 15.4, cz: 16.6, r: 3.0 } });
    }

    const signature = wanted.map((w) => w.kind).join(',');
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;

    for (const w of this.wanderers) this.group.remove(w.mesh);
    this.wanderers = [];

    for (const spec of wanted) {
      const mesh = this.make(spec.kind);
      this.group.add(mesh);
      this.wanderers.push({
        mesh,
        from: pointIn(spec.pen),
        to: pointIn(spec.pen),
        t: Math.random(),
        speed: ANIMALS[spec.kind].speed,
        pen: spec.pen,
      });
    }
  }

  /** Slow lerp between waypoints. No pathfinding, by design. */
  animate(dt: number): void {
    for (const w of this.wanderers) {
      w.t += dt * w.speed * 0.2;
      if (w.t >= 1) {
        w.t = 0;
        w.from.copy(w.to);
        w.to.copy(pointIn(w.pen));
      }
      const e = w.t * w.t * (3 - 2 * w.t); // smoothstep, so they start and stop softly
      const x = w.from.x + (w.to.x - w.from.x) * e;
      const z = w.from.y + (w.to.y - w.from.y) * e;
      w.mesh.position.set(worldX(x), 0, worldZ(z));
      const dx = w.to.x - w.from.x;
      const dz = w.to.y - w.from.y;
      if (dx || dz) w.mesh.rotation.y = Math.atan2(dx, dz);
    }
  }
}

function pointIn(pen: Pen): THREE.Vector2 {
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * pen.r;
  return new THREE.Vector2(pen.cx + Math.cos(a) * r, pen.cz + Math.sin(a) * r);
}

/** The filenames the game looks for, for the asset README to stay honest. */
export const ANIMAL_FILES: Record<Kind, string> = Object.fromEntries(
  (Object.keys(ANIMALS) as Kind[]).map((k) => [k, ANIMALS[k].file])
) as Record<Kind, string>;
