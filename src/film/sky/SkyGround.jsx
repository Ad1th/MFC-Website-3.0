import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { AdditiveBlending, Color, SRGBColorSpace, Vector3 } from 'three';
import { PALETTE } from '../palette.js';
import { site } from '../../content/index.js';
import { FILM_FREEZE } from '../testHooks.js';

/**
 * The subcontinent at night under S03's last cloud layer: a ground plane centred on Vellore
 * that samples the same Black Marble texture as the globe over a 20° window, tinted toward
 * --ember, with a faint day-map base so coastlines read. A glowing fibre runs in from
 * Chennai to Vellore; the fox dives into it and an impact flash blooms at the end.
 * Sky units: the plane is GROUND_SIZE across and Vellore is at the origin, north is -z.
 */

export const GROUND_SIZE = 480;
const SPAN = 20;
const CHENNAI = { lat: 13.0827, lon: 80.2707 };

/** Ground-plane position (y = 0) for a latitude and longitude near Vellore. */
export function groundPoint(lat, lon, out = new Vector3()) {
  return out.set(((lon - site.campus.lon) / SPAN) * GROUND_SIZE, 0, (-(lat - site.campus.lat) / SPAN) * GROUND_SIZE);
}

const GROUND_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GROUND_FRAGMENT = /* glsl */ `
  uniform sampler2D uNight;
  uniform sampler2D uDay;
  uniform vec2 uCampus;   // lon, lat in degrees
  uniform float uSpan;
  uniform vec3 uEmber;
  uniform float uFade;
  varying vec2 vUv;
  void main() {
    float lon = uCampus.x - uSpan * 0.5 + vUv.x * uSpan;
    float lat = uCampus.y - uSpan * 0.5 + vUv.y * uSpan;
    vec2 tex = vec2((lon + 180.0) / 360.0, (lat + 90.0) / 180.0);
    float city = pow(texture2D(uNight, tex).r, 1.8);
    vec3 base = texture2D(uDay, tex).rgb * vec3(0.03, 0.035, 0.05);
    // Fade out toward the plane's edge so it never shows a border against the night.
    float edge = smoothstep(0.5, 0.36, length(vUv - 0.5));
    gl_FragColor = vec4((uEmber * city * 2.2 + base) * edge * uFade, 1.0);
    #include <colorspace_fragment>
  }
`;

const GLOW_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GLOW_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uShape; // 0 = round glow, 1 = line (uv.y across)
  varying vec2 vUv;
  void main() {
    // Circular mask: the glow reaches exactly zero inside the quad, so its square edge never shows.
    float r = length(vUv - 0.5);
    float round = exp(-dot(vUv - 0.5, vUv - 0.5) * 18.0) * (1.0 - smoothstep(0.32, 0.5, r));
    float line = exp(-pow((vUv.y - 0.5) / 0.12, 2.0));
    float shape = mix(round, line, uShape);
    gl_FragColor = vec4(uColor * shape * uIntensity, 1.0);
    #include <colorspace_fragment>
  }
`;

function glowMaterial(color, shape) {
  return {
    uniforms: { uColor: { value: new Color(color) }, uIntensity: { value: 0 }, uShape: { value: shape } },
    vertexShader: GLOW_VERTEX,
    fragmentShader: GLOW_FRAGMENT,
  };
}

/**
 * @param {{ tier: number, origin: Vector3, progressRef: { current: number }, fibre: [number, number], impact: [number, number], reveal: [number, number] }} props
 *   reveal: the ground fades in over this progress range, once the fox is below the clouds
 */
export default function SkyGround({ tier, origin, progressRef, fibre, impact, reveal }) {
  const size = tier >= 3 ? 4096 : 2048;
  const [night, day] = useTexture([`/textures/earth/night-${size}.webp`, `/textures/earth/day-${size}.webp`]);
  night.colorSpace = SRGBColorSpace;
  day.colorSpace = SRGBColorSpace;

  const ground = useMemo(
    () => ({
      uniforms: {
        uNight: { value: night },
        uDay: { value: day },
        uCampus: { value: [site.campus.lon, site.campus.lat] },
        uSpan: { value: SPAN },
        uEmber: { value: new Color(PALETTE.ember) },
        uFade: { value: 0 },
      },
      vertexShader: GROUND_VERTEX,
      fragmentShader: GROUND_FRAGMENT,
    }),
    [night, day],
  );

  const fibreLine = useMemo(() => {
    const chennai = groundPoint(CHENNAI.lat, CHENNAI.lon);
    const length = chennai.length();
    return { length, angle: Math.atan2(-chennai.z, chennai.x), mid: chennai.clone().multiplyScalar(0.5) };
  }, []);

  const fibreMaterial = useMemo(() => glowMaterial(PALETTE.fire, 1), []);
  const velloreMaterial = useMemo(() => glowMaterial(PALETTE.ember, 0), []);
  const flashMaterial = useMemo(() => glowMaterial(PALETTE.flameCore, 0), []);
  const flashRef = useRef(null);

  useFrame((state) => {
    const p = progressRef.current;
    const ramp = (a, b) => Math.min(Math.max((p - a) / (b - a), 0), 1);
    ground.uniforms.uFade.value = ramp(reveal[0], reveal[1]);
    fibreMaterial.uniforms.uIntensity.value = 1.6 * ramp(fibre[0], fibre[1]);
    const pulse = FILM_FREEZE ? 0.5 : 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * Math.PI * 1.6);
    velloreMaterial.uniforms.uIntensity.value = 1.2 + 0.6 * pulse;
    const flash = ramp(impact[0], impact[1]);
    const bloom = Math.sin(Math.PI * Math.min(flash * 1.4, 1));
    flashMaterial.uniforms.uIntensity.value = 1.4 * bloom;
    if (flashRef.current) {
      flashRef.current.visible = bloom > 0.001;
      flashRef.current.scale.setScalar(8 + 60 * flash);
    }
  });

  return (
    <group position={origin}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={-2}>
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE, 1, 1]} />
        {/* Additive: an unrevealed ground adds nothing instead of painting a black horizon over the sky. */}
        <shaderMaterial args={[ground]} transparent depthWrite={false} blending={AdditiveBlending} />
      </mesh>
      <mesh position={[fibreLine.mid.x, 0.05, fibreLine.mid.z]} rotation={[-Math.PI / 2, 0, fibreLine.angle]}>
        <planeGeometry args={[fibreLine.length, 1.2]} />
        <shaderMaterial args={[fibreMaterial]} transparent depthWrite={false} blending={AdditiveBlending} />
      </mesh>
      <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[10, 10]} />
        <shaderMaterial args={[velloreMaterial]} transparent depthWrite={false} blending={AdditiveBlending} />
      </mesh>
      <mesh ref={flashRef} position={[0, 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial args={[flashMaterial]} transparent depthWrite={false} blending={AdditiveBlending} />
      </mesh>
    </group>
  );
}
