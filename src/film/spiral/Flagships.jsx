import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, CylinderGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import { PALETTE } from '../palette.js';
import { mulberry32 } from '../fox/rig.js';
import { EMBERS, HEIGHT, radiusAt } from './layout.js';

/**
 * Two of the spiral's flagship moments that need their own geometry (the other two, Code To
 * Survive's darkness and InnovationX's day and night sky, are lighting done by the scene):
 *
 *   TechWars   a battlefield hex map flares around the helix at its ember; territories claim to
 *              orange as the hold runs
 *   InnovationX  a 36-hour clock ring around the helix, its hand sweeping a day and a half
 *
 * stateRef.current: { tech, techT, clock, clockT } (envelopes 0 to 1 and hold progress)
 */

const heightOf = (slug) => (EMBERS.find((e) => e.event.slug === slug)?.s ?? 0) * HEIGHT;
const sOf = (slug) => EMBERS.find((e) => e.event.slug === slug)?.s ?? 0;

const SQRT3 = Math.sqrt(3);
const COLD = new Color('#2b4b66');
const FIRE = new Color(PALETTE.fire);

export function HexFlash({ stateRef }) {
  const groupRef = useRef(null);
  const mesh = useMemo(() => {
    const inner = radiusAt(sOf('techwars')) + 1.2;
    const tiles = [];
    const rand = mulberry32(13);
    for (let q = -9; q <= 9; q += 1) {
      for (let r = Math.max(-9, -q - 9); r <= Math.min(9, -q + 9); r += 1) {
        const x = SQRT3 * (q + r / 2) * 0.9;
        const z = 1.5 * r * 0.9;
        const d = Math.hypot(x, z);
        if (d < inner || d > inner + 7) continue;
        tiles.push({ x, z, claimAt: rand() });
      }
    }
    const material = new MeshBasicMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false });
    const instanced = new InstancedMesh(new CylinderGeometry(0.8, 0.8, 0.06, 6), material, tiles.length);
    const matrix = new Matrix4();
    tiles.forEach((tile, i) => {
      instanced.setMatrixAt(i, matrix.compose(new Vector3(tile.x, 0, tile.z), new Quaternion(), new Vector3(1, 1, 1)));
      instanced.setColorAt(i, COLD);
    });
    instanced.userData.tiles = tiles;
    instanced.frustumCulled = false;
    return instanced;
  }, []);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    },
    [mesh],
  );

  useFrame(() => {
    const { tech, techT } = stateRef.current;
    if (groupRef.current) groupRef.current.visible = tech > 0.001;
    if (tech <= 0.001) return;
    mesh.material.opacity = tech;
    mesh.userData.tiles.forEach((tile, i) => mesh.setColorAt(i, tile.claimAt < techT * 0.8 ? FIRE : COLD));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <group ref={groupRef} position={[0, heightOf('techwars') - 0.2, 0]} visible={false}>
      <primitive object={mesh} />
    </group>
  );
}

export function ClockRing({ stateRef }) {
  const groupRef = useRef(null);
  const handRef = useRef(null);
  const material = useMemo(
    () => new MeshBasicMaterial({ color: new Color(PALETTE.ash), transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  const radius = radiusAt(sOf('innovationx')) + 2.5;
  const ticks = useMemo(() => Array.from({ length: 36 }, (_, i) => (i / 36) * Math.PI * 2), []);

  useFrame(() => {
    const { clock, clockT } = stateRef.current;
    if (groupRef.current) groupRef.current.visible = clock > 0.001;
    if (clock <= 0.001) return;
    material.opacity = clock * 0.85;
    // Thirty-six hours on the face; the hand sweeps all of them over the hold.
    if (handRef.current) handRef.current.rotation.y = -clockT * Math.PI * 2;
  });

  return (
    <group ref={groupRef} position={[0, heightOf('innovationx') + 0.4, 0]} visible={false}>
      <mesh rotation-x={Math.PI / 2} material={material}>
        <torusGeometry args={[radius, 0.04, 6, 128]} />
      </mesh>
      {ticks.map((angle, i) => (
        <mesh key={i} position={[Math.cos(angle) * (radius - 0.35), 0, Math.sin(angle) * (radius - 0.35)]} rotation-y={-angle} material={material}>
          <boxGeometry args={[i % 6 === 0 ? 0.6 : 0.3, 0.03, 0.04]} />
        </mesh>
      ))}
      <group ref={handRef}>
        <mesh position={[(radius - 0.8) / 2, 0, 0]} material={material}>
          <boxGeometry args={[radius - 0.8, 0.04, 0.06]} />
        </mesh>
      </group>
    </group>
  );
}
