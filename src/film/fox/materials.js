import { AdditiveBlending, Color, ShaderMaterial, Vector3 } from 'three';
import { PALETTE } from '../palette.js';
import { LANDMARKS } from './rig.js';
import noise from './shaders/noise.glsl?raw';
import ears from './shaders/ears.glsl?raw';
import flameVert from './shaders/flame.vert.glsl?raw';
import flameFrag from './shaders/flame.frag.glsl?raw';
import particlesVert from './shaders/particles.vert.glsl?raw';
import particlesFrag from './shaders/particles.frag.glsl?raw';
import trailVert from './shaders/trail.vert.glsl?raw';
import trailFrag from './shaders/trail.frag.glsl?raw';

const colors = () => ({
  uDeep: { value: new Color(PALETTE.flameDeep) },
  uFire: { value: new Color(PALETTE.fire) },
  uEmber: { value: new Color(PALETTE.ember) },
  uCore: { value: new Color(PALETTE.flameCore) },
  uGold: { value: new Color(PALETTE.petGold) },
});

const earUniforms = () => ({
  uEarL: { value: 0 },
  uEarR: { value: 0 },
  uEarBaseL: { value: LANDMARKS.earBaseLeft.clone() },
  uEarBaseR: { value: LANDMARKS.earBaseRight.clone() },
});

/**
 * Approach A body: the skinned mesh as flame. three adds USE_SKINNING for
 * skinned meshes automatically, so the skinning chunks work as-is.
 * @param {import('three').Texture|null} map fur texture from the glTF
 * @param {{ ghost?: boolean }} [options] ghost: faint additive fresnel shell (approach C)
 */
export function createFlameMaterial(map, { ghost = false } = {}) {
  return new ShaderMaterial({
    ...(ghost ? { transparent: true, depthWrite: false, blending: AdditiveBlending } : {}),
    uniforms: {
      ...colors(),
      ...earUniforms(),
      uTime: { value: 0 },
      uHeat: { value: 0 },
      uWarm: { value: 0 },
      uBreath: { value: 1 },
      uFlicker: { value: 1 },
      uIntensity: { value: 1.15 },
      uGhost: { value: ghost ? 1 : 0 },
      // White by default; S05's prism tints split foxes red, green and blue.
      uTint: { value: new Color(1, 1, 1) },
      uWind: { value: new Vector3() },
      uMap: { value: map },
    },
    vertexShader: `#include <common>\n#include <skinning_pars_vertex>\n${noise}\n${ears}\n${flameVert}`,
    fragmentShader: `#include <common>\n${noise}\n${flameFrag}`,
  });
}

/**
 * Surface particles skinned on the GPU from the fox's bone texture.
 * Points are not skinned meshes, so the skinning uniforms are wired by hand.
 * @param {import('three').SkinnedMesh} mesh the fox mesh these particles follow
 * @param {{ size?: number, life?: number, rise?: number, spread?: number, opacity?: number }} [options]
 */
export function createParticleMaterial(mesh, { size = 1.6, life = 0.9, rise = 42, spread = 9, opacity = 1 } = {}) {
  const skeleton = mesh.skeleton;
  if (!skeleton.boneTexture) skeleton.computeBoneTexture();
  return new ShaderMaterial({
    defines: { USE_SKINNING: '' },
    uniforms: {
      ...colors(),
      ...earUniforms(),
      boneTexture: { value: skeleton.boneTexture },
      bindMatrix: { value: mesh.bindMatrix },
      bindMatrixInverse: { value: mesh.bindMatrixInverse },
      uTime: { value: 0 },
      uTint: { value: new Color(1, 1, 1) },
      uLife: { value: life },
      uSize: { value: size },
      uScale: { value: 500 },
      uRise: { value: rise },
      uSpread: { value: spread },
      uHeat: { value: 0 },
      uBreath: { value: 1 },
      uWarm: { value: 0 },
      uIntensity: { value: 1.4 },
      uOpacity: { value: opacity },
      uVelocity: { value: new Vector3() },
      uWind: { value: new Vector3() },
    },
    vertexShader: `#include <common>\n#include <skinning_pars_vertex>\n${ears}\n${particlesVert}`,
    fragmentShader: `#include <common>\n${particlesFrag}`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

export function createTrailMaterial() {
  return new ShaderMaterial({
    uniforms: {
      uFire: { value: new Color(PALETTE.fire) },
      uEmber: { value: new Color(PALETTE.ember) },
      uIntensity: { value: 0.95 },
      uOpacity: { value: 0.55 },
    },
    vertexShader: trailVert,
    fragmentShader: `#include <common>\n${trailFrag}`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}
