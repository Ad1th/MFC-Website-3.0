uniform vec3 uTint;
uniform float uTintMix;
vec3 tinted(vec3 c) {
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  return mix(c, uTint * lum * 1.8, uTintMix);
}
uniform vec3 uDeep;
uniform vec3 uFire;
uniform vec3 uEmber;
uniform vec3 uCore;
uniform vec3 uGold;
uniform float uWarm;
uniform float uIntensity;
uniform float uOpacity;
// Konami code: every ember becomes a tiny fox head (0 = round embers, 1 = foxes).
uniform float uFoxSprite;

float insideTriangle(vec2 p, vec2 a, vec2 b, vec2 c) {
  float d1 = (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
  float d2 = (p.x - c.x) * (b.y - c.y) - (b.x - c.x) * (p.y - c.y);
  float d3 = (p.x - a.x) * (c.y - a.y) - (c.x - a.x) * (p.y - a.y);
  bool negative = (d1 < 0.0) || (d2 < 0.0) || (d3 < 0.0);
  bool positive = (d1 > 0.0) || (d2 > 0.0) || (d3 > 0.0);
  return (negative && positive) ? 0.0 : 1.0;
}

/** A fox head in point space (x right, y up, -1 to 1): a face narrowing to the nose, two ears. */
float foxHead(vec2 p) {
  float face = insideTriangle(p, vec2(-0.78, 0.22), vec2(0.78, 0.22), vec2(0.0, -0.85));
  float left = insideTriangle(p, vec2(-0.78, 0.22), vec2(-0.22, 0.22), vec2(-0.62, 0.92));
  float right = insideTriangle(p, vec2(0.22, 0.22), vec2(0.78, 0.22), vec2(0.62, 0.92));
  return max(face, max(left, right));
}

varying float vAge;
varying float vKind;
varying float vLum;
varying float vHeat;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float round = smoothstep(0.5, 0.05, d);
  vec2 q = vec2(gl_PointCoord.x * 2.0 - 1.0, 1.0 - gl_PointCoord.y * 2.0);
  float disc = mix(round, foxHead(q), uFoxSprite);
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

  gl_FragColor = vec4(tinted(color * uIntensity), alpha * uOpacity);
  #include <colorspace_fragment>
}
