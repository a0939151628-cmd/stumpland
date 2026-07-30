/**
 * Asset loading. Kenney Nature Kit, CC0.
 *
 * Every model arrives as several primitives, one per material, with no
 * textures — just a flat baseColorFactor each. We bake those colours into
 * vertex colours and merge the primitives into a single geometry, so each
 * model type becomes exactly one InstancedMesh sharing one material.
 *
 * The palette is graded on the way in: Kenney's greens are brighter than
 * this game wants. Everything is pulled toward earth, ash and dried grass.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type ModelName =
  | 'tree_default' | 'tree_oak' | 'tree_detailed' | 'tree_cone' | 'tree_blocks'
  | 'tree_default_fall' | 'tree_oak_fall'
  | 'stump_round' | 'stump_old' | 'stump_square' | 'stump_roundDetailed'
  | 'fence_simple' | 'fence_corner' | 'fence_gate'
  | 'crops_wheatStageA' | 'crops_wheatStageB'
  | 'crops_dirtSingle' | 'crops_dirtRow'
  | 'grass' | 'grass_large'
  | 'rock_smallA' | 'rock_smallB' | 'rock_smallC' | 'rock_largeA'
  | 'ground_grass' | 'ground_pathTile' | 'ground_riverTile'
  | 'log_stack' | 'log_stackLarge' | 'log' | 'campfire_logs';

/**
 * The palette. Earth, ash, dried grass, cold blue.
 *
 * Kenney names every material, so we repaint by name rather than trying
 * to grade his colours — his greens are a bright mint that has no place
 * in a wet northern spring.
 */
export const PALETTE: Record<string, number> = {
  grass: 0x7c8055,      // dried grass, the ground everywhere
  leafsGreen: 0x59684a, // foliage, darker and greyer than the ground
  leafsFall: 0x8a7444,
  woodBark: 0x554639,
  wood: 0x6a5947,
  woodDark: 0x473c31,
  woodBirch: 0x9a9285,
  woodInner: 0x87795f,
  dirt: 0x7a6752,
  dirtDark: 0x5d4d3d,
  stone: 0x87857f,      // ash
  water: 0x5c707b,      // cold blue
  _defaultMat: 0x8a8681,
};

/**
 * Fallback for anything unnamed: drop most of the saturation and settle
 * the lightness. No neon, nothing that sings.
 */
export function mute(c: THREE.Color): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return c.setHSL(hsl.h, hsl.s * 0.3, hsl.l * 0.8 + 0.06);
}

function paint(materialName: string | undefined, fallback: THREE.Color): THREE.Color {
  const hit = materialName ? PALETTE[materialName] : undefined;
  return hit !== undefined ? new THREE.Color(hit) : mute(fallback.clone());
}

const loader = new GLTFLoader();

/**
 * Load one model and flatten it to a single geometry with vertex colours.
 */
export async function loadGeometry(name: ModelName): Promise<THREE.BufferGeometry> {
  const gltf = await loader.loadAsync(`models/${name}.glb`);
  const parts: THREE.BufferGeometry[] = [];

  gltf.scene.updateWorldMatrix(true, true);
  gltf.scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const geom = node.geometry.clone() as THREE.BufferGeometry;
    geom.applyMatrix4(node.matrixWorld);

    // One flat colour per primitive, baked per vertex.
    const mat = node.material as THREE.MeshStandardMaterial;
    const colour = paint(mat.name, mat.color ?? new THREE.Color(0xffffff));
    const count = geom.attributes.position!.count;
    const colours = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colours[i * 3] = colour.r;
      colours[i * 3 + 1] = colour.g;
      colours[i * 3 + 2] = colour.b;
    }
    geom.setAttribute('color', new THREE.BufferAttribute(colours, 3));

    // Merging needs matching attribute sets; UVs are useless here.
    for (const key of Object.keys(geom.attributes)) {
      if (key !== 'position' && key !== 'normal' && key !== 'color') {
        geom.deleteAttribute(key);
      }
    }
    if (!geom.attributes.normal) geom.computeVertexNormals();
    parts.push(geom);
  });

  if (parts.length === 0) throw new Error(`${name}: no meshes`);
  const merged = parts.length === 1 ? parts[0]! : mergeGeometries(parts, false);
  if (!merged) throw new Error(`${name}: could not merge primitives`);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export type Library = Record<ModelName, THREE.BufferGeometry>;

export async function loadLibrary(names: readonly ModelName[]): Promise<Library> {
  const loaded = await Promise.all(names.map(async (n) => [n, await loadGeometry(n)] as const));
  return Object.fromEntries(loaded) as Library;
}

/** One material for the whole scene. Flat, unlit-ish, no PBR. */
export function makeMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ vertexColors: true });
}

export interface WindUniforms {
  uTime: { value: number };
  /** Wind vector in world XZ, magnitude is strength. */
  uWind: { value: THREE.Vector2 };
}

/**
 * The same flat material, with a vertex sway for anything that bends —
 * grass, standing crops. The sway is proportional to height above the
 * tile, so stems lean and roots stay put.
 *
 * Done with onBeforeCompile rather than a custom shader so the material
 * keeps Lambert's lighting, and so the sun and moon still apply to it.
 */
export function makeWindMaterial(uniforms: WindUniforms): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWind = uniforms.uWind;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         uniform vec2 uWind;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         {
           // World position of this instance, so neighbouring plants are
           // out of phase and the field ripples rather than pulsing.
           #ifdef USE_INSTANCING
             vec3 instOrigin = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
           #else
             vec3 instOrigin = vec3(0.0);
           #endif
           float strength = length(uWind);
           float phase = uTime * 1.7 + instOrigin.x * 0.55 + instOrigin.z * 0.41;
           // Gusts: a slow envelope over the fast rustle.
           float gust = 0.65 + 0.35 * sin(uTime * 0.31 + instOrigin.x * 0.09);
           float bend = sin(phase) * strength * gust;
           // Only the part above the ground moves, squared so tips lead.
           float h = max(transformed.y, 0.0);
           transformed.xz += normalize(uWind + vec2(1e-5)) * bend * h * h * 0.55;
         }`
      );
  };

  return mat;
}
