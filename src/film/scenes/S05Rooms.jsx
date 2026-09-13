import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, ShaderMaterial, Vector3 } from 'three';
import { film, useFilm } from '../store.js';
import { registerShot } from '../camera/shots.js';
import { registerFoxShot } from '../actors/foxShots.js';
import { sceneProgressOf } from './progress.js';
import SourceRoom, { CORRIDOR_LENGTH, WALL_X } from '../rooms/SourceRoom.jsx';
import PrismRoom, { PRISM_BEATS, PRISM_CENTRE, PRISM_FOX_SCALE } from '../rooms/PrismRoom.jsx';
import WebRoom, { LOGO_BOUNDS, WEB_SIZE, pathAt } from '../rooms/WebRoom.jsx';
import { PALETTE } from '../palette.js';
import { clamp01, ease, lerp, window01 } from '../rooms/labels.js';
import { FILM_TEST } from '../testHooks.js';

/**
 * S05 The Three Rooms. The rooms play in the order the viewer's cursor chose at S04's split
 * (film store `branchOrder`); the scene length is the same whatever the order. Each room takes a
 * third of the scene at its own world origin, and a fire flash hides the change of world between
 * rooms. Each room brings its own camera and fox moves:
 *   technical  run the corridor of code, then up the wall as gravity turns 90 degrees
 *   design     run into the prism, stay back while the colours are apart, fuse
 *   management run the web along the logo's outline, then the camera pulls back to reveal it
 */

export const ROOM_ORIGINS = {
  technical: new Vector3(0, -8000, 0),
  design: new Vector3(0, -9000, 0),
  management: new Vector3(0, -10000, 0),
};
const ROOM_CUTS = { technical: 5, design: 6, management: 7 };
const DESIGN_BACKGROUND = new Color('#f4f2ef');
const NIGHT = new Color('#0a0807');

/** Which room plays at a scene progress, and that room's own progress. */
export function roomAt(progress, order) {
  const p = clamp01(progress);
  const index = Math.min(2, Math.floor(p * 3));
  return { key: order[index], index, local: window01(p, index / 3, (index + 1) / 3) };
}

const tmp = new Vector3();
const dir = new Vector3();

function technicalPose(p, origin, pose, cam, aspect) {
  // 0 to 0.45: run the corridor floor; 0.45 to 0.8: turn to the wall and climb it.
  const run = ease(window01(p, 0, 0.45));
  const climb = ease(window01(p, 0.45, 0.8));
  const z = -run * CORRIDOR_LENGTH * 0.8;
  const floorPoint = tmp.set(lerp(1, WALL_X + 0.3, climb > 0 ? 1 : 0), 0, z);
  const height = climb * 22;
  pose.scale = 0.7;
  pose.position.set(climb > 0 ? WALL_X + 0.3 : lerp(0.5, 1, run), height, z).add(origin);
  // Gravity turns: the fox's back points away from the wall while it climbs.
  if (climb > 0) {
    pose.forward.set(0, 1, 0);
    pose.up.set(1, 0, 0);
  } else {
    pose.forward.set(0, 0, -1);
    pose.up.set(0, 1, 0);
  }
  if (cam) {
    const fit = Math.max(1, 0.8 / aspect);
    if (climb > 0) {
      cam.position.set(WALL_X + 5.5 * fit, height - 3, z + 4).add(origin);
      cam.target.copy(pose.position).addScaledVector(pose.forward, 2);
      cam.roll = ease(climb) * (Math.PI / 2) * 0.95;
    } else {
      cam.position.set(floorPoint.x + 2.2 * fit, 1.4, z + 5 * fit).add(origin);
      cam.target.copy(pose.position).add(tmp.set(0, 0.6, -3));
      cam.roll = 0;
    }
    cam.fov = 50;
  }
}

function designPose(p, origin, pose, cam, aspect) {
  const enter = ease(window01(p, PRISM_BEATS.enter[0], PRISM_BEATS.enter[1]));
  pose.position.set(0, 0, lerp(8, PRISM_CENTRE.z, enter)).add(origin);
  pose.forward.set(0, 0, -1);
  pose.up.set(0, 1, 0);
  // The film's fox is the fused one: hidden while the three colours are apart. White void: blend normally.
  pose.visible = p <= PRISM_BEATS.split || p >= PRISM_BEATS.fuse;
  pose.light = true;
  pose.scale = PRISM_FOX_SCALE;
  if (cam) {
    const fit = Math.max(1, 0.8 / aspect);
    // Far enough back that the prism reads as glass with the walls and foxes around it.
    const orbit = ease(window01(p, 0.15, 0.9)) * Math.PI * 0.6 - Math.PI * 0.3;
    cam.position.set(Math.sin(orbit) * 30 * fit, 9, PRISM_CENTRE.z + Math.cos(orbit) * 30 * fit).add(origin);
    cam.target.set(0, 4, PRISM_CENTRE.z).add(origin);
    cam.fov = 48;
    cam.roll = 0;
  }
}

function managementPose(p, origin, pose, cam, aspect) {
  const runT = window01(p, 0.05, 0.75);
  pathAt(runT, pose.position, dir);
  pose.position.add(origin);
  pose.forward.copy(dir);
  pose.up.set(0, 1, 0);
  if (cam) {
    const fit = Math.max(1, 0.8 / aspect);
    // Close behind the fox on the threads, then pull back high to reveal the logo.
    const reveal = ease(window01(p, 0.72, 1));
    // Beside and a little behind, so the fox reads in profile on the thread, not tail-on.
    const side = new Vector3().crossVectors(new Vector3(0, 1, 0), dir).normalize();
    const chase = tmp.copy(pose.position).addScaledVector(dir, -1.6 * fit).addScaledVector(side, 3 * fit).add(new Vector3(0, 1.6, 0));
    // High enough that the whole logo, with its node labels, sits inside the frame at fov 45.
    const high = new Vector3(LOGO_BOUNDS.centre.x, (LOGO_BOUNDS.radius * 1.45 * fit) / Math.tan((22.5 * Math.PI) / 180), LOGO_BOUNDS.centre.z + 0.01).add(origin);
    cam.position.lerpVectors(chase, high, reveal);
    cam.target.lerpVectors(new Vector3().copy(pose.position).addScaledVector(dir, 3), new Vector3().copy(LOGO_BOUNDS.centre).add(origin), reveal);
    cam.fov = lerp(55, 45, reveal);
    cam.roll = 0;
  }
}

const POSES = { technical: technicalPose, design: designPose, management: managementPose };

/** @type {import('../camera/shots.js').Shot} */
export function roomsShot(progress, out, aspect = 16 / 9) {
  const order = film.getState().branchOrder;
  const { key, local } = roomAt(progress, order);
  const pose = { position: new Vector3(), forward: new Vector3(), up: new Vector3(), visible: true };
  POSES[key](local, ROOM_ORIGINS[key], pose, out, aspect);
  out.cut = ROOM_CUTS[key];
  out.shake = 0;
}

/** @type {import('../actors/foxShots.js').FoxShot} */
function roomsFoxShot(progress, pose, input) {
  const order = film.getState().branchOrder;
  const { key, local } = roomAt(progress, order);
  pose.visible = true;
  // A room's pose may override the scale (the prism camera sits far back).
  pose.scale = 0.4;
  POSES[key](local, ROOM_ORIGINS[key], pose, null, 16 / 9);
  pose.cut = ROOM_CUTS[key];
  input.hint = 'run';
  input.velocity = 900;
}

const FLASH_VERTEX = /* glsl */ `
  uniform vec2 uSize;
  void main() {
    gl_Position = projectionMatrix * vec4(position.xy * uSize, -1.0, 1.0);
  }
`;

const FLASH_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    gl_FragColor = vec4(uColor, uOpacity);
    #include <colorspace_fragment>
  }
`;

export default function S05Rooms() {
  const tier = useFilm((s) => s.quality);
  const order = useFilm((s) => s.branchOrder);
  const { camera, scene } = useThree();
  const progress = useRef(0);
  const local = useMemo(() => ({ technical: { current: 0 }, design: { current: 0 }, management: { current: 0 } }), []);
  const flashRef = useRef(null);

  useEffect(() => registerShot('S05', roomsShot), []);
  useEffect(() => {
    if (!FILM_TEST) return undefined;
    // Tests set the room order the cursor would choose and read which room is playing.
    window.__filmTest.setBranchOrder = (next) => film.getState().setBranchOrder(next);
    window.__filmTest.roomAt = () => roomAt(sceneProgressOf('S05'), film.getState().branchOrder).key;
    return () => {
      delete window.__filmTest.setBranchOrder;
      delete window.__filmTest.roomAt;
    };
  }, []);
  useEffect(() => registerFoxShot('S05', roomsFoxShot), []);

  const flash = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uSize: { value: [1, 1] }, uColor: { value: new Color(PALETTE.flameCore) }, uOpacity: { value: 0 } },
        vertexShader: FLASH_VERTEX,
        fragmentShader: FLASH_FRAGMENT,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  );
  useEffect(() => () => flash.dispose(), [flash]);

  // Restore the film's own air when the rooms unmount.
  useEffect(
    () => () => {
      if (scene.background?.isColor) scene.background.copy(NIGHT);
    },
    [scene],
  );

  useFrame(() => {
    const p = sceneProgressOf('S05');
    progress.current = p;
    const current = film.getState().branchOrder;
    current.forEach((key, i) => {
      local[key].current = window01(p, i / 3, (i + 1) / 3);
    });
    const { key } = roomAt(p, current);
    const active = p > 0 && p < 1;
    if (scene.background?.isColor) scene.background.copy(active && key === 'design' ? DESIGN_BACKGROUND : NIGHT);

    // A fire flash across each room boundary hides the change of world.
    const f = flashRef.current;
    if (f) {
      const nearest = Math.min(Math.abs(p - 1 / 3), Math.abs(p - 2 / 3));
      const o = active ? clamp01(1 - nearest / 0.02) : 0;
      f.visible = o > 0.001;
      flash.uniforms.uOpacity.value = o;
      const height = 2 * Math.tan((camera.fov * Math.PI) / 360) * 1.4;
      flash.uniforms.uSize.value = [height * camera.aspect, height];
    }
  });

  return (
    <>
      {order.map((key) => {
        if (key === 'technical') return <SourceRoom key={key} progressRef={local.technical} origin={ROOM_ORIGINS.technical} tier={tier} />;
        if (key === 'design') return <PrismRoom key={key} progressRef={local.design} origin={ROOM_ORIGINS.design} tier={tier} />;
        return <WebRoom key={key} progressRef={local.management} origin={ROOM_ORIGINS.management} />;
      })}
      <mesh ref={flashRef} material={flash} visible={false} frustumCulled={false} renderOrder={955}>
        <planeGeometry args={[1, 1]} />
      </mesh>
    </>
  );
}
