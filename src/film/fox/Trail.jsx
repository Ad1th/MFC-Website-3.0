import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Vector3 } from 'three';
import { createTrailMaterial } from './materials.js';

/**
 * The tail's ribbon of fire: a ring buffer of the tail tip's world positions
 * over the last 3 seconds, drawn as a camera-facing strip that thins and fades
 * with age. driftRef moves old samples with the world when the fox runs in place.
 * timeScaleRef (0 to 1) slows its clock with the fox's, so bullet time freezes the stroke.
 */

const SAMPLES = 180;
const SAMPLE_EVERY = 1 / 60;

export default function Trail({ rig, driftRef, fadeRef, timeScaleRef, seconds = 3, width = 0.011 }) {
  const clock = useRef(0);
  const { geometry, material, ring } = useMemo(() => {
    const g = new BufferGeometry();
    const position = new BufferAttribute(new Float32Array(SAMPLES * 2 * 3), 3).setUsage(DynamicDrawUsage);
    const age = new BufferAttribute(new Float32Array(SAMPLES * 2), 1).setUsage(DynamicDrawUsage);
    const side = new Float32Array(SAMPLES * 2);
    for (let i = 0; i < SAMPLES; i += 1) {
      side[i * 2] = -1;
      side[i * 2 + 1] = 1;
    }
    const index = [];
    for (let i = 0; i < SAMPLES - 1; i += 1) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setAttribute('position', position);
    g.setAttribute('aAge', age);
    g.setAttribute('aSide', new BufferAttribute(side, 1));
    g.setIndex(index);
    g.setDrawRange(0, 0);
    return {
      geometry: g,
      material: createTrailMaterial(),
      ring: { points: new Float32Array(SAMPLES * 3), times: new Float32Array(SAMPLES), head: -1, count: 0, acc: 0 },
    };
  }, []);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  const tip = useMemo(() => new Vector3(), []);
  const p = useMemo(() => new Vector3(), []);
  const prev = useMemo(() => new Vector3(), []);
  const next = useMemo(() => new Vector3(), []);
  const tangent = useMemo(() => new Vector3(), []);
  const toCamera = useMemo(() => new Vector3(), []);
  const sideVec = useMemo(() => new Vector3(), []);

  const baseOpacity = useMemo(() => material.uniforms.uOpacity.value, [material]);

  useFrame((state, frameDelta) => {
    const delta = frameDelta * (timeScaleRef?.current ?? 1);
    clock.current += delta;
    const now = clock.current;
    material.uniforms.uOpacity.value = baseOpacity * (fadeRef?.current ?? 1);
    const drift = driftRef?.current;
    if (drift && drift.lengthSq() > 0) {
      for (let i = 0; i < ring.count; i += 1) {
        const k = ((ring.head - i + SAMPLES) % SAMPLES) * 3;
        ring.points[k] += drift.x * delta;
        ring.points[k + 1] += drift.y * delta;
        ring.points[k + 2] += drift.z * delta;
      }
    }

    ring.acc += delta;
    if (ring.acc >= SAMPLE_EVERY || ring.count === 0) {
      ring.acc = 0;
      rig.bones.tail3.localToWorld(tip.copy(rig.tailTipLocal));
      ring.head = (ring.head + 1) % SAMPLES;
      ring.points.set([tip.x, tip.y, tip.z], ring.head * 3);
      ring.times[ring.head] = now;
      ring.count = Math.min(ring.count + 1, SAMPLES);
    } else {
      // Keep the newest point glued to the tail between samples.
      rig.bones.tail3.localToWorld(tip.copy(rig.tailTipLocal));
      ring.points.set([tip.x, tip.y, tip.z], ring.head * 3);
    }

    const pos = geometry.attributes.position.array;
    const ages = geometry.attributes.aAge.array;
    const cam = state.camera.position;
    let used = 0;
    for (let i = 0; i < ring.count; i += 1) {
      const k = (ring.head - i + SAMPLES) % SAMPLES;
      const age = (now - ring.times[k]) / seconds;
      if (age > 1) break;
      p.fromArray(ring.points, k * 3);
      const kPrev = (k + 1) % SAMPLES;
      const kNext = (k - 1 + SAMPLES) % SAMPLES;
      prev.fromArray(ring.points, (i === 0 ? k : kNext) * 3);
      next.fromArray(ring.points, (i + 1 < ring.count ? kPrev : k) * 3);
      tangent.subVectors(prev, next);
      if (tangent.lengthSq() < 1e-10) tangent.set(0, 0, 1);
      toCamera.subVectors(cam, p);
      sideVec.crossVectors(tangent, toCamera).normalize();
      const w = width * Math.pow(1 - age, 0.8);
      pos[i * 6] = p.x - sideVec.x * w;
      pos[i * 6 + 1] = p.y - sideVec.y * w;
      pos[i * 6 + 2] = p.z - sideVec.z * w;
      pos[i * 6 + 3] = p.x + sideVec.x * w;
      pos[i * 6 + 4] = p.y + sideVec.y * w;
      pos[i * 6 + 5] = p.z + sideVec.z * w;
      ages[i * 2] = age;
      ages[i * 2 + 1] = age;
      used += 1;
    }
    geometry.setDrawRange(0, Math.max(0, used - 1) * 6);
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aAge.needsUpdate = true;
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={2} />;
}
