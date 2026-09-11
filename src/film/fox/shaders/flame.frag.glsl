// Approach A flame body. Prepended at build: common, noise.glsl.

uniform float uTime;
uniform float uHeat;
uniform float uWarm;
uniform float uBreath;
uniform float uIntensity;
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

void main() {
  vec3 n = normalize(vNormalView);
  vec3 v = normalize(vViewPosition);
  float facing = abs(dot(n, v));
  float rim = pow(1.0 - facing, 2.4);

  // The fur texture keeps the fox readable: pale chest, muzzle and tail tip
  // burn hotter, dark legs and ear backs burn lower.
  vec3 fur = texture2D(uMap, vUv).rgb;
  float lum = dot(fur, vec3(0.299, 0.587, 0.114));

  float bands = snoise(vec3(vUv * 7.0, uTime * 0.9)) * 0.5 + 0.5;
  vec3 body = mix(uDeep, uFire, clamp(0.3 + bands * 0.5 + vTongue * 0.2, 0.0, 1.0));
  body = mix(body, uEmber, smoothstep(0.45, 0.85, lum) * 0.65);
  body *= mix(0.45, 1.0, smoothstep(0.06, 0.28, lum));

  vec3 color = body + uEmber * rim * 1.25;
  color = mix(color, uCore, (1.0 - rim) * uHeat * 0.7);
  color = mix(color, uGold, uWarm * 0.45);
  color *= uBreath * uIntensity;

  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
