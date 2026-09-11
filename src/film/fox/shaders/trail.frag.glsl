uniform vec3 uFire;
uniform vec3 uEmber;
uniform float uIntensity;
uniform float uOpacity;

varying float vAge;
varying float vSide;

void main() {
  float edge = 1.0 - abs(vSide);
  float fade = pow(clamp(1.0 - vAge, 0.0, 1.0), 1.6);
  vec3 color = mix(uEmber, uFire, smoothstep(0.0, 0.45, vAge));
  float alpha = fade * pow(edge, 0.7) * uOpacity;
  gl_FragColor = vec4(color * uIntensity, alpha);
  #include <colorspace_fragment>
}
