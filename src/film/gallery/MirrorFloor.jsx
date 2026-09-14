import { MeshReflectorMaterial } from '@react-three/drei';
import { GALLERY_ORIGIN } from './layout.js';

/**
 * The gallery's black mirror floor. Tier 3 reflects (drei's reflector, low roughness and a faint
 * blur); tiers 1 and 2 keep a dark glossy floor without the second render. At tier 2 the reflector's
 * extra render and blur took Firefox's gallery from 60 fps to between 0 and 37 (Phase 8 bench), with
 * 1% lows near zero, and cost Chromium its 1% lows. The fog swallows the floor's edges, so it reads
 * as endless.
 * @param {{ tier: number }} props
 */
export default function MirrorFloor({ tier }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, GALLERY_ORIGIN.y, GALLERY_ORIGIN.z - 84]}>
      <planeGeometry args={[240, 320]} />
      {tier >= 3 ? (
        <MeshReflectorMaterial
          resolution={1024}
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
