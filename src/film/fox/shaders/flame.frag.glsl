uniform vec3 uTint;
uniform float uTintMix;
vec3 tinted(vec3 c) {
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  return mix(c, uTint * lum * 1.8, uTintMix);
}
// Approach A flame body. Prepended at build: common, noise.glsl.

uniform float uTime;
uniform float uHeat;
uniform float uWarm;
uniform float uBreath;
uniform float uIntensity;
uniform float uGhost;
uniform sampler2D uMap;
uniform vec3 uDeep;
uniform vec3 uFire;
uniform vec3 uEmber;
uniform vec3 uCore;
uniform vec3 uGold;

varying vec3 vNormalView;
varying vec3 vViewPosition;
varying vec2 vUv;
varying float vTongue;
varying float vHeight;
varying vec3 vModelPosition;

void main() {
  vec3 n = normalize(vNormalView);
  vec3 v = normalize(vViewPosition);
  float facing = abs(dot(n, v));
  float rim = pow(1.0 - facing, 2.4);

  // The fur texture keeps the fox readable: pale chest, muzzle and tail tip
  // burn hotter, dark legs and ear backs burn lower.
  vec3 fur = texture2D(uMap, vUv).rgb;
  float lum = dot(fur, vec3(0.299, 0.587, 0.114));

  // Rising streaks in model space (UV islands on this low-poly mesh would make
  // spots). Stretched vertically and scrolled up so they read as flame licks.
  vec3 mp = vModelPosition;
  float streak = snoise(vec3(mp.x * 0.09, mp.y * 0.035 - uTime * 1.9, mp.z * 0.09));
  float fine = snoise(vec3(mp.x * 0.22, mp.y * 0.09 - uTime * 3.1, mp.z * 0.22));
  float burn = clamp(0.62 + streak * 0.3 + fine * 0.15 + vTongue * 0.15, 0.0, 1.0);
  vec3 body = mix(uDeep, uFire, smoothstep(0.25, 0.8, burn));
  body = mix(body, uEmber, smoothstep(0.5, 0.9, lum) * smoothstep(0.55, 0.95, burn) * 0.65);
  body *= mix(0.4, 1.0, smoothstep(0.06, 0.28, lum));

  vec3 color = body + uEmber * rim * (0.55 + 0.35 * burn);
  color = mix(color, uCore, (1.0 - rim) * uHeat * burn * 0.6);
  color = mix(color, uGold, uWarm * 0.45);
  color *= uBreath * uIntensity;

  if (uGhost > 0.5) {
    // Approach C: only a faint fresnel shell under the embers, so the silhouette
    // still reads when the fox is small in frame.
    float shell = rim * 0.5 + 0.03;
    gl_FragColor = vec4(tinted(mix(uFire, uEmber, rim) * uBreath * uIntensity), shell);
  } else {
    gl_FragColor = vec4(tinted(color), 1.0);
  }
  #include <colorspace_fragment>
}
