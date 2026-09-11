uniform vec3 uFire;
uniform vec3 uEmber;
uniform float uIntensity;
uniform float uOpacity;

varying float vAge;
varying float vSide;

void main() {
  // A light streak, not a ribbon: hot narrow core, soft falloff, fire colour as it ages.
  float edge = 1.0 - abs(vSide);
  float core = pow(edge, 3.0);
  float glow = pow(edge, 1.2);
  float fade = pow(clamp(1.0 - vAge, 0.0, 1.0), 2.4);
  vec3 color = mix(uEmber, uFire, smoothstep(0.0, 0.35, vAge));
  color = mix(color, vec3(1.0, 0.94, 0.86), core * (1.0 - smoothstep(0.0, 0.25, vAge)) * 0.6);
  float alpha = fade * (glow * 0.35 + core * 0.65) * uOpacity;
  gl_FragColor = vec4(color * uIntensity, alpha);
  #include <colorspace_fragment>
}
