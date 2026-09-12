import { forwardRef, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { AdditiveBlending, Color, SRGBColorSpace, SphereGeometry, Vector3 } from 'three';
import { PALETTE } from '../palette.js';
import { latLonToVector, sunDirection } from '../sun.js';
import { filmNow } from '../../live/clock.js';
import { site } from '../../content/index.js';
import { FILM_FREEZE } from '../testHooks.js';

/**
 * The live Earth (S01, S03, S10). Radius 1 in its own group; scenes scale and place it.
 *   surface     day (Blue Marble) and night (Black Marble tinted toward --ember) blended
 *               by the object-space normal against the real subsolar direction, so the
 *               terminator is right however the globe is turned
 *   atmosphere  a thin fresnel rim in --fire at low intensity
 *   vellore     the brightest point on the planet, pulsing
 * Texture resolution follows the quality tier: 4096 at tier 3, 2048 below.
 */

const SURFACE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalObject;
  varying vec3 vNormalWorld;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vNormalObject = normalize(normal);
    vNormalWorld = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SURFACE_FRAGMENT = /* glsl */ `
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform vec3 uSun;
  uniform vec3 uNightTint;
  uniform vec3 uDayShade;
  varying vec2 vUv;
  varying vec3 vNormalObject;
  varying vec3 vNormalWorld;
  varying vec3 vWorld;

  void main() {
    float light = dot(normalize(vNormalObject), uSun);
    float dayMix = smoothstep(-0.06, 0.14, light);

    vec3 day = texture2D(uDay, vUv).rgb;
    // A blue-grey planet, so the fox is the only strong colour on it by day.
    float luma = dot(day, vec3(0.2126, 0.7152, 0.0722));
    day = mix(day, luma * uDayShade, 0.45) * (0.25 + 0.95 * max(light, 0.0));

    float city = texture2D(uNight, vUv).r;
    city = pow(city, 1.8);
    vec3 night = uNightTint * city * 1.6 + vec3(0.004, 0.005, 0.008);
    night *= 1.0 - smoothstep(-0.2, 0.04, light);

    vec3 color = mix(night, day, dayMix);

    // Ocean glint on the lit side.
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float rim = 1.0 - max(dot(normalize(vNormalWorld), viewDir), 0.0);
    color += vec3(0.05, 0.07, 0.1) * pow(rim, 3.0) * dayMix;

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const ATMOSPHERE_VERTEX = /* glsl */ `
  varying vec3 vNormalObject;
  varying vec3 vNormalWorld;
  varying vec3 vWorld;
  void main() {
    vNormalObject = normalize(normal);
    vNormalWorld = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const ATMOSPHERE_FRAGMENT = /* glsl */ `
  uniform vec3 uSun;
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec3 vNormalObject;
  varying vec3 vNormalWorld;
  varying vec3 vWorld;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fresnel = pow(1.0 - max(dot(normalize(vNormalWorld), viewDir), 0.0), 7.0);
    float lit = smoothstep(-0.35, 0.4, dot(normalize(vNormalObject), uSun));
    gl_FragColor = vec4(uColor * fresnel * uIntensity * (0.25 + 0.75 * lit), 1.0);
    #include <colorspace_fragment>
  }
`;

const POINT_VERTEX = /* glsl */ `
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uPulse;
  void main() {
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = uSize * uPixelRatio * (1.0 + 0.35 * uPulse);
  }
`;

const POINT_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uPulse;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float d = dot(p, p);
    if (d > 1.0) discard;
    float core = exp(-d * 9.0);
    float halo = exp(-d * 2.5) * (0.35 + 0.4 * uPulse);
    gl_FragColor = vec4(uColor * (core * 2.2 + halo), 1.0);
    #include <colorspace_fragment>
  }
`;

const sunTmp = new Vector3();

/**
 * Sphere with the prime meridian on +z. Rotating the geometry (not the mesh) keeps the
 * `normal` attribute in globe space, which is the space the sun direction is in.
 */
function globeSphere(widthSegments, heightSegments) {
  return new SphereGeometry(1, widthSegments, heightSegments).rotateY(-Math.PI / 2);
}

const Globe = forwardRef(function Globe({ tier = 2, spin = 0.012, children, ...props }, ref) {
  const size = tier >= 3 ? 4096 : 2048;
  const [day, night] = useTexture([`/textures/earth/day-${size}.webp`, `/textures/earth/night-${size}.webp`]);
  day.colorSpace = SRGBColorSpace;
  night.colorSpace = SRGBColorSpace;
  day.anisotropy = 4;

  const spinRef = useRef(null);
  const surfaceGeometry = useMemo(() => globeSphere(128, 64), []);
  const atmosphereGeometry = useMemo(() => globeSphere(96, 48), []);

  const surface = useMemo(
    () => ({
      uniforms: {
        uDay: { value: day },
        uNight: { value: night },
        uSun: { value: new Vector3(1, 0, 0) },
        uNightTint: { value: new Color(PALETTE.ember) },
        uDayShade: { value: new Color('#9fb0c2') },
      },
      vertexShader: SURFACE_VERTEX,
      fragmentShader: SURFACE_FRAGMENT,
    }),
    [day, night],
  );

  const atmosphere = useMemo(
    () => ({
      uniforms: { uSun: surface.uniforms.uSun, uColor: { value: new Color(PALETTE.fire) }, uIntensity: { value: 0.32 } },
      vertexShader: ATMOSPHERE_VERTEX,
      fragmentShader: ATMOSPHERE_FRAGMENT,
    }),
    [surface],
  );

  const point = useMemo(
    () => ({
      uniforms: { uColor: { value: new Color(PALETTE.ember) }, uSize: { value: 9 }, uPixelRatio: { value: 1 }, uPulse: { value: 0 } },
      vertexShader: POINT_VERTEX,
      fragmentShader: POINT_FRAGMENT,
    }),
    [],
  );

  const vellore = useMemo(() => latLonToVector(site.campus.lat, site.campus.lon).multiplyScalar(1.004), []);
  const velloreArray = useMemo(() => new Float32Array(vellore.toArray()), [vellore]);

  const lastSunUpdate = useRef(-Infinity);
  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    // The sun moves a quarter of a degree a minute; once a second is plenty.
    if (t - lastSunUpdate.current > 1) {
      lastSunUpdate.current = t;
      surface.uniforms.uSun.value.copy(sunDirection(filmNow(), sunTmp));
    }
    if (spinRef.current && !FILM_FREEZE) spinRef.current.rotation.y += delta * spin;
    point.uniforms.uPulse.value = FILM_FREEZE ? 0.5 : 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 0.8);
    point.uniforms.uPixelRatio.value = state.gl.getPixelRatio();
  });

  return (
    <group ref={ref} {...props}>
      <group ref={spinRef}>
        <mesh geometry={surfaceGeometry}>
          <shaderMaterial args={[surface]} />
        </mesh>
        <mesh geometry={atmosphereGeometry} scale={1.022}>
          <shaderMaterial args={[atmosphere]} transparent depthWrite={false} blending={AdditiveBlending} />
        </mesh>
        <points frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[velloreArray, 3]} />
          </bufferGeometry>
          <shaderMaterial args={[point]} transparent depthWrite={false} blending={AdditiveBlending} />
        </points>
        {children}
      </group>
    </group>
  );
});

export default Globe;
