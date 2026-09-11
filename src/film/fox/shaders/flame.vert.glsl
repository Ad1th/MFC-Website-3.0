// Approach A: the skinned fox mesh rendered as a flame body.
// Prepended at build: common, skinning pars, noise.glsl, ears.glsl.

uniform float uTime;
uniform float uFlicker;
uniform vec3 uWind;

varying vec3 vNormalView;
varying vec3 vViewPosition;
varying vec2 vUv;
varying float vTongue;
varying float vHeight;

void main() {
  vUv = uv;

  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>

  vec3 transformed = foxEars(position);
  #include <skinning_vertex>

  vec3 n = normalize(objectNormal);
  float upward = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);

  // Flame tongues: noise scrolled upward, strongest on upward-facing surfaces.
  float tongue = snoise(transformed * 0.055 + vec3(0.0, -uTime * 1.7, uTime * 0.35));
  float lick = max(tongue, 0.0) * smoothstep(0.45, 1.0, upward);
  transformed += n * (lick * 2.6 + tongue * 0.45) * uFlicker;
  transformed.y += lick * lick * 4.0 * uFlicker;
  transformed += uWind * lick * 5.0;

  vTongue = tongue;
  vHeight = transformed.y / 80.0;

  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  vViewPosition = -mvPosition.xyz;
  vNormalView = normalize(normalMatrix * n);
  gl_Position = projectionMatrix * mvPosition;
}
