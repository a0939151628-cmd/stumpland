/**
 * Fixed three-quarter overhead, orthographic.
 *
 * Pan and zoom within limits. No free orbit — the composition should
 * always look deliberate. One optional move: swing slowly to the opposite
 * side so you can see behind the buildings.
 */

import * as THREE from 'three';
import { GRID_W, GRID_H } from '../sim/grid.js';

const PITCH = Math.atan(1 / Math.SQRT2); // classic three-quarter, ~35.26°
const YAW_A = Math.PI * 0.25;            // looking from the south-east
const YAW_B = YAW_A + Math.PI;           // and from the north-west
const SWING_SECONDS = 2.4;

const ZOOM_MIN = 8;   // half-height in tiles: close in
const ZOOM_MAX = 20;  // the whole plot and a margin of trees
const PAN_LIMIT = 7;  // tiles from centre

export class CameraRig {
  readonly camera: THREE.OrthographicCamera;
  private target = new THREE.Vector3(0, 0, 0);
  private zoom = 13;
  /** Pixels of UI covering the left edge; the plot centres clear of it. */
  private leftInset = 0;
  private yaw = YAW_A;
  private yawFrom = YAW_A;
  private yawTo = YAW_A;
  private swing = 1; // 0..1, 1 = settled
  private aspect = 1;
  private width = 1;
  private height = 1;

  constructor() {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    this.apply();
  }

  resize(width: number, height: number, leftInset = 0): void {
    this.aspect = width / Math.max(1, height);
    this.width = width;
    this.height = height;
    this.leftInset = leftInset;
    this.apply();
  }

  pan(dxTiles: number, dzTiles: number): void {
    // Pan in screen space, so dragging right moves the world right
    // whichever side we are viewing from.
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    this.target.x = clamp(this.target.x + dxTiles * c - dzTiles * s, -PAN_LIMIT, PAN_LIMIT);
    this.target.z = clamp(this.target.z + dxTiles * s + dzTiles * c, -PAN_LIMIT, PAN_LIMIT);
    this.apply();
  }

  zoomBy(delta: number): void {
    this.zoom = clamp(this.zoom + delta, ZOOM_MIN, ZOOM_MAX);
    this.apply();
  }

  /** Swing to the far side. Slow on purpose. */
  swingAround(): void {
    if (this.swing < 1) return; // already moving
    this.yawFrom = this.yaw;
    this.yawTo = Math.abs(this.yaw - YAW_A) < 1e-3 ? YAW_B : YAW_A;
    this.swing = 0;
  }

  update(dt: number): void {
    if (this.swing >= 1) return;
    this.swing = Math.min(1, this.swing + dt / SWING_SECONDS);
    const e = easeInOut(this.swing);
    this.yaw = this.yawFrom + (this.yawTo - this.yawFrom) * e;
    this.apply();
  }

  private apply(): void {
    const halfH = this.zoom;
    const halfW = halfH * this.aspect;
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    // Shift the frustum so the plot sits centred in the space the panel
    // leaves, not centred behind it.
    if (this.leftInset > 0) {
      this.camera.setViewOffset(
        this.width,
        this.height,
        -this.leftInset / 2,
        0,
        this.width,
        this.height
      );
    } else {
      this.camera.clearViewOffset();
    }
    this.camera.updateProjectionMatrix();

    // Far enough back that the whole plot stays inside the near/far planes.
    const dist = Math.max(GRID_W, GRID_H) * 2.2;
    const horizontal = Math.cos(PITCH) * dist;
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * horizontal,
      this.target.y + Math.sin(PITCH) * dist,
      this.target.z + Math.cos(this.yaw) * horizontal
    );
    this.camera.lookAt(this.target);
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
