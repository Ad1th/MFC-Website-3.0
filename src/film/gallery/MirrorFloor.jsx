import { MeshReflectorMaterial } from '@react-three/drei';
import { GALLERY_ORIGIN } from './layout.js';

/**
 * The gallery's black mirror floor. Tiers 2 and 3 reflect (drei's reflector, low roughness and a
 * faint blur); tier 1 keeps a dark glossy floor without the second render. The fog swallows its
 * edges, so it reads as endless.
 * @param {{ tier: number }} props
 */
export default function MirrorFloor({ tier }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, GALLERY_ORIGIN.y, GALLERY_ORIGIN.z - 84]}>
      <planeGeometry args={[240, 320]} />
      {tier >= 2 ? (
        <MeshReflectorMaterial
          resolution={tier >= 3 ? 1024 : 512}
          blur={[300, 80]}
          mixBlur={0.8}
          mixStrength={2.2}
          roughness={0.35}
          depthScale={0.6}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.4}
          mirror={0.75}
          metalness={0.6}
          color="#070606"
        />
      ) : (
        <meshStandardMaterial color="#0b0a0a" roughness={0.25} metalness={0.5} />
      )}
    </mesh>
  );
}
