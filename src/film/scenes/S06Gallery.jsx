import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { Color, ShaderMaterial, SRGBColorSpace, Vector3 } from 'three';
import { film, useFilm } from '../store.js';
import { registerShot } from '../camera/shots.js';
import { registerFoxShot } from '../actors/foxShots.js';
import { sceneProgressOf } from './progress.js';
import { projects } from '../../content/index.js';
import projectColours from '../../content/generated/projectColours.json';
import { MOBILE_QUERY } from '../timeline.js';
import { PALETTE } from '../palette.js';
import { FILM_TEST } from '../testHooks.js';
import { clamp01, ease, lerp, window01 } from '../rooms/labels.js';
import { BEATS, GALLERY_ORIGIN, MOBILE_SPIN_END, SLAB_COUNT, SLAB_SIZE, SLAB_Y, dives, shardFlight, shardTarget, slabAt, slabFrame, worldOrigin } from '../gallery/layout.js';
import MirrorFloor from '../gallery/MirrorFloor.jsx';
import Slab from '../gallery/Slab.jsx';
import SlabShatter from '../gallery/SlabShatter.jsx';
import PawPrints from '../gallery/PawPrints.jsx';
import { WORLDS } from '../gallery/worlds/index.js';
import { dollyAmount, openProject } from '../gallery/open.js';

/**
 * S06 The Gallery. Five project slabs on a black mirror floor, one fifth of the scene each (see
 * gallery/layout.js for the beats). The camera orbits each slab while the fox circles it the other
 * way, then both dive through the glass into the project's mini-world, and come out of the back as
 * the slab shatters into the next one. The HUD (DOM) names the slab; the cursor tilts it, and a
 * click dollies in and opens the project in a new tab.
 */

const NIGHT = new Color(PALETTE.night);
const GALLERY_CUT = 20;
const RADIUS = 11;
const TILT_MAX = (6 * Math.PI) / 180;
const ENTRY_FLASH = 0.012;
const CORNERS = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

let mobileQuery = null;
function isMobile() {
  if (typeof window === 'undefined') return false;
  mobileQuery ??= window.matchMedia(MOBILE_QUERY);
  return mobileQuery.matches;
}

const va = new Vector3();
const vb = new Vector3();
const vc = new Vector3();
const vd = new Vector3();

/** Where the camera ends a slab's exit, which is where the next slab's approach starts. */
function exitCamera(i, position, target) {
  if (i < 0) {
    slabFrame(0, 0, 3.2, 26, position);
    slabFrame(0, 0, SLAB_Y, 0, target);
    return;
  }
  // Off the shards' flight line (they fly from this slab to the next, which sways to +x).
  slabFrame(i, -4.5, 3.4, -11, position);
  shardTarget(i, target);
}

/** The fox on the gallery floor at slab i's progress; null while it is inside the slab's world. */
function foxOnFloor(i, local, mobile, out) {
  const dive = dives(i, mobile);
  if (local < BEATS.approach[1]) {
    const from = i === 0 ? slabFrame(0, 0, 0, 24, va) : slabFrame(i - 1, 0, 0, -2.6, va);
    return out.lerpVectors(from, slabFrame(i, 0, 0, 6, vb), window01(local, 0, BEATS.approach[1]));
  }
  const spinEnd = dive ? BEATS.spin[1] : MOBILE_SPIN_END;
  if (local < spinEnd) {
    // One full lap the opposite way to the camera's half orbit, closer in at the sides.
    const s = window01(local, BEATS.spin[0], spinEnd);
    const phi = -Math.PI * 2 * ease(s);
    const r = lerp(6, 4.4, Math.sin(Math.PI * s));
    return slabFrame(i, Math.sin(phi) * r, 0, Math.cos(phi) * r, out);
  }
  const runOff = i === SLAB_COUNT - 1 ? 12 : 0;
  if (dive) {
    if (local < BEATS.cutIn) {
      const s = window01(local, BEATS.spin[1] + 0.015, BEATS.cutIn - 0.004);
      return slabFrame(i, 0, lerp(0, SLAB_Y, s) + Math.sin(Math.PI * s) * 1.2, lerp(6, 0, ease(s)), out);
    }
    if (local < BEATS.cutOut) return null;
    // Out of the back face and down onto the floor.
    const s = window01(local, BEATS.cutOut + 0.008, BEATS.cutOut + 0.045);
    const run = window01(local, BEATS.cutOut + 0.045, 1);
    return slabFrame(i, 0, lerp(SLAB_Y, 0, s) + Math.sin(Math.PI * s) * 0.8, lerp(0, -2.6, ease(s)) - run * runOff, out);
  }
  if (local < BEATS.cutOut) {
    const s = ease(window01(local, spinEnd, BEATS.cutOut));
    const phi = Math.PI * s;
    const r = lerp(6, 4.4, s);
    return slabFrame(i, Math.sin(phi) * r, 0, Math.cos(phi) * r, out);
  }
  const run = window01(local, BEATS.cutOut, 1);
  return slabFrame(i, 0, 0, lerp(-4.4, -2.6, run) - run * runOff, out);
}

function slabCamera(i, local, mobile, cam, aspect) {
  const dive = dives(i, mobile);
  const spinEnd = dive ? BEATS.spin[1] : MOBILE_SPIN_END;
  const radius = RADIUS * Math.max(1, 1.1 / aspect);
  cam.fov = 50;
  cam.roll = 0;
  cam.cut = GALLERY_CUT;
  cam.shake = 0;

  if (local < BEATS.approach[1]) {
    const e = ease(window01(local, 0, BEATS.approach[1]));
    exitCamera(i - 1, va, vb);
    cam.position.lerpVectors(va, slabFrame(i, -radius, 2.4, 0, vc), e);
    cam.target.lerpVectors(vb, slabFrame(i, 0, SLAB_Y, 0, vd), e);
    return;
  }
  if (local < spinEnd) {
    const theta = -Math.PI / 2 + Math.PI * ease(window01(local, BEATS.spin[0], spinEnd));
    slabFrame(i, Math.sin(theta) * radius, 2.4, Math.cos(theta) * radius, cam.position);
    slabFrame(i, 0, SLAB_Y, 0, cam.target);
    return;
  }
  if (dive && local < BEATS.cutIn) {
    // Round to the front and straight through the glass after the fox.
    const e = ease(window01(local, BEATS.spin[1], BEATS.cutIn));
    const theta = lerp(Math.PI / 2, 0, Math.min(1, e * 1.8));
    const r = lerp(radius, 0.12, e * e);
    slabFrame(i, Math.sin(theta) * r, lerp(2.4, SLAB_Y, e), Math.cos(theta) * r, cam.position);
    cam.target.lerpVectors(slabFrame(i, 0, SLAB_Y, 0, va), slabFrame(i, 0, SLAB_Y, -6, vb), e);
    return;
  }
  if (dive && local < BEATS.cutOut) {
    WORLDS[projects[i].slug].camera(window01(local, BEATS.cutIn, BEATS.cutOut), cam);
    const origin = worldOrigin(i, vc);
    cam.position.add(origin);
    cam.target.add(origin);
    cam.cut = GALLERY_CUT + 1 + i;
    return;
  }
  slabFrame(i, -4.2, 2.4, -7, va);
  if (!dive && local < BEATS.cutOut) {
    cam.position.lerpVectors(slabFrame(i, radius, 2.4, 0, vb), va, ease(window01(local, spinEnd, BEATS.cutOut)));
    slabFrame(i, 0, SLAB_Y, 0, cam.target);
    return;
  }
  exitCamera(i, vb, vc);
  cam.position.lerpVectors(va, vb, ease(window01(local, BEATS.cutOut, 1)));
  // The camera watches the slab, then follows its shards down the curve to where they land.
  shardFlight(i, window01(local, BEATS.shatter[0], 1), cam.target);
}

/** @type {import('../camera/shots.js').Shot} */
export function galleryShot(progress, out, aspect = 16 / 9) {
  const { index, local } = slabAt(progress);
  slabCamera(index, local, isMobile(), out, aspect);
  const dolly = dollyAmount();
  if (dolly > 0) out.position.lerp(out.target, 0.28 * dolly);
}

const fa = new Vector3();
const fb = new Vector3();
const fc = new Vector3();
const foxLook = new Vector3();

/** @type {import('../actors/foxShots.js').FoxShot} */
function galleryFoxShot(progress, pose, input) {
  const { index, local } = slabAt(progress);
  const mobile = isMobile();
  pose.scale = 0.6;
  pose.up.set(0, 1, 0);
  input.hint = 'run';
  input.velocity = 900;
  const here = foxOnFloor(index, local, mobile, fa);
  if (here) {
    pose.position.copy(here);
    pose.cut = GALLERY_CUT;
    const ahead = foxOnFloor(index, Math.min(1, local + 0.004), mobile, fb);
    if (ahead) {
      ahead.sub(here).setY(0);
      if (ahead.lengthSq() > 1e-6) pose.forward.copy(ahead.normalize());
    }
    return;
  }
  WORLDS[projects[index].slug].fox(window01(local, BEATS.cutIn, BEATS.cutOut), pose, input);
  const origin = worldOrigin(index, fc);
  pose.position.add(origin);
  if (input.look) {
    foxLook.copy(input.look).add(origin);
    input.look = foxLook;
  }
  pose.cut = GALLERY_CUT + 1 + index;
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

const worldAir = new Color();
const probe = new Vector3();
const tilt = { x: 0, y: 0 };
const ahead = new Vector3();

export default function S06Gallery() {
  const tier = useFilm((s) => s.quality);
  const { camera, scene } = useThree();
  const textures = useTexture(
    projects.map((p) => p.image),
    (loaded) => {
      for (const texture of [loaded].flat()) {
        texture.colorSpace = SRGBColorSpace;
        texture.anisotropy = 4;
        texture.needsUpdate = true;
      }
    },
  );

  const slabStates = useMemo(() => projects.map(() => ({ current: { visible: true, ring: 0, angle: 0, tiltX: 0, tiltY: 0 } })), []);
  const shatterStates = useMemo(() => projects.map(() => ({ current: { visible: false, t: 0 } })), []);
  const worldProgress = useRef(0);
  const track = useRef({ position: new Vector3(), forward: new Vector3(0, 0, -1), onFloor: false });
  const pointer = useRef({ x: 0, y: 0, active: false });
  const hover = useRef(-1);
  const [worldIndex, setWorldIndex] = useState(-1);
  const worldIndexRef = useRef(-1);
  const flashRef = useRef(null);

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

  useEffect(() => registerShot('S06', galleryShot), []);
  useEffect(() => registerFoxShot('S06', galleryFoxShot), []);
  useEffect(() => () => flash.dispose(), [flash]);
  useEffect(
    () => () => {
      if (scene.background?.isColor) scene.background.copy(NIGHT);
      scene.fog?.color.copy(NIGHT);
      film.getState().setGalleryIndex(-1);
      document.body.style.cursor = '';
    },
    [scene],
  );

  // The film canvas takes no pointer events, so hover and click are read from the window.
  useEffect(() => {
    const onMove = (event) => {
      pointer.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = -(event.clientY / window.innerHeight) * 2 + 1;
      pointer.current.active = true;
    };
    const onClick = (event) => {
      if (event.target instanceof Element && event.target.closest('a, button, input, textarea, select, label')) return;
      const p = sceneProgressOf('S06');
      if (p <= 0 || p >= 1 || hover.current < 0) return;
      openProject(hover.current);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('click', onClick);
    };
  }, []);

  useEffect(() => {
    if (!FILM_TEST) return undefined;
    // Tests read which slab plays, whether its world is mounted, and what the HUD shows.
    window.__filmTest.gallery = () => {
      const { index, local } = slabAt(sceneProgressOf('S06'));
      return { index, local, world: worldIndexRef.current, hud: film.getState().galleryIndex };
    };
    return () => {
      delete window.__filmTest.gallery;
    };
  }, []);

  useFrame((state, delta) => {
    const p = sceneProgressOf('S06');
    const active = p > 0 && p < 1;
    const mobile = isMobile();
    const { index, local } = slabAt(p);
    const dive = dives(index, mobile);
    const spinEnd = dive ? BEATS.spin[1] : MOBILE_SPIN_END;
    const inWorld = active && dive && local >= BEATS.cutIn && local < BEATS.cutOut;
    worldProgress.current = window01(local, BEATS.cutIn, BEATS.cutOut);

    // The world mounts from the spin, so its shaders compile before the dive, not on the cut.
    const wantWorld = active && dive && local >= BEATS.spin[0] && local < BEATS.cutOut + 0.02 ? index : -1;
    if (wantWorld !== worldIndexRef.current) {
      worldIndexRef.current = wantWorld;
      setWorldIndex(wantWorld);
    }

    const hud = active ? index : -1;
    if (film.getState().galleryIndex !== hud) film.getState().setGalleryIndex(hud);

    // The air is S06's only while it plays: mounted beside S05, it must not paint over the rooms.
    if (active) {
      const air = inWorld ? worldAir.set(WORLDS[projects[index].slug].background) : NIGHT;
      if (scene.background?.isColor) scene.background.copy(air);
      scene.fog?.color.copy(air);
    }

    // Paw prints follow the fox while it runs the floor.
    const floor = active ? foxOnFloor(index, local, mobile, track.current.position) : null;
    track.current.onFloor = Boolean(floor) && floor.y - GALLERY_ORIGIN.y < 0.05;
    if (floor) {
      const next = foxOnFloor(index, Math.min(1, local + 0.004), mobile, ahead);
      if (next) {
        next.sub(floor).setY(0);
        if (next.lengthSq() > 1e-6) track.current.forward.copy(next.normalize());
      }
    }

    // Hover: is the pointer over the playing slab's face on screen?
    let over = -1;
    const canHover = active && pointer.current.active && (dive ? local < BEATS.spin[1] + 0.02 : local < BEATS.cutOut);
    if (canHover) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let behind = false;
      for (const [cx, cy] of CORNERS) {
        slabFrame(index, (cx * SLAB_SIZE.width) / 2, SLAB_Y + (cy * SLAB_SIZE.height) / 2, SLAB_SIZE.depth / 2, probe).project(camera);
        if (probe.z > 1) behind = true;
        minX = Math.min(minX, probe.x);
        maxX = Math.max(maxX, probe.x);
        minY = Math.min(minY, probe.y);
        maxY = Math.max(maxY, probe.y);
      }
      const { x, y } = pointer.current;
      if (!behind && x >= minX && x <= maxX && y >= minY && y <= maxY) {
        over = index;
        const nx = clamp01((x - minX) / (maxX - minX || 1)) * 2 - 1;
        const ny = clamp01((y - minY) / (maxY - minY || 1)) * 2 - 1;
        tilt.x = -ny * TILT_MAX;
        tilt.y = nx * TILT_MAX;
      }
    }
    if (over !== hover.current) {
      hover.current = over;
      document.body.style.cursor = over >= 0 ? 'pointer' : '';
    }

    const damp = Math.min(1, delta * 8);
    projects.forEach((_, j) => {
      const s = slabStates[j].current;
      const shattering = active && index === j && local >= BEATS.shatter[0];
      const forming = active && index === j - 1 && local >= BEATS.shatter[0];
      s.visible = p < 1 && !(p > 0 && index > j) && !shattering && !forming;
      s.ring = active && index === j ? window01(local, 0.04, 0.12) * (1 - window01(local, spinEnd - 0.03, spinEnd + 0.03)) : 0;
      s.angle = local * Math.PI * 2.5;
      const targetX = over === j ? tilt.x : 0;
      const targetY = over === j ? tilt.y : 0;
      s.tiltX += (targetX - s.tiltX) * damp;
      s.tiltY += (targetY - s.tiltY) * damp;
      const shards = shatterStates[j].current;
      shards.visible = shattering;
      shards.t = window01(local, BEATS.shatter[0], 1);
    });

    // A flash hides each change of world: in from the rooms, into a slab, and back out.
    const f = flashRef.current;
    if (f) {
      let o = active && p < ENTRY_FLASH ? 1 - p / ENTRY_FLASH : 0;
      if (active && dive) {
        const near = Math.min(Math.abs(local - BEATS.cutIn), Math.abs(local - BEATS.cutOut));
        o = Math.max(o, clamp01(1 - near / 0.02));
      }
      f.visible = o > 0.001;
      flash.uniforms.uOpacity.value = o;
      const height = 2 * Math.tan((camera.fov * Math.PI) / 360) * 1.4;
      flash.uniforms.uSize.value = [height * camera.aspect, height];
    }
  });

  const world = worldIndex >= 0 ? WORLDS[projects[worldIndex].slug] : null;
  const World = world?.default ?? null;
  return (
    <>
      <MirrorFloor tier={tier} />
      {projects.map((project, j) => (
        <Slab key={project.slug} index={j} name={project.name} texture={textures[j]} stateRef={slabStates[j]} />
      ))}
      {projects.map((project, j) => (
        <SlabShatter key={`${project.slug}-shards`} index={j} texture={textures[j]} nextTexture={textures[j + 1] ?? null} stateRef={shatterStates[j]} />
      ))}
      <PawPrints trackRef={track} />
      {World ? (
        <World progressRef={worldProgress} origin={worldOrigin(worldIndex)} colours={projectColours[projects[worldIndex].slug]} tier={tier} />
      ) : null}
      <mesh ref={flashRef} material={flash} visible={false} frustumCulled={false} renderOrder={955}>
        <planeGeometry args={[1, 1]} />
      </mesh>
    </>
  );
}
