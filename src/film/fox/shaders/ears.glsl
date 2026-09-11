// The Khronos fox has no ear bones. Ear vertices carry aEar: the sign is the side
// (+ = the fox's left, +x) and the magnitude is how much of the ear the vertex is.
// Ears fold around a pivot at their base in bind space, before skinning, so the
// head bone still carries them. Positive angle perks forward, negative folds back.

uniform float uEarL;
uniform float uEarR;
uniform vec3 uEarBaseL;
uniform vec3 uEarBaseR;
attribute float aEar;

vec3 foxEars(vec3 p) {
  float amount = abs(aEar);
  if (amount < 0.001) return p;
  bool left = aEar > 0.0;
  vec3 base = left ? uEarBaseL : uEarBaseR;
  float angle = (left ? uEarL : uEarR) * amount;
  vec3 q = p - base;
  float c = cos(angle);
  float s = sin(angle);
  q = vec3(q.x, c * q.y - s * q.z, s * q.y + c * q.z);
  return base + q;
}
