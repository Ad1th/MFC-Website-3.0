// GPU-skinned surface particles. One shader for both approaches:
//   aKind 0: body point that stays on the skinned surface (approach B)
//   aKind 1: ember that leaves the surface and rises (approach A emitter, B shedding)
// Stateless: every particle is a pure function of time and its seed, so scrubbing
// and reversing never leave anything behind.
// Prepended at build: common, USE_SKINNING define, skinning pars, ears.glsl.

uniform float uTime;
uniform float uLife;
uniform float uSize;
uniform float uScale;
uniform float uFoxSprite;
uniform float uRise;
uniform float uSpread;
uniform float uHeat;
uniform float uBreath;
uniform vec3 uVelocity;
uniform vec3 uWind;

attribute vec4 aSeed;
attribute float aKind;
attribute float aLum;

varying float vAge;
varying float vKind;
varying float vLum;
varying float vHeat;

void main() {
  #include <skinbase_vertex>
  vec3 transformed = foxEars(position);
  #include <skinning_vertex>

  vec3 p = transformed;
  float size = uSize;
  float age = 0.0;

  if (aKind > 0.5) {
    float life = uLife * (0.55 + aSeed.w * 0.9);
    age = fract(uTime / life + aSeed.x);
    float a = age * life;
    vec3 swirl = vec3(
      sin(p.y * 0.07 + uTime * 2.3 + aSeed.y * 6.2831),
      0.35 * sin(p.z * 0.05 + uTime * 1.9 + aSeed.x * 6.2831),
      cos(p.x * 0.07 + uTime * 1.6 + aSeed.z * 6.2831)
    );
    p += swirl * uSpread * a;
    p.y += uRise * a * (1.0 + a);
    p += uWind * a * 40.0;
    p -= uVelocity * a;
    size *= (1.0 - age) * (0.55 + aSeed.y * 0.9) * (1.0 + uHeat * 0.4);
  } else {
    float flicker = sin(uTime * 8.0 + aSeed.x * 40.0) * 0.5 + 0.5;
    p += (aSeed.xyz - 0.5) * 1.1 * (0.35 + flicker);
    size *= (0.55 + 0.45 * flicker) * uBreath;
  }

  vAge = age;
  vKind = aKind;
  vLum = aLum;
  vHeat = uHeat;

  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  // Foxes need a few pixels to read as foxes (Konami code).
  gl_PointSize = clamp(size * uScale / -mvPosition.z * (1.0 + 2.5 * uFoxSprite), 1.0 + 6.0 * uFoxSprite, 64.0);
  gl_Position = projectionMatrix * mvPosition;
}
