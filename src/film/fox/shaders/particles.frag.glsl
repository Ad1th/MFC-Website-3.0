uniform vec3 uDeep;
uniform vec3 uFire;
uniform vec3 uEmber;
uniform vec3 uCore;
uniform vec3 uGold;
uniform float uWarm;
uniform float uIntensity;
uniform float uOpacity;

varying float vAge;
varying float vKind;
varying float vLum;
varying float vHeat;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float disc = smoothstep(0.5, 0.05, d);
  if (disc <= 0.001) discard;

  vec3 color;
  float alpha;
  if (vKind > 0.5) {
    color = mix(uCore, uEmber, smoothstep(0.0, 0.2, vAge));
    color = mix(color, uFire, smoothstep(0.2, 0.65, vAge));
    color = mix(color, uDeep, smoothstep(0.65, 1.0, vAge));
    alpha = disc * smoothstep(0.0, 0.06, vAge) * (1.0 - vAge);
  } else {
    color = mix(uDeep, uFire, 0.55 + disc * 0.45);
    color = mix(color, uEmber, smoothstep(0.45, 0.85, vLum) * 0.7);
    color *= mix(0.45, 1.0, smoothstep(0.06, 0.28, vLum));
    color = mix(color, uCore, vHeat * disc * 0.35);
    alpha = disc * 0.85;
  }
  color = mix(color, uGold, uWarm * 0.4);

  gl_FragColor = vec4(color * uIntensity, alpha * uOpacity);
  #include <colorspace_fragment>
}
