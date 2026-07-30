/**
 * Animals in the yard.
 *
 * PLACEHOLDER SHAPES. The spec calls for Quaternius' CC0 animated animal
 * pack, which is distributed through a Google Drive folder that cannot be
 * fetched from here. These are simple flat-shaded stand-ins built to the
 * right footprint so the real models drop straight in — see assets/README.
 *
 * Movement is deliberately dumb: no pathfinding, just a slow lerp between
 * waypoints inside each animal's patch of ground, which is all the spec
 * asks for and all it needs.
 */

import * as THREE from 'three';
import { Snapshot } from '../game/snapshot.js';
import { Stock } from '../sim/animals.js';
import { worldX, worldZ } from './scene.js';

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

interface Shape {
  body: [number, number, number];
  colour: number;
  legs: boolean;
  speed: number;
}

const SHAPES: Record<Stock, Shape> = {
  hens: { body: [0.16, 0.18, 0.22], colour: 0x9a8f7c, legs: false, speed: 0.5 },
  rabbits: { body: [0.13, 0.13, 0.2], colour: 0x8b8172, legs: false, speed: 0.45 },
  goat: { body: [0.28, 0.3, 0.5], colour: 0x8d8272, legs: true, speed: 0.35 },
  sheep: { body: [0.34, 0.34, 0.55], colour: 0xa9a293, legs: true, speed: 0.28 },
  pig: { body: [0.34, 0.32, 0.6], colour: 0x8e7d74, legs: true, speed: 0.3 },
  ox: { body: [0.5, 0.55, 0.95], colour: 0x6d6154, legs: true, speed: 0.18 },
};

const DOG = { colour: 0x77695a, size: [0.2, 0.22, 0.42] as [number, number, number] };
const CAT = { colour: 0x6f6558, size: [0.13, 0.14, 0.28] as [number, number, number] };

interface Wanderer {
  mesh: THREE.Group;
  from: THREE.Vector2;
  to: THREE.Vector2;
  t: number;
  speed: number;
  pen: Pen;
}

function beast(shape: Shape | { colour: number; size: [number, number, number] }): THREE.Group {
  const g = new THREE.Group();
  const size = 'body' in shape ? shape.body : shape.size;
  const mat = new THREE.MeshLambertMaterial({ color: shape.colour });
  const body = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
  const legged = 'legs' in shape && shape.legs;
  body.position.y = legged ? size[1] / 2 + 0.18 : size[1] / 2;
  body.castShadow = true;
  g.add(body);

  // A head, so it reads as facing somewhere.
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(size[0] * 0.6, size[1] * 0.6, size[1] * 0.6),
    mat
  );
  head.position.set(0, body.position.y + size[1] * 0.3, size[2] * 0.55);
  head.castShadow = true;
  g.add(head);

  if (legged) {
    const legGeo = new THREE.BoxGeometry(size[0] * 0.16, 0.2, size[0] * 0.16);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const leg = new THREE.Mesh(legGeo, mat);
      leg.position.set(sx * size[0] * 0.32, 0.1, sz * size[2] * 0.32);
      g.add(leg);
    }
  }
  return g;
}

export class LivestockView {
  readonly group = new THREE.Group();
  private wanderers: Wanderer[] = [];
  private pools = new Map<string, THREE.Group[]>();

  /** Rebuild the cast when the herd changes. Cheap; happens once a day. */
  update(s: Snapshot): void {
    const wanted: { key: string; pen: Pen; speed: number; make: () => THREE.Group }[] = [];

    for (const h of s.animals.herds) {
      const shape = SHAPES[h.kind];
      const pen = PENS[h.kind];
      // Show up to six of anything; a yard is not a stockyard.
      const shown = Math.min(6, h.count);
      for (let i = 0; i < shown; i++) {
        wanted.push({ key: h.kind, pen, speed: shape.speed, make: () => beast(shape) });
      }
    }
    if (s.animals.dog?.present) {
      wanted.push({
        key: 'dog',
        pen: { cx: 14.6, cz: 18.2, r: 2.2 },
        speed: 0.8,
        make: () => beast(DOG),
      });
    }
    if (s.animals.cat?.present) {
      wanted.push({
        key: 'cat',
        // The cat goes where it likes.
        pen: { cx: 15.4, cz: 16.6, r: 3.0 },
        speed: 0.55,
        make: () => beast(CAT),
      });
    }

    if (wanted.length === this.wanderers.length) return; // nothing changed

    for (const w of this.wanderers) this.group.remove(w.mesh);
    this.wanderers = [];

    for (const spec of wanted) {
      let pool = this.pools.get(spec.key);
      if (!pool) {
        pool = [];
        this.pools.set(spec.key, pool);
      }
      const mesh = pool.pop() ?? spec.make();
      this.group.add(mesh);
      const start = pointIn(spec.pen);
      this.wanderers.push({
        mesh,
        from: start.clone(),
        to: pointIn(spec.pen),
        t: Math.random(),
        speed: spec.speed,
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
