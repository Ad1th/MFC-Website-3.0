import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, SRGBColorSpace, TextureLoader, Vector3 } from 'three';
import { PALETTE } from '../palette.js';
import { FILM_FREEZE, FILM_TEST } from '../testHooks.js';
import { LABEL_FRAGMENT, PLANE_VERTEX, textTexture } from '../rooms/labels.js';
import { LINES, POLE, SKY_LINE_DIRECTION, SKY_RADIUS, STARS } from './layout.js';

/**
 * The sky's stars, lines and portraits. One point per star (the north star brightest, the current
 * year's board bright, other years faint), faint lines within each constellation, star trails while
 * the sky spins (each star drags a short arc behind it, rotated back about the pole in the vertex
 * shader by the spin speed), the empty star's pulsing ring, the line across the sky, and the
 * hovered or focused star swelling into a round monochrome portrait lit in fire with its name.
 *
 * stateRef.current: { yearIndex, angle, spin (radians per second), hover (key|null), focus (key|null), pulse }
 */

const STAR_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aYear;
  uniform float uYear;
  uniform float uPixelRatio;
  varying float vLit;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    vLit = aYear < -0.5 ? 1.4 : mix(0.28, 1.0, step(abs(aYear - uYear), 0.1));
    gl_PointSize = min(aSize * uPixelRatio * vLit * (70.0 / -mv.z), 48.0 * uPixelRatio);
  }
`;

const STAR_FRAGMENT = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uEmber;
  varying float vLit;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.5, 0.0, d);
    vec3 color = mix(uEmber, uCore, core * core);
    gl_FragColor = vec4(color * pow(core, 1.6) * vLit, 1.0);
    #include <colorspace_fragment>
  }
`;

const TRAIL_VERTEX = /* glsl */ `
  attribute float aLag;
  uniform vec3 uPole;
  uniform float uSpin;
  varying float vFade;
  vec3 rotateAxis(vec3 v, vec3 k, float a) {
    float c = cos(a);
    float s = sin(a);
    return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
  }
  void main() {
    vFade = 1.0 - aLag;
    vec3 p = rotateAxis(position, uPole, -aLag * uSpin);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const TRAIL_FRAGMENT = /* glsl */ `
  uniform vec3 uEmber;
  uniform float uAlpha;
  varying float vFade;
  void main() {
    gl_FragColor = vec4(uEmber * vFade * uAlpha, 1.0);
    #include <colorspace_fragment>
  }
`;

const LINE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  void main() {
    gl_FragColor = vec4(uColor * uAlpha, 1.0);
    #include <colorspace_fragment>
  }
`;

const LINE_VERTEX = /* glsl */ `
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PORTRAIT_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uHasMap;
  uniform vec3 uFire;
  uniform vec3 uInk;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5);
    float mask = smoothstep(0.5, 0.47, r);
    float ring = smoothstep(0.46, 0.485, r) * smoothstep(0.5, 0.485, r);
    float g = uHasMap > 0.5 ? dot(texture2D(uMap, vUv).rgb, vec3(0.299, 0.587, 0.114)) : 0.0;
    vec3 color = mix(uInk, uFire, pow(g, 1.3)) * (0.3 + 0.95 * g);
    gl_FragColor = vec4(color * mask * uHasMap + uFire * ring, (mask * uHasMap + ring) * uOpacity);
    #include <colorspace_fragment>
  }
`;

const RING_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uPulse;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5);
    float ring = smoothstep(0.36, 0.42, r) * smoothstep(0.48, 0.42, r);
    gl_FragColor = vec4(uColor * ring * (0.45 + 0.55 * uPulse), 1.0);
    #include <colorspace_fragment>
  }
`;

const TRAIL_STEPS = 12;
const loader = new TextureLoader();
const cache = new Map();

function portraitTexture(src) {
  if (!src) return null;
  if (!cache.has(src)) {
    const texture = loader.load(src);
    texture.colorSpace = SRGBColorSpace;
    cache.set(src, texture);
  }
  return cache.get(src);
}

const ROLE_SIZE = 44;
const Y_AXIS = new Vector3(0, 1, 0);

export default function SkyStars({ stateRef }) {
  const stars = useMemo(() => {
    const geometry = new BufferGeometry();
    const positions = [];
    const sizes = [];
    const yearsAttr = [];
    for (const star of STARS) {
      const p = star.dir.clone().multiplyScalar(SKY_RADIUS);
      positions.push(p.x, p.y, p.z);
      sizes.push(star.kind === 'faculty' ? 60 : star.kind === 'empty' ? 0 : star.group === 'core' ? 34 : 26);
      yearsAttr.push(star.kind === 'faculty' ? -1 : star.yearIndex);
    }
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new Float32BufferAttribute(sizes, 1));
    geometry.setAttribute('aYear', new Float32BufferAttribute(yearsAttr, 1));
    return {
      geometry,
      material: {
        uniforms: { uYear: { value: 0 }, uPixelRatio: { value: 1 }, uCore: { value: new Color(PALETTE.flameCore) }, uEmber: { value: new Color(PALETTE.ember) } },
        vertexShader: STAR_VERTEX,
        fragmentShader: STAR_FRAGMENT,
      },
    };
  }, []);

  const trails = useMemo(() => {
    const geometry = new BufferGeometry();
    const positions = [];
    const lags = [];
    for (const star of STARS) {
      if (star.kind === 'empty') continue;
      const p = star.dir.clone().multiplyScalar(SKY_RADIUS);
      for (let k = 0; k < TRAIL_STEPS; k += 1) {
        positions.push(p.x, p.y, p.z, p.x, p.y, p.z);
        lags.push(k / TRAIL_STEPS, (k + 1) / TRAIL_STEPS);
      }
    }
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aLag', new Float32BufferAttribute(lags, 1));
    return {
      geometry,
      material: {
        uniforms: { uPole: { value: POLE.clone() }, uSpin: { value: 0 }, uEmber: { value: new Color(PALETTE.ember) }, uAlpha: { value: 0 } },
        vertexShader: TRAIL_VERTEX,
        fragmentShader: TRAIL_FRAGMENT,
      },
    };
  }, []);

  const lines = useMemo(() => {
    const geometry = new BufferGeometry();
    const positions = [];
    for (const [a, b] of LINES) {
      const pa = STARS[a].dir.clone().multiplyScalar(SKY_RADIUS);
      const pb = STARS[b].dir.clone().multiplyScalar(SKY_RADIUS);
      positions.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
    }
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    return {
      geometry,
      material: { uniforms: { uColor: { value: new Color(PALETTE.ash) }, uAlpha: { value: 0.12 } }, vertexShader: LINE_VERTEX, fragmentShader: LINE_FRAGMENT },
    };
  }, []);

  const empty = useMemo(() => STARS.find((s) => s.kind === 'empty'), []);
  const ring = useMemo(() => ({ uniforms: { uColor: { value: new Color(PALETTE.ember) }, uPulse: { value: 0 } }, vertexShader: PLANE_VERTEX, fragmentShader: RING_FRAGMENT }), []);

  const skyLine = useMemo(() => {
    const label = textTexture('the people who kept the fire lit.', { font: '"Mozilla Headline", "Zilla Slab", Georgia, serif', weight: 600, size: 96 });
    return {
      label,
      position: SKY_LINE_DIRECTION.clone().multiplyScalar(SKY_RADIUS * 0.8),
      material: { uniforms: { uMap: { value: label.texture }, uColor: { value: new Color(PALETTE.ash) }, uOpacity: { value: 0.75 } }, vertexShader: PLANE_VERTEX, fragmentShader: LABEL_FRAGMENT },
    };
  }, []);

  const portrait = useMemo(
    () => ({
      uniforms: {
        uMap: { value: null },
        uHasMap: { value: 0 },
        uFire: { value: new Color(PALETTE.fire) },
        uInk: { value: new Color(PALETTE.night) },
        uOpacity: { value: 0 },
      },
      vertexShader: PLANE_VERTEX,
      fragmentShader: PORTRAIT_FRAGMENT,
    }),
    [],
  );
  const caption = useMemo(() => ({ uniforms: { uMap: { value: null }, uColor: { value: new Color(PALETTE.ash) }, uOpacity: { value: 0 } }, vertexShader: PLANE_VERTEX, fragmentShader: LABEL_FRAGMENT }), []);

  useEffect(
    () => () => {
      stars.geometry.dispose();
      trails.geometry.dispose();
      lines.geometry.dispose();
      skyLine.label.texture.dispose();
    },
    [stars, trails, lines, skyLine],
  );

  const turnRef = useRef(null);
  const portraitRef = useRef(null);
  const skyLineRef = useRef(null);
  const captionMesh = useRef(null);
  const shown = useRef({ key: null, label: null, aspect: 1 });
  const hoverScale = useRef(0);

  const ringRef = useRef(null);

  useFrame((state, delta) => {
    const s = stateRef.current;
    // Still-mode captures lay the real heading over the frame; the sky's own words and the empty
    // star's ring would sit behind it twice (test builds only).
    const clean = FILM_TEST && Boolean(window.__filmTest?.cleanStill);
    if (skyLineRef.current) skyLineRef.current.visible = !clean;
    if (ringRef.current) ringRef.current.visible = !clean;
    if (turnRef.current) turnRef.current.quaternion.setFromAxisAngle(POLE, s.angle);
    stars.material.uniforms.uYear.value = s.yearIndex;
    stars.material.uniforms.uPixelRatio.value = state.gl.getPixelRatio();
    trails.material.uniforms.uSpin.value = Math.max(-1.2, Math.min(1.2, s.spin * 0.35));
    trails.material.uniforms.uAlpha.value = Math.min(1, Math.abs(s.spin) * 0.6);
    ring.uniforms.uPulse.value = s.pulse;

    // The hovered (or focused) star swells into its portrait.
    const key = s.focus ?? s.hover;
    const star = key ? STARS.find((st) => st.key === key) : null;
    if (key !== shown.current.key) {
      shown.current.label?.texture.dispose();
      shown.current = { key, label: null, aspect: 1 };
      if (star && star.kind !== 'empty') {
        const texture = portraitTexture(star.member?.photo);
        portrait.uniforms.uMap.value = texture;
        portrait.uniforms.uHasMap.value = texture ? 1 : 0;
        const label = textTexture(`${star.member.name}  ${star.member.role.toLowerCase()}`, { size: ROLE_SIZE });
        shown.current.label = label;
        shown.current.aspect = label.aspect;
        caption.uniforms.uMap.value = label.texture;
      } else if (star?.kind === 'empty') {
        portrait.uniforms.uHasMap.value = 0;
        const label = textTexture('this one could be you.', { size: ROLE_SIZE });
        shown.current.label = label;
        shown.current.aspect = label.aspect;
        caption.uniforms.uMap.value = label.texture;
      }
    }
    const target = star ? 1 : 0;
    // The line across the sky fits the screen: narrower screens bring it in toward the centre, smaller.
    const fit = Math.min(1, state.size.width / state.size.height / 1.3);
    if (skyLineRef.current) {
      skyLineRef.current.position.copy(SKY_LINE_DIRECTION).applyAxisAngle(Y_AXIS, -(1 - fit) * 0.42).multiplyScalar(SKY_RADIUS * 0.8);
      skyLineRef.current.scale.setScalar(fit);
    }
    hoverScale.current += (target - hoverScale.current) * (FILM_FREEZE ? 1 : Math.min(1, delta * 10));
    const grow = hoverScale.current;
    portrait.uniforms.uOpacity.value = star?.kind === 'empty' ? 0 : grow;
    // Focused, the card (DOM) carries the name; the caption would only sit behind it.
    caption.uniforms.uOpacity.value = s.focus ? 0 : grow;
    if (star && portraitRef.current) {
      const p = star.dir.clone().multiplyScalar(SKY_RADIUS * 0.92);
      // About 40vh once the camera has flown in; a small medallion on hover.
      const size = s.focus ? 6.5 : 7;
      portraitRef.current.position.copy(p);
      portraitRef.current.scale.setScalar(Math.max(0.001, grow * size));
      // The caption hangs under the portrait in the billboard's own frame, so it is always below on screen.
      if (captionMesh.current) captionMesh.current.scale.set(shown.current.aspect * 0.22, 0.22, 1);
    }
  });

  return (
    <>
    <group ref={turnRef}>
      <lineSegments geometry={lines.geometry} frustumCulled={false}>
        <shaderMaterial args={[lines.material]} transparent depthWrite={false} blending={AdditiveBlending} />
      </lineSegments>
      <lineSegments geometry={trails.geometry} frustumCulled={false}>
        <shaderMaterial args={[trails.material]} transparent depthWrite={false} blending={AdditiveBlending} />
      </lineSegments>
      <points geometry={stars.geometry} frustumCulled={false}>
        <shaderMaterial args={[stars.material]} transparent depthWrite={false} blending={AdditiveBlending} />
      </points>
      {empty ? (
        <Billboard position={empty.dir.clone().multiplyScalar(SKY_RADIUS)}>
          <mesh ref={ringRef} frustumCulled={false}>
            <planeGeometry args={[3.2, 3.2]} />
            <shaderMaterial args={[ring]} transparent depthWrite={false} blending={AdditiveBlending} />
          </mesh>
        </Billboard>
      ) : null}
      <Billboard ref={portraitRef}>
        <mesh frustumCulled={false} renderOrder={20}>
          <planeGeometry args={[1, 1]} />
          <shaderMaterial args={[portrait]} transparent depthWrite={false} />
        </mesh>
        <mesh ref={captionMesh} position={[0, -0.68, 0]} frustumCulled={false} renderOrder={21}>
          <planeGeometry args={[1, 1]} />
          <shaderMaterial args={[caption]} transparent depthWrite={false} blending={AdditiveBlending} />
        </mesh>
      </Billboard>
    </group>
    <Billboard ref={skyLineRef} position={skyLine.position}>
      <mesh frustumCulled={false}>
        <planeGeometry args={[2.6 * skyLine.label.aspect, 2.6]} />
        <shaderMaterial args={[skyLine.material]} transparent depthWrite={false} blending={AdditiveBlending} />
      </mesh>
    </Billboard>
    </>
  );
}
