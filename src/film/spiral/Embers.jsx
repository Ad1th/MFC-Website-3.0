import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import { AdditiveBlending, BufferGeometry, Color, DynamicDrawUsage, Float32BufferAttribute, Vector3 } from 'three';
import { shortDate } from '../../content/index.js';
import { mulberry32 } from '../fox/rig.js';
import { PALETTE } from '../palette.js';
import { LABEL_FRAGMENT, PLANE_VERTEX, clamp01, textTexture } from '../rooms/labels.js';
import { EMBERS, SOTY, helixLocal } from './layout.js';

/**
 * The spiral's embers. Every step the fox takes leaves a small ember on the helix (the trail, laid
 * up to the fox and cooling behind it); each event is a larger ember that blooms into
 * `DD.MM.YY NAME` as the fox passes, flagships larger. At the top every trail ember lights so the
 * spiral reads as a galaxy from above. During the Scavenger of the Year hold the event embers hide
 * and a torch (the cursor, in screen space) reveals them.
 *
 * stateRef.current: { foxS, hide, torch: [x, y] NDC, torchRadius, lights, galaxy, found }
 */

const EMBER_VERTEX = /* glsl */ `
  attribute float aBloom;
  attribute float aSize;
  uniform float uPixelRatio;
  uniform float uHide;
  uniform vec2 uTorch;
  uniform float uTorchRadius;
  uniform float uAspect;
  varying float vBloom;
  varying float vShown;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    vec2 ndc = gl_Position.xy / gl_Position.w;
    float d = length((ndc - uTorch) * vec2(uAspect, 1.0));
    vShown = mix(1.0, smoothstep(uTorchRadius, uTorchRadius * 0.55, d), uHide);
    vBloom = aBloom;
    // Clamped: close to the camera an unclamped sprite swelled into a screen-filling glow.
    gl_PointSize = min(aSize * (1.0 + aBloom * 0.9) * uPixelRatio * (26.0 / -mv.z), 64.0 * uPixelRatio);
  }
`;

const EMBER_FRAGMENT = /* glsl */ `
  uniform vec3 uFire;
  uniform vec3 uCore;
  uniform float uLights;
  varying float vBloom;
  varying float vShown;
  void main() {
    float core = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
    vec3 color = mix(uFire, uCore, core * core * (0.4 + 0.6 * vBloom));
    gl_FragColor = vec4(color * core * (0.6 + vBloom) * vShown * uLights, 1.0);
    #include <colorspace_fragment>
  }
`;

const TRAIL_VERTEX = /* glsl */ `
  attribute float aS;
  attribute float aSize;
  uniform float uFoxS;
  uniform float uGalaxy;
  uniform float uPixelRatio;
  varying float vHeat;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float behind = uFoxS - aS;
    float laid = step(0.0, behind);
    vHeat = max(laid * mix(0.12, 1.0, exp(-behind * 16.0)), uGalaxy * (0.35 + 0.65 * aS));
    gl_PointSize = min(aSize * uPixelRatio * (22.0 / -mv.z) * (0.6 + vHeat), 18.0 * uPixelRatio);
  }
`;

const TRAIL_FRAGMENT = /* glsl */ `
  uniform vec3 uFire;
  uniform vec3 uCore;
  uniform float uLights;
  varying float vHeat;
  void main() {
    float core = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
    vec3 color = mix(uFire, uCore, vHeat * core * 0.6);
    gl_FragColor = vec4(color * core * vHeat * uLights, 1.0);
    #include <colorspace_fragment>
  }
`;

const smooth = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

export default function Embers({ stateRef, tier }) {
  const labels = useMemo(
    () =>
      EMBERS.map((ember) => {
        const text = `${shortDate(ember.event.date)} ${ember.event.name.toUpperCase()}`;
        const label = textTexture(text, { size: 64, weight: ember.event.flagship ? 600 : 400 });
        const local = helixLocal(ember.s, new Vector3());
        const outward = new Vector3(local.x, 0, local.z).normalize();
        const height = ember.event.flagship ? 0.85 : 0.5;
        return {
          ember,
          text,
          label,
          height,
          position: local.clone().addScaledVector(outward, 1.2).add(new Vector3(0, 0.8, 0)),
          material: {
            uniforms: { uMap: { value: label.texture }, uColor: { value: new Color(PALETTE.ash) }, uOpacity: { value: 0 } },
            vertexShader: PLANE_VERTEX,
            fragmentShader: LABEL_FRAGMENT,
          },
        };
      }),
    [],
  );
  useEffect(() => () => labels.forEach((l) => l.label.texture.dispose()), [labels]);

  const embers = useMemo(() => {
    const geometry = new BufferGeometry();
    const positions = [];
    const sizes = [];
    for (const ember of EMBERS) {
      const p = helixLocal(ember.s, new Vector3());
      positions.push(p.x, p.y, p.z);
      sizes.push(ember.event.flagship ? 34 : 22);
    }
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new Float32BufferAttribute(sizes, 1));
    const bloom = new Float32BufferAttribute(new Float32Array(EMBERS.length), 1);
    bloom.setUsage(DynamicDrawUsage);
    geometry.setAttribute('aBloom', bloom);
    return {
      geometry,
      material: {
        uniforms: {
          uPixelRatio: { value: 1 },
          uHide: { value: 0 },
          uTorch: { value: [0, 0] },
          uTorchRadius: { value: 0.22 },
          uAspect: { value: 1.6 },
          uFire: { value: new Color(PALETTE.fire) },
          uCore: { value: new Color(PALETTE.flameCore) },
          uLights: { value: 1 },
        },
        vertexShader: EMBER_VERTEX,
        fragmentShader: EMBER_FRAGMENT,
      },
    };
  }, []);

  const trail = useMemo(() => {
    const count = tier >= 3 ? 900 : tier === 2 ? 600 : 320;
    const rand = mulberry32(71);
    const geometry = new BufferGeometry();
    const positions = [];
    const along = [];
    const sizes = [];
    const p = new Vector3();
    for (let k = 0; k < count; k += 1) {
      const s = k / count;
      helixLocal(s, p);
      const jitter = (rand() - 0.5) * 0.6;
      const outward = new Vector3(p.x, 0, p.z).normalize().multiplyScalar(jitter);
      positions.push(p.x + outward.x, p.y + (rand() - 0.5) * 0.3, p.z + outward.z);
      along.push(s);
      sizes.push(4 + rand() * 5);
    }
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aS', new Float32BufferAttribute(along, 1));
    geometry.setAttribute('aSize', new Float32BufferAttribute(sizes, 1));
    return {
      geometry,
      material: {
        uniforms: {
          uFoxS: { value: 0 },
          uGalaxy: { value: 0 },
          uPixelRatio: { value: 1 },
          uFire: { value: new Color(PALETTE.fire) },
          uCore: { value: new Color(PALETTE.flameCore) },
          uLights: { value: 1 },
        },
        vertexShader: TRAIL_VERTEX,
        fragmentShader: TRAIL_FRAGMENT,
      },
    };
  }, [tier]);

  useEffect(
    () => () => {
      embers.geometry.dispose();
      trail.geometry.dispose();
    },
    [embers, trail],
  );

  useFrame((state) => {
    const s = stateRef.current;
    const ratio = state.gl.getPixelRatio();
    const bloom = embers.geometry.getAttribute('aBloom');
    EMBERS.forEach((ember, i) => {
      const near = 1 - smooth(Math.abs(s.foxS - ember.s) / 0.06);
      bloom.setX(i, Math.max(near, s.galaxy * 0.5));
      const passed = s.foxS > ember.s ? 0.2 : 0;
      let opacity = Math.max(near, passed) * s.lights * (1 - s.hide) * (1 - s.galaxy);
      if (ember.event.slug === SOTY && s.found) opacity = Math.max(opacity, 1 - s.galaxy);
      labels[i].material.uniforms.uOpacity.value = opacity;
    });
    bloom.needsUpdate = true;

    const u = embers.material.uniforms;
    u.uPixelRatio.value = ratio;
    u.uHide.value = s.hide;
    u.uTorch.value = s.torch;
    u.uTorchRadius.value = s.torchRadius;
    u.uAspect.value = state.size.width / state.size.height;
    u.uLights.value = s.lights;
    const t = trail.material.uniforms;
    t.uPixelRatio.value = ratio;
    t.uFoxS.value = s.foxS;
    t.uGalaxy.value = s.galaxy;
    t.uLights.value = s.lights;
  });

  return (
    <>
      <points geometry={trail.geometry} frustumCulled={false}>
        <shaderMaterial args={[trail.material]} transparent depthWrite={false} blending={AdditiveBlending} />
      </points>
      <points geometry={embers.geometry} frustumCulled={false}>
        <shaderMaterial args={[embers.material]} transparent depthWrite={false} blending={AdditiveBlending} />
      </points>
      {labels.map((l) => (
        <Billboard key={l.ember.event.slug} position={l.position}>
          <mesh frustumCulled={false}>
            <planeGeometry args={[l.height * l.label.aspect, l.height]} />
            {/* Additive, like the room labels: normal blending drew the label's black quad over the embers. */}
            <shaderMaterial args={[l.material]} transparent depthWrite={false} blending={AdditiveBlending} />
          </mesh>
        </Billboard>
      ))}
    </>
  );
}

/** The label text for each event, as the embers draw it (tests compare it to events.json). */
export function emberLabels() {
  return EMBERS.map((ember) => ({ slug: ember.event.slug, text: `${shortDate(ember.event.date)} ${ember.event.name.toUpperCase()}` }));
}
