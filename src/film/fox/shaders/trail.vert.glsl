attribute float aAge;
attribute float aSide;

varying float vAge;
varying float vSide;

void main() {
  vAge = aAge;
  vSide = aSide;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
