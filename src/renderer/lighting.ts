/**
 * Light.
 *
 * One directional light is the sun. Its arc comes from the simulation's
 * solar geometry, so December really is a low raking pass that barely
 * clears the trees and June really is high overhead. Cloud from the
 * weather scales it. After dark the moon takes over on its own 29-day
 * cycle, with the hearth throwing a small warm pool by the door.
 *
 * Reads the snapshot. Writes nothing back.
 */

import * as THREE from 'three';
import { Snapshot } from '../game/snapshot.js';
import { sunPosition, moonPosition, moonIllumination } from '../sim/sky.js';
import { seasonOfDay } from '../sim/calendar.js';
import { GRID_W, GRID_H } from '../sim/grid.js';
import { worldX, worldZ } from './scene.js';

/** How far out the light sits. Only affects the shadow frustum, not the look. */
const LIGHT_DISTANCE = 34;

/** One cascade, tight around the plot. Nothing is baked. */
const SHADOW_MAP_SIZE = 2048;

const RAD = Math.PI / 180;

// —— the palette of the sky ——

const NOON_SUN = new THREE.Color(0xfff4e0);
const LOW_SUN = new THREE.Color(0xe8a866);   // raking, warm, near the horizon
const OVERCAST = new THREE.Color(0xb9c0c4);  // flat and colourless

const SUMMER_SKY = new THREE.Color(0x9fc0d8);
const SUMMER_EARTH = new THREE.Color(0x5f5a44);
const WINTER_SKY = new THREE.Color(0xc2d2de);
const WINTER_EARTH = new THREE.Color(0x9fb0bd); // blue-white, bounced off snow

const NIGHT_SKY = new THREE.Color(0x2a3646);
const NIGHT_EARTH = new THREE.Color(0x171d26);
const MOONLIGHT = new THREE.Color(0xa8bcd8);
const HEARTH = new THREE.Color(0xff9b4a);

export class Lighting {
  readonly group = new THREE.Group();

  private sun = new THREE.DirectionalLight(0xffffff, 0);
  private moon = new THREE.DirectionalLight(0xffffff, 0);
  private sky = new THREE.HemisphereLight(0xffffff, 0xffffff, 0);
  private hearth = new THREE.PointLight(HEARTH, 0, 9, 2);
  private lamp = new THREE.PointLight(0xffb066, 0, 7, 2);

  private colour = new THREE.Color();

  constructor() {
    this.setUpShadow(this.sun);
    // Only the sun casts. A second shadow-casting light doubles the cost
    // for something nobody looks at.
    this.moon.castShadow = false;

    this.hearth.position.set(worldX(15.2), 1.0, worldZ(18.6));
    this.lamp.position.set(worldX(11), 1.2, worldZ(11));

    this.group.add(this.sun, this.sun.target, this.moon, this.moon.target, this.sky, this.hearth, this.lamp);
  }

  private setUpShadow(light: THREE.DirectionalLight): void {
    light.castShadow = true;
    light.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);

    // Tight around the plot and nothing more — this is what keeps the
    // shadows sharp at 2048 and the frame budget intact. It has to clear
    // the plot's diagonal, not its side, or a low sun clips the corners
    // exactly when it is throwing the longest shadows.
    const half = Math.hypot(GRID_W, GRID_H) / 2 + 2;
    const cam = light.shadow.camera;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.near = 1;
    cam.far = LIGHT_DISTANCE * 2.4;
    cam.updateProjectionMatrix();

    light.shadow.bias = -0.0015;
    light.shadow.normalBias = 0.035;
  }

  /** Whether the sun is up enough to bother casting. */
  private static isDaylight(altitudeDeg: number): boolean {
    return altitudeDeg > -0.5;
  }

  update(s: Snapshot, hour: number): void {
    const day = s.dayOfYear;
    const season = seasonOfDay(day);
    const winter = season === 'winter';
    const cloud = s.weather.cloud;
    const absDay = (s.year - 1) * 60 + day;

    const sunPos = sunPosition(day, hour);
    const daytime = Lighting.isDaylight(sunPos.altitude);

    // —— the sun ——
    place(this.sun, sunPos.altitude, sunPos.azimuth);

    if (daytime) {
      // Height above the horizon drives both brightness and colour.
      const climb = clamp01(sunPos.altitude / 45);
      // Thick cloud flattens the sun to a grey wash.
      const clear = 1 - cloud * 0.82;

      this.colour.copy(LOW_SUN).lerp(NOON_SUN, climb);
      this.colour.lerp(OVERCAST, cloud * 0.75);
      this.sun.color.copy(this.colour);
      // Physical light units: full sun sits near 3.5, not near 1.
      this.sun.intensity = (0.5 + climb * 3.1) * clear;

      // Overcast light comes from everywhere, so the shadows go soft and
      // shallow rather than simply darker.
      this.sun.shadow.radius = 1 + cloud * 6;
      this.sun.castShadow = cloud < 0.93;
    } else {
      this.sun.intensity = 0;
      this.sun.castShadow = false;
    }

    // —— sky fill ——
    if (daytime) {
      const skyTop = winter ? WINTER_SKY : SUMMER_SKY;
      const skyBottom = winter ? WINTER_EARTH : SUMMER_EARTH;
      this.sky.color.copy(skyTop).lerp(OVERCAST, cloud * 0.5);
      this.sky.groundColor.copy(skyBottom);
      // Overcast scatters more light down, not less — the sky becomes the source.
      this.sky.intensity = 0.9 + cloud * 1.1;
    } else {
      this.sky.color.copy(NIGHT_SKY);
      this.sky.groundColor.copy(NIGHT_EARTH);
      this.sky.intensity = 0.32;
    }

    // —— the moon ——
    const moonPos = moonPosition(absDay, hour, day);
    const lit = moonIllumination(absDay);
    place(this.moon, moonPos.altitude, moonPos.azimuth);

    if (!daytime && moonPos.altitude > 0) {
      // A full moon on snow under a clear sky is genuinely workable light.
      const snowBounce = winter ? 1.5 : 1;
      this.moon.color.copy(MOONLIGHT);
      this.moon.intensity = lit * (1 - cloud * 0.9) * 1.15 * snowBounce
        * clamp01(moonPos.altitude / 30);
    } else {
      this.moon.intensity = 0;
    }

    // —— the hearth, and a lamp if you are still out ——
    // The fire is lit when there is wood to lay on it.
    const fire = s.store.firewood > 0;
    // Point lights are in candela; a hearth through a doorway is a lot of them.
    this.hearth.intensity = daytime ? 0 : fire ? 14 : 3;
    this.lamp.intensity = !daytime && s.hoursLeft <= 0 ? 9 : 0;
  }

  /** Background colour of the sky itself, for the renderer to clear with. */
  skyColour(s: Snapshot, hour: number, out: THREE.Color): THREE.Color {
    const alt = sunPosition(s.dayOfYear, hour).altitude;
    const cloud = s.weather.cloud;
    if (alt > 8) {
      out.set(0x9db4c4).lerp(new THREE.Color(0x8e969b), cloud);
    } else if (alt > -6) {
      // Dawn and dusk: the low sun stains the whole sky.
      const t = clamp01((alt + 6) / 14);
      out.set(0x6a5a5e).lerp(new THREE.Color(0x9db4c4), t);
      out.lerp(new THREE.Color(0x7e8288), cloud * 0.6);
    } else {
      out.set(0x1b2430);
    }
    return out;
  }
}

/**
 * Put a directional light on the sky dome.
 * Azimuth is degrees clockwise from north; the scene has north at -Z.
 */
function place(light: THREE.DirectionalLight, altitudeDeg: number, azimuthDeg: number): void {
  const alt = altitudeDeg * RAD;
  const az = azimuthDeg * RAD;
  const horizontal = Math.cos(alt) * LIGHT_DISTANCE;
  light.position.set(
    Math.sin(az) * horizontal,
    Math.sin(alt) * LIGHT_DISTANCE,
    -Math.cos(az) * horizontal
  );
  light.target.position.set(0, 0, 0);
  light.target.updateMatrixWorld();
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
