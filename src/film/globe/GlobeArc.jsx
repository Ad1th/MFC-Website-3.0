import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute } from 'three';
import { PALETTE } from '../palette.js';
import { latLonToVector } from '../sun.js';
import { whereAmI } from '../../live/whereami.js';
import { site } from '../../content/index.js';

/**
 * Your arc (S01): a great circle from the viewer's approximate city to Vellore, lifted off
 * the surface in the middle, drawn from your end as `progressRef.current` goes 0 to 1.
 * A cold --spark point marks your end. Child of the Globe's spinning group (radius 1).
 * Unknown timezone: no arc, just Vellore.
 */

const SEGMENTS = 96;

const LINE_VERTEX = /* glsl */ `
  attribute float aT;
  varying float vT;
  void main() {
    vT = aT;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const LINE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uDraw;
  varying float vT;
  void main() {
    if (vT > uDraw) discard;
    // Brighter at the drawing head, like a fuse.
    float head = smoothstep(uDraw - 0.12, uDraw, vT);
    gl_FragColor = vec4(uColor * (0.55 + 1.2 * head), 1.0);
    #include <colorspace_fragment>
  }
`;

const SPARK_VERTEX = /* glsl */ `
  uniform float uPixelRatio;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = 7.0 * uPixelRatio;
  }
`;

const SPARK_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float d = dot(p, p);
    if (d > 1.0) discard;
    gl_FragColor = vec4(uColor * exp(-d * 6.0) * 1.8 * uAlpha, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Points along the great circle from a to b (unit vectors), lifted by `lift` at the middle. */
export function greatCircle(a, b, segments, lift) {
  const angle = a.angleTo(b);
  const points = [];
  const sinAngle = Math.sin(angle) || 1;
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const p = a
      .clone()
      .multiplyScalar(Math.sin((1 - t) * angle) / sinAngle)
      .add(b.clone().multiplyScalar(Math.sin(t * angle) / sinAngle));
    if (angle < 1e-4) p.copy(a);
    points.push(p.normalize().multiplyScalar(1.006 + lift * Math.sin(Math.PI * t)));
  }
  return points;
}

export default function GlobeArc({ progressRef }) {
  const here = useMemo(() => whereAmI(), []);

  const line = useMemo(() => {
    if (here.lat === null) return null;
    const from = latLonToVector(here.lat, here.lon);
    const to = latLonToVector(site.campus.lat, site.campus.lon);
    // Longer journeys arc higher; a viewer in India gets a low hop.
    const lift = 0.03 + 0.12 * (from.angleTo(to) / Math.PI);
    const points = greatCircle(from, to, SEGMENTS, lift);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(points.flatMap((p) => p.toArray()), 3));
    geometry.setAttribute('aT', new Float32BufferAttribute(points.map((_, i) => i / SEGMENTS), 1));
    return { geometry, start: points[0] };
  }, [here]);

  const lineMaterial = useMemo(
    () => ({
      uniforms: { uColor: { value: new Color(PALETTE.fire) }, uDraw: { value: 0 } },
      vertexShader: LINE_VERTEX,
      fragmentShader: LINE_FRAGMENT,
    }),
    [],
  );
  const sparkMaterial = useMemo(
    () => ({
      uniforms: { uColor: { value: new Color(PALETTE.spark) }, uPixelRatio: { value: 1 }, uAlpha: { value: 0 } },
      vertexShader: SPARK_VERTEX,
      fragmentShader: SPARK_FRAGMENT,
    }),
    [],
  );
  const sparkPosition = useMemo(() => (line ? new Float32Array(line.start.toArray()) : null), [line]);

  useFrame((state) => {
    const p = progressRef.current;
    lineMaterial.uniforms.uDraw.value = p;
    sparkMaterial.uniforms.uAlpha.value = Math.min(1, p * 8);
    sparkMaterial.uniforms.uPixelRatio.value = state.gl.getPixelRatio();
  });

  if (!line) return null;
  return (
    <group>
      <line geometry={line.geometry} frustumCulled={false}>
        <shaderMaterial args={[lineMaterial]} transparent depthWrite={false} blending={AdditiveBlending} />
      </line>
      <points frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[sparkPosition, 3]} />
        </bufferGeometry>
        <shaderMaterial args={[sparkMaterial]} transparent depthWrite={false} blending={AdditiveBlending} />
      </points>
    </group>
  );
}

