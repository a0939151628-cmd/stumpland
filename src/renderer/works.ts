/**
 * The buildings, in three dimensions.
 *
 * Kenney's Nature Kit has no structures, so these are built from boxes
 * and prisms in the same flat-shaded, muted register as everything else.
 * Each one is created once and simply shown or hidden from the snapshot —
 * they are permanent in the simulation, so they never need rebuilding.
 */

import * as THREE from 'three';
import { Snapshot } from '../game/snapshot.js';
import { WORKS, WorkKind } from '../sim/buildings.js';
import { worldX, worldZ } from './scene.js';

const TIMBER = 0x7a6a55;
const TIMBER_DARK = 0x574a3c;
const THATCH = 0x8a7d5c;

function timberMat(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color: TIMBER });
}
function darkMat(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color: TIMBER_DARK });
}
function thatchMat(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color: THATCH });
}

function box(w: number, h: number, d: number, mat: THREE.Material, y: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.y = y + h / 2;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** A simple gabled roof: a four-sided cone, turned to sit square. */
/** Roofs are collected so snow can settle on them. */
const roofs: THREE.MeshLambertMaterial[] = [];

function roof(radius: number, height: number, mat: THREE.Material, y: number): THREE.Mesh {
  if (mat instanceof THREE.MeshLambertMaterial) roofs.push(mat);
  const m = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 4), mat);
  m.position.y = y + height / 2;
  m.rotation.y = Math.PI / 4;
  m.castShadow = true;
  return m;
}

function make(kind: WorkKind): THREE.Group {
  const g = new THREE.Group();

  switch (kind) {
    case 'shed':
      g.add(box(1.5, 0.85, 1.2, timberMat(), 0));
      g.add(roof(1.25, 0.5, thatchMat(), 0.85));
      break;

    case 'barn':
      // The shed rebuilt bigger: taller walls, a deeper roof, doors.
      g.add(box(2.3, 1.45, 1.8, timberMat(), 0));
      g.add(roof(1.85, 1.0, thatchMat(), 1.45));
      g.add(box(0.8, 1.0, 0.08, darkMat(), 0).translateZ(0.92));
      break;

    case 'hutch':
      // Up on legs, out of the wet.
      g.add(box(0.09, 0.34, 0.09, darkMat(), 0).translateX(-0.3).translateZ(-0.2));
      g.add(box(0.09, 0.34, 0.09, darkMat(), 0).translateX(0.3).translateZ(-0.2));
      g.add(box(0.09, 0.34, 0.09, darkMat(), 0).translateX(-0.3).translateZ(0.2));
      g.add(box(0.09, 0.34, 0.09, darkMat(), 0).translateX(0.3).translateZ(0.2));
      g.add(box(0.85, 0.4, 0.6, timberMat(), 0.34));
      g.add(roof(0.72, 0.24, thatchMat(), 0.74));
      break;

    case 'byre':
      // Wide, low, open along one side for stock to stand under.
      g.add(box(1.9, 0.85, 1.2, timberMat(), 0));
      g.add(box(1.7, 0.5, 0.42, darkMat(), 0).translateZ(0.55));
      g.add(roof(1.6, 0.5, thatchMat(), 0.85));
      break;

    case 'smokehouse':
      // Narrow and tight, so the smoke stays where it is put.
      g.add(box(0.8, 1.25, 0.8, darkMat(), 0));
      g.add(roof(0.75, 0.45, thatchMat(), 1.25));
      break;
  }

  const at = WORKS[kind].at;
  g.position.set(worldX(at.x), 0, worldZ(at.y));
  g.visible = false;
  return g;
}

const THATCH_COLOUR = new THREE.Color(THATCH);
const SNOW_ON_ROOF = new THREE.Color(0xdfe6ec);

export class WorksView {
  readonly group = new THREE.Group();
  private built = new Map<WorkKind, THREE.Group>();
  private roofMaterials: THREE.MeshLambertMaterial[] = [];

  constructor() {
    for (const kind of Object.keys(WORKS) as WorkKind[]) {
      const g = make(kind);
      this.built.set(kind, g);
      this.group.add(g);
    }
    this.roofMaterials = roofs.slice();
  }

  /** Snow settles on a roof before it settles anywhere else. */
  setSnow(depth: number): void {
    const t = Math.min(1, depth * 1.6);
    for (const m of this.roofMaterials) m.color.copy(THATCH_COLOUR).lerp(SNOW_ON_ROOF, t);
  }

  update(s: Snapshot): void {
    for (const [kind, g] of this.built) {
      // The barn stands where the shed stood, so only one of them shows.
      g.visible = kind === 'shed' ? s.works.shed && !s.works.barn : s.works[kind];
    }
  }
}
