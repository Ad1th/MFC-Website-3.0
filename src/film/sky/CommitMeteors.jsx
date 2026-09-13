import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  QuadraticBezierCurve3,
  Raycaster,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';
import { commits } from '../../content/index.js';
import { mulberry32 } from '../fox/rig.js';
import { PALETTE } from '../palette.js';
import { filmNow } from '../../live/clock.js';

/**
 * S03's commit meteors: every recent commit, push or pull request to the MFC-VIT org
 * (src/content/generated/commits.json, real data only) is a thin orange thread rising from
 * somewhere on the ground and falling onto Vellore at the origin. Threads draw in order as
 * the scene's progress moves through `range`.
 *
 * Hovering one shows `repo / actor / 3h ago`. The film canvas ignores pointer events, so
 * hover is a manual raycast against fat invisible tubes from a window pointer listener.
 * No commits: nothing renders, silently.
 */

const SAMPLES = 48;

const VERTEX = /* glsl */ `
  attribute float aT;
  attribute float aDelay;
  uniform float uProgress;
  varying float vHead;
  varying float vT;
  void main() {
    vT = aT;
    vHead = clamp((uProgress - aDelay) / 0.45, 0.0, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uHot;
  uniform float uHover;
  varying float vHead;
  varying float vT;
  void main() {
    if (vT > vHead) discard;
    float head = exp(-pow((vT - vHead) / 0.05, 2.0));
    vec3 color = mix(uColor, uHot, head);
    gl_FragColor = vec4(color * (0.45 + 1.6 * head + uHover), 1.0);
    #include <colorspace_fragment>
  }
`;

const rtf = typeof Intl !== 'undefined' && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat('en', { numeric: 'auto' }) : null;

/** `3h ago` style, via Intl.RelativeTimeFormat, lowercased and compact. */
export function relativeTime(iso, now = filmNow()) {
  const seconds = (new Date(iso).getTime() - now.getTime()) / 1000;
  const units = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size || unit === 'minute') {
      const value = Math.round(seconds / size);
      return rtf ? rtf.format(value, unit) : `${Math.abs(value)} ${unit}s ago`;
    }
  }
  return '';
}

/**
 * @param {{ origin: Vector3, progressRef: { current: number }, range: [number, number] }} props
 */
export default function CommitMeteors({ origin, progressRef, range }) {
  const { camera, gl } = useThree();
  const pointer = useRef({ ndc: new Vector2(), x: 0, y: 0, inside: false });
  const labelRef = useRef(null);
  const hovered = useRef(-1);

  const built = useMemo(() => {
    if (!commits.length) return null;
    const positions = [];
    const ts = [];
    const delays = [];
    const hitGroup = new Group();
    const hitMaterial = new MeshBasicMaterial({ visible: false });
    commits.forEach((commit, i) => {
      const rand = mulberry32(1000 + i);
      const angle = rand() * Math.PI * 2;
      const distance = 110 + rand() * 110;
      const start = new Vector3(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
      const peak = start.clone().multiplyScalar(0.45).add(new Vector3(0, 40 + rand() * 45, 0));
      const curve = new QuadraticBezierCurve3(start, peak, new Vector3(0, 0, 0));
      const points = curve.getPoints(SAMPLES);
      const delay = (i / commits.length) * 0.55;
      for (let k = 0; k < SAMPLES; k += 1) {
        const a = points[k];
        const b = points[k + 1];
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
        ts.push(k / SAMPLES, (k + 1) / SAMPLES);
        delays.push(delay, delay);
      }
      const tube = new Mesh(new TubeGeometry(curve, 24, 3, 6, false), hitMaterial);
      tube.userData.index = i;
      hitGroup.add(tube);
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aT', new Float32BufferAttribute(ts, 1));
    geometry.setAttribute('aDelay', new Float32BufferAttribute(delays, 1));
    const material = {
      uniforms: {
        uProgress: { value: 0 },
        uColor: { value: new Color(PALETTE.fire) },
        uHot: { value: new Color(PALETTE.flameCore) },
        uHover: { value: 0 },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
    };
    return { geometry, material, hitGroup };
  }, []);

  useEffect(() => {
    if (!built) return undefined;
    const label = document.createElement('div');
    label.setAttribute('aria-hidden', 'true');
    Object.assign(label.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      zIndex: '45',
      pointerEvents: 'none',
      font: '400 12px "Fira Code", ui-monospace, monospace',
      color: '#e8ded5',
      whiteSpace: 'nowrap',
      transform: 'translate(-9999px, -9999px)',
    });
    document.body.appendChild(label);
    labelRef.current = label;
    const onMove = (event) => {
      const rect = gl.domElement.getBoundingClientRect();
      pointer.current.x = event.clientX;
      pointer.current.y = event.clientY;
      pointer.current.ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      pointer.current.inside = true;
    };
    const onLeave = () => {
      pointer.current.inside = false;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      label.remove();
      labelRef.current = null;
    };
  }, [built, gl]);

  useEffect(
    () => () => {
      if (!built) return;
      built.geometry.dispose();
      built.hitGroup.children.forEach((child) => child.geometry.dispose());
    },
    [built],
  );

  const raycaster = useMemo(() => new Raycaster(), []);
  const groupRef = useRef(null);

  useFrame(() => {
    if (!built || !groupRef.current) return;
    const [a, b] = range;
    const local = Math.min(Math.max((progressRef.current - a) / (b - a), 0), 1);
    groupRef.current.visible = local > 0;
    built.material.uniforms.uProgress.value = local;

    let index = -1;
    const label = labelRef.current;
    if (local > 0.05 && pointer.current.inside) {
      built.hitGroup.updateMatrixWorld(true);
      raycaster.setFromCamera(pointer.current.ndc, camera);
      const hit = raycaster.intersectObjects(built.hitGroup.children, false)[0];
      // Only threads that have already started drawing can be hovered.
      if (hit && (hit.object.userData.index / commits.length) * 0.55 < local) index = hit.object.userData.index;
    }
    if (index !== hovered.current) {
      hovered.current = index;
      built.material.uniforms.uHover.value = index >= 0 ? 0.35 : 0;
      if (label) {
        if (index >= 0) {
          const commit = commits[index];
          label.textContent = `${commit.repo.toLowerCase()} / ${commit.actor.toLowerCase()} / ${relativeTime(commit.createdAt)}`;
        } else {
          label.textContent = '';
        }
      }
    }
    if (label) {
      label.style.transform = index >= 0 ? `translate(${pointer.current.x + 14}px, ${pointer.current.y + 12}px)` : 'translate(-9999px, -9999px)';
    }
  });

  if (!built) return null;
  return (
    <group ref={groupRef} position={origin} visible={false}>
      <lineSegments geometry={built.geometry} frustumCulled={false}>
        <shaderMaterial args={[built.material]} transparent depthWrite={false} blending={AdditiveBlending} />
      </lineSegments>
      <primitive object={built.hitGroup} />
    </group>
  );
}
