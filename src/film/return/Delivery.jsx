import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, CanvasTexture, Color, DoubleSide, Matrix4, ShaderMaterial, SRGBColorSpace, Vector3 } from 'three';
import { PALETTE } from '../palette.js';

/**
 * The message as an ember (S10). A hot point of light with the sent text scrolling along its tail.
 * The scene moves it (`stateRef.current`: position, visible, glow, text) and this draws it: the
 * tail is a thin strip trailing the ember's motion, turned to face the camera about that line.
 */

const EMBER_VERTEX = /* glsl */ `
  uniform float uPixelRatio;
  uniform float uSize;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize * uPixelRatio;
  }
`;

const EMBER_FRAGMENT = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uFire;
  uniform float uGlow;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float d = dot(p, p);
    if (d > 1.0) discard;
    vec3 color = uCore * exp(-d * 14.0) * 2.2 + uFire * exp(-d * 3.0) * 0.9;
    gl_FragColor = vec4(color * uGlow, 1.0);
    #include <colorspace_fragment>
  }
`;

const TAIL_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TAIL_FRAGMENT = /* glsl */ `
  uniform sampler2D uText;
  uniform float uScroll;
  uniform float uGlow;
  uniform vec3 uFire;
  varying vec2 vUv;
  void main() {
    // uv.x 0 at the ember, 1 at the tail's end; the text runs backward along it.
    float ink = texture2D(uText, vec2(fract(vUv.x * 0.5 + uScroll), vUv.y)).a;
    float fade = pow(1.0 - vUv.x, 1.6);
    float streak = smoothstep(0.5, 0.0, abs(vUv.y - 0.5)) * 0.18;
    gl_FragColor = vec4(uFire * (ink * 1.3 + streak) * fade * uGlow, 1.0);
    #include <colorspace_fragment>
  }
`;

function textTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 48;
  const context = canvas.getContext('2d');
  context.font = '500 30px "Fira Code", monospace';
  context.textBaseline = 'middle';
  context.fillStyle = '#fff';
  const line = `${text.replace(/\s+/g, ' ').slice(0, 64)}    `;
  let x = 0;
  const step = Math.max(context.measureText(line).width, 1);
  while (x < canvas.width) {
    context.fillText(line, x, canvas.height / 2);
    x += step;
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

const TAIL_LENGTH = 1.1;
const TAIL_WIDTH = 0.08;

const motion = new Vector3();
const toCamera = new Vector3();
const side = new Vector3();
const basis = new Matrix4();

/** @param {{ stateRef: { current: { position: Vector3, visible: boolean, glow: number, text: string } } }} props */
export default function Delivery({ stateRef }) {
  const tailRef = useRef(null);
  const pointsRef = useRef(null);
  const last = useRef({ position: new Vector3(), direction: new Vector3(1, 0, 0), text: null });

  const ember = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uCore: { value: new Color(PALETTE.flameCore) }, uFire: { value: new Color(PALETTE.fire) }, uGlow: { value: 1 }, uSize: { value: 22 }, uPixelRatio: { value: 1 } },
        vertexShader: EMBER_VERTEX,
        fragmentShader: EMBER_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    [],
  );
  const tail = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uText: { value: null }, uScroll: { value: 0 }, uGlow: { value: 1 }, uFire: { value: new Color(PALETTE.fire) } },
        vertexShader: TAIL_VERTEX,
        fragmentShader: TAIL_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      }),
    [],
  );

  useEffect(
    () => () => {
      ember.dispose();
      tail.uniforms.uText.value?.dispose();
      tail.dispose();
    },
    [ember, tail],
  );

  useFrame((state, delta) => {
    const s = stateRef.current;
    const visible = s.visible && s.glow > 0.001;
    if (pointsRef.current) pointsRef.current.visible = visible;
    if (tailRef.current) tailRef.current.visible = visible && Boolean(s.text);
    if (!visible) {
      last.current.position.copy(s.position);
      return;
    }
    if (s.text !== last.current.text) {
      last.current.text = s.text;
      tail.uniforms.uText.value?.dispose();
      tail.uniforms.uText.value = s.text ? textTexture(s.text) : null;
    }
    pointsRef.current.position.copy(s.position);
    ember.uniforms.uGlow.value = s.glow;
    ember.uniforms.uPixelRatio.value = state.gl.getPixelRatio();
    tail.uniforms.uGlow.value = s.glow;
    tail.uniforms.uScroll.value += delta * 0.35;

    // The tail trails the motion; at rest it keeps the last direction.
    motion.subVectors(s.position, last.current.position);
    if (motion.lengthSq() > 1e-8) last.current.direction.copy(motion).normalize();
    last.current.position.copy(s.position);
    const back = last.current.direction;
    toCamera.subVectors(state.camera.position, s.position).normalize();
    side.crossVectors(toCamera, back).normalize();
    toCamera.crossVectors(back, side).normalize();
    // Strip along -direction: local x runs back from the ember.
    basis.makeBasis(back.clone().negate(), side, toCamera);
    const mesh = tailRef.current;
    mesh.quaternion.setFromRotationMatrix(basis);
    mesh.position.copy(s.position).addScaledVector(back, -TAIL_LENGTH / 2);
  });

  return (
    <>
      <points ref={pointsRef} material={ember} frustumCulled={false} visible={false} renderOrder={20}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[new Float32Array(3), 3]} />
        </bufferGeometry>
      </points>
      <mesh ref={tailRef} material={tail} frustumCulled={false} visible={false} renderOrder={19}>
        <planeGeometry args={[TAIL_LENGTH, TAIL_WIDTH]} />
      </mesh>
    </>
  );
}
