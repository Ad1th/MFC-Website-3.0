import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { Color, Plane, Raycaster, ShaderMaterial, Vector2, Vector3 } from 'three';
import Fox from './Fox.jsx';
import { BEHAVIOURS } from './behaviours.js';
import { MOODS } from './foxBrain.js';
import { TIERS } from '../quality.js';
import { registerRenderer, StatsProbe, stats } from '../debug/stats.js';
import { PALETTE } from '../palette.js';
import { FOX_REGRESS } from './testHooks.js';
import styles from './Sandbox.module.css';

/**
 * ?sandbox=fox: the fox on its own, with a button for every mood and behaviour,
 * velocity and idle sliders, three camera distances and window.__fox for scripts.
 * URL: approach=A|B shot=hero|dive|sky velocity=0..4000 idle=seconds mood=<mood>
 *      bloom=0|1 trail=0|1 eyes=0|1 tier=1|2|3
 */

const SHOTS = {
  hero: { label: 'hero, full body', position: new Vector3(1.75, 0.58, 1.55), look: new Vector3(0, 0.4, -0.1), fov: 35 },
  dive: { label: 'dive, mid shot', position: new Vector3(-0.6, 1.85, -3.4), look: new Vector3(0, 0.35, 1.2), fov: 45 },
  sky: { label: 'sky, small in frame', position: new Vector3(5.2, 0.45, 9.8), look: new Vector3(0, 2.3, 0), fov: 40 },
  // Close-ups follow the live bones, so they stay framed when the fox sits, lies or sleeps.
  face: { label: 'close, face and ears', follow: 'eyes', offset: new Vector3(0.9, 0.2, 1.15), position: new Vector3(0.9, 0.8, 1.55), look: new Vector3(0, 0.6, 0.42), fov: 30 },
  tail: { label: 'close, tail', follow: 'tailTip', offset: new Vector3(-0.7, 0.34, -0.8), position: new Vector3(-0.9, 0.55, -1.6), look: new Vector3(0, 0.3, -0.7), fov: 32 },
};

const APPROACHES = ['A', 'B', 'C'];
const APPROACH_LABELS = { A: 'A: flame body + embers', B: 'B: particle fox', C: 'C: embers + faint flame shell' };

const params = new URLSearchParams(window.location.search);
const numberParam = (key, fallback) => {
  const v = Number(params.get(key));
  return params.has(key) && Number.isFinite(v) ? v : fallback;
};

const floorVertex = /* glsl */ `
  varying vec2 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const floorFragment = /* glsl */ `
  uniform float uOffset;
  uniform vec3 uColor;
  varying vec2 vWorld;
  void main() {
    vec2 p = vec2(vWorld.x, vWorld.y + uOffset) * 2.0;
    vec2 cell = fract(p) - 0.5;
    float dotMask = smoothstep(0.06, 0.0, length(cell));
    float fade = smoothstep(14.0, 2.0, length(vWorld));
    gl_FragColor = vec4(uColor * dotMask * fade, 1.0);
    #include <colorspace_fragment>
  }
`;

function Floor({ inputRef }) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uOffset: { value: 0 }, uColor: { value: new Color(PALETTE.ashDim).multiplyScalar(0.35) } },
        vertexShader: floorVertex,
        fragmentShader: `#include <common>\n${floorFragment}`,
      }),
    [],
  );
  useFrame((_, delta) => {
    material.uniforms.uOffset.value -= (inputRef.current.speed ?? 0) * 0.01 * delta;
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} material={material}>
      <planeGeometry args={[40, 40]} />
    </mesh>
  );
}

function CameraRig({ shot, foxRef }) {
  const { camera } = useThree();
  const look = useRef(SHOTS[shot].look.clone());
  const desiredPosition = useMemo(() => new Vector3(), []);
  const desiredLook = useMemo(() => new Vector3(), []);
  useFrame((_, delta) => {
    const target = SHOTS[shot];
    const anchor = target.follow ? foxRef.current?.anchors()[target.follow] : null;
    if (anchor) {
      desiredLook.copy(anchor);
      desiredPosition.copy(anchor).add(target.offset);
    } else {
      desiredLook.copy(target.look);
      desiredPosition.copy(target.position);
    }
    const k = 1 - Math.exp(-4 * delta);
    camera.position.lerp(desiredPosition, k);
    look.current.lerp(desiredLook, k);
    camera.fov += (target.fov - camera.fov) * k;
    camera.updateProjectionMatrix();
    camera.lookAt(look.current);
  });
  return null;
}

function Bridge({ bridgeRef }) {
  const three = useThree();
  bridgeRef.current = three;
  return null;
}

const speedFor = (velocity) => Math.min(Math.abs(velocity), 3000) * 0.17;

export default function Sandbox() {
  const [approach, setApproach] = useState(APPROACHES.includes(params.get('approach')) ? params.get('approach') : 'A');
  const [shot, setShot] = useState(SHOTS[params.get('shot')] ? params.get('shot') : 'hero');
  const [velocity, setVelocity] = useState(numberParam('velocity', 0));
  const [autoIdle, setAutoIdle] = useState(!params.has('idle'));
  const [idle, setIdle] = useState(numberParam('idle', 0));
  const [mood, setMood] = useState(MOODS.includes(params.get('mood')) ? params.get('mood') : 'auto');
  const [bloom, setBloom] = useState(params.get('bloom') !== '0');
  const [trail, setTrail] = useState(params.get('trail') !== '0');
  const [eyes, setEyes] = useState(params.get('eyes') !== '0');
  const [force, setForce] = useState(true);
  const tier = [1, 2, 3].includes(numberParam('tier', 2)) ? numberParam('tier', 2) : 2;
  // ?panel=0 hides the controls so recordings and benchmarks see only the stage.
  const showPanel = params.get('panel') !== '0';
  // Test builds only: switches a fix off so a regression test can be shown to fail.
  const regress = FOX_REGRESS;

  const foxRef = useRef(null);
  const bridgeRef = useRef(null);
  const readoutRef = useRef(null);
  const inputRef = useRef({
    velocity,
    idleSeconds: idle,
    hint: null,
    forced: null,
    scripted: false,
    speed: speedFor(velocity),
    look: null,
    lookWeight: 0,
    petting: false,
    wind: new Vector3(),
  });

  useEffect(() => {
    document.title = 'fox sandbox';
  }, []);

  // Sliders and selects write straight into the input ref.
  useEffect(() => {
    const inp = inputRef.current;
    inp.velocity = velocity;
    inp.speed = speedFor(velocity);
    if (Math.abs(velocity) > 30) inp.idleSeconds = 0;
  }, [velocity]);
  useEffect(() => {
    if (!autoIdle) inputRef.current.idleSeconds = idle;
  }, [idle, autoIdle]);
  useEffect(() => {
    inputRef.current.forced = mood === 'auto' ? null : mood;
  }, [mood]);

  // Idle clock, readout and window.__fox.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastPaint = 0;
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const dt = (now - last) / 1000;
      last = now;
      const inp = inputRef.current;
      if (autoIdle) inp.idleSeconds = Math.abs(inp.velocity) > 30 ? 0 : inp.idleSeconds + dt;
      if (now - lastPaint > 150 && readoutRef.current) {
        lastPaint = now;
        const s = stats();
        const fox = foxRef.current;
        readoutRef.current.textContent = [
          `mood      ${fox?.mood ?? '-'}`,
          `active    ${fox?.active.join(', ') || '-'}`,
          `idle      ${inp.idleSeconds.toFixed(1)} s`,
          `velocity  ${Math.round(inp.velocity)} px/s`,
          `particles ${fox?.particleCount ?? 0}`,
          `lowest y  ${fox?.debug().lowestY ?? '-'} (floor 0)`,
          `fps       ${s.fps} (1% ${s.low1})`,
          `draws     ${s.drawCalls}  tris ${s.triangles}`,
        ].join('\n');
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoIdle]);

  useEffect(() => {
    window.__fox = {
      setApproach: (a) => setApproach(APPROACHES.includes(a) ? a : 'A'),
      setShot: (s) => SHOTS[s] && setShot(s),
      setVelocity: (v) => setVelocity(Number(v) || 0),
      setIdle: (seconds) => {
        if (seconds === null) setAutoIdle(true);
        else {
          setAutoIdle(false);
          setIdle(seconds);
        }
      },
      setMood: (m) => setMood(MOODS.includes(m) ? m : 'auto'),
      setBloom,
      trigger: (name, opts = {}, forced = true) => foxRef.current?.trigger(name, opts, { force: forced }),
      pose: (key, yaw, pitch, roll) => foxRef.current?.setPose(key, yaw, pitch, roll),
      clearPose: () => foxRef.current?.clearPose(),
      state: () => ({
        mood: foxRef.current?.mood,
        active: foxRef.current?.active,
        petting: inputRef.current.petting,
        stats: stats(),
        approach,
        shot,
        fox: foxRef.current?.debug(),
      }),
      /** World-space ember emitter, body and root centroids (regression tests). */
      tracking: () => foxRef.current?.tracking() ?? null,
      /** Mark the fox as holding a scene-scripted pose (behaviours must not fire). */
      setScripted: (value) => {
        inputRef.current.scripted = Boolean(value);
      },
      lastPounce: () => foxRef.current?.lastPounce ?? null,
      /** Ground-plane world point under a canvas pixel (tests pick unclamped pounce targets with it). */
      groundAt: (x, y) => {
        const p = worldAt(x, y, ground);
        return p ? { x: p.x, y: p.y, z: p.z } : null;
      },
      look: () => foxRef.current?.look ?? null,
      /** World-space wind vector from the pointer, before it reaches the shader. */
      wind: () => inputRef.current.wind.toArray(),
      /** Head and body position in canvas pixels, for scripted pointer interactions. */
      screen: () => {
        const three = bridgeRef.current;
        if (!three || !foxRef.current) return null;
        const { head, body, radius } = foxRef.current.project(three.camera, three.size);
        return { head, body, radius };
      },
    };
  }, [approach, shot]);

  // Pointer: sniff, wind, petting, pounce and chase play.
  const pointer = useRef({ x: 0, y: 0, vx: 0, speed: 0, lastT: 0, still: 0, down: null, osc: [], chaseStep: 0 });
  const raycaster = useMemo(() => new Raycaster(), []);
  const ground = useMemo(() => new Plane(new Vector3(0, 1, 0), 0), []);

  const worldAt = useCallback(
    (x, y, plane) => {
      const three = bridgeRef.current;
      if (!three) return null;
      const ndc = new Vector2((x / three.size.width) * 2 - 1, -(y / three.size.height) * 2 + 1);
      raycaster.setFromCamera(ndc, three.camera);
      return raycaster.ray.intersectPlane(plane, new Vector3());
    },
    [raycaster],
  );

  const onPointerMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const p = pointer.current;
    const now = performance.now();
    const dt = Math.max((now - p.lastT) / 1000, 1 / 240);
    const vx = (x - p.x) / dt;
    const speed = Math.hypot(x - p.x, y - p.y) / dt;
    if (Math.sign(vx) !== Math.sign(p.vx) && Math.abs(vx) > 200) p.osc.push(now);
    p.osc = p.osc.filter((t) => now - t < 1200);
    Object.assign(p, { x, y, vx, speed, lastT: now });

    const three = bridgeRef.current;
    const fox = foxRef.current;
    if (!three || !fox) return;
    const info = fox.project(three.camera, three.size);
    const inp = inputRef.current;
    const distHead = Math.hypot(x - info.head.x, y - info.head.y);

    // Wind: fast cursor bends flames away from the pointer.
    if (speed > 900) {
      const away = new Vector3(info.body.x - x, -(info.body.y - y), 0).normalize();
      const cam = three.camera;
      const right = new Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
      const up = new Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      inp.wind.copy(right.multiplyScalar(away.x).add(up.multiplyScalar(away.y))).setLength(Math.min(speed / 2500, 1));
    }

    // Chase play: quick oscillation in front of the face.
    if (p.osc.length >= 4 && distHead < 200) {
      const lookPlane = new Plane().setFromNormalAndCoplanarPoint(three.camera.getWorldDirection(new Vector3()).negate(), info.headWorld);
      inp.look = worldAt(x, y, lookPlane);
      inp.lookWeight = 1;
      const steps = [
        () => fox.trigger('wag', { intensity: 1 }),
        () => fox.trigger('playBow'),
        () => {
          const target = worldAt(x, y, ground);
          return target ? fox.trigger('pounce', { targetWorld: target }) : false;
        },
      ];
      // One wag, one bow, one bat per play episode; a new episode starts once the wiggling stops.
      if (p.chaseStep < steps.length && steps[p.chaseStep]()) p.chaseStep += 1;
    }
  };

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const p = pointer.current;
      const inp = inputRef.current;
      const three = bridgeRef.current;
      const fox = foxRef.current;
      inp.wind.multiplyScalar(0.92);
      if (!three || !fox) return;
      const now = performance.now();
      p.osc = p.osc.filter((t) => now - t < 1200);
      if (p.osc.length === 0 && now - p.lastT > 1500) p.chaseStep = 0;
      if (now - p.lastT > 60) p.speed *= 0.8;
      p.still = p.speed < 60 ? p.still + 16 : 0;
      const info = fox.project(three.camera, three.size);
      const distHead = Math.hypot(p.x - info.head.x, p.y - info.head.y);
      const sniffing = p.still > 300 && distHead < 120;
      const chasing = p.osc.length >= 4 && distHead < 200;
      if (sniffing) {
        const lookPlane = new Plane().setFromNormalAndCoplanarPoint(three.camera.getWorldDirection(new Vector3()).negate(), info.headWorld);
        inp.look = worldAt(p.x, p.y, lookPlane);
        inp.lookWeight = 1;
      } else if (!chasing) {
        inp.lookWeight *= 0.9;
      }
      if (p.down && !inp.petting && now - p.down.t > 400 && p.down.onFox) inp.petting = true;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [worldAt]);

  const onPointerDown = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const three = bridgeRef.current;
    const fox = foxRef.current;
    if (!three || !fox) return;
    const info = fox.project(three.camera, three.size);
    const dist = Math.hypot(x - info.body.x, y - info.body.y);
    const hitRadius = regress === 'no-hit-radius' ? 0 : info.radius;
    const nearRadius = regress === 'no-near-radius' ? info.radius : info.radius + 250;
    pointer.current.down = { t: performance.now(), x, y, onFox: dist < hitRadius, near: dist < nearRadius };
  };

  const onPointerUp = (event) => {
    const p = pointer.current;
    const inp = inputRef.current;
    const down = p.down;
    p.down = null;
    if (inp.petting) {
      inp.petting = false;
      return;
    }
    if (!down || down.onFox || !down.near || performance.now() - down.t > 350) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const target = worldAt(event.clientX - rect.left, event.clientY - rect.top, ground);
    if (target) foxRef.current?.trigger('pounce', { targetWorld: target }, { force });
  };

  const trigger = (name) => {
    const opts = name === 'tilt' ? { dir: Math.random() < 0.5 ? 1 : -1 } : name === 'pounce' ? { target: new Vector3(0, 0, 45) } : {};
    foxRef.current?.trigger(name, opts, { force });
  };

  return (
    <div className={styles.sandbox} style={showPanel ? undefined : { gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div
        className={styles.stage}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          pointer.current.down = null;
          inputRef.current.petting = false;
        }}
      >
        <Canvas
          flat
          dpr={[1, TIERS[tier].dpr]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          camera={{ fov: SHOTS[shot].fov, near: 0.05, far: 100, position: SHOTS[shot].position.toArray() }}
          onCreated={({ gl }) => registerRenderer(gl)}
        >
          <color attach="background" args={[PALETTE.night]} />
          <Bridge bridgeRef={bridgeRef} />
          <CameraRig shot={shot} foxRef={foxRef} />
          <Floor inputRef={inputRef} />
          <Suspense fallback={null}>
            <Fox key={`${approach}-${tier}`} ref={foxRef} approach={approach} tier={tier} input={inputRef} trail={trail} eyes={eyes} />
          </Suspense>
          {bloom ? (
            <EffectComposer multisampling={0}>
              <Bloom mipmapBlur intensity={0.9} luminanceThreshold={1.02} luminanceSmoothing={0.12} />
            </EffectComposer>
          ) : null}
          <StatsProbe />
        </Canvas>
      </div>

      {/* Not rendered at all with ?panel=0: the module's display:grid would override [hidden]. */}
      {showPanel ? (
      <aside className={styles.panel} aria-label="fox controls">
        <h1 className={styles.title}>fox sandbox</h1>

        <fieldset className={styles.group}>
          <legend>rendering</legend>
          {APPROACHES.map((a) => (
            <label key={a} className={styles.choice}>
              <input type="radio" name="approach" checked={approach === a} onChange={() => setApproach(a)} />
              {APPROACH_LABELS[a]}
            </label>
          ))}
        </fieldset>

        <fieldset className={styles.group}>
          <legend>camera</legend>
          {Object.entries(SHOTS).map(([key, s]) => (
            <label key={key} className={styles.choice}>
              <input type="radio" name="shot" checked={shot === key} onChange={() => setShot(key)} />
              {s.label}
            </label>
          ))}
        </fieldset>

        <fieldset className={styles.group}>
          <legend>input</legend>
          <label className={styles.slider}>
            velocity {Math.round(velocity)} px/s
            <input type="range" min="0" max="4000" step="10" value={velocity} onChange={(e) => setVelocity(Number(e.target.value))} />
          </label>
          <label className={styles.choice}>
            <input type="checkbox" checked={autoIdle} onChange={(e) => setAutoIdle(e.target.checked)} />
            idle counts up on its own
          </label>
          <label className={styles.slider}>
            idle {idle} s
            <input type="range" min="0" max="90" step="1" value={idle} disabled={autoIdle} onChange={(e) => setIdle(Number(e.target.value))} />
          </label>
          <label className={styles.slider}>
            mood
            <select value={mood} onChange={(e) => setMood(e.target.value)}>
              <option value="auto">auto (from input)</option>
              {MOODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        </fieldset>

        <fieldset className={styles.group}>
          <legend>behaviours</legend>
          <label className={styles.choice}>
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
            ignore the 2s cooldown
          </label>
          <div className={styles.buttons}>
            {Object.entries(BEHAVIOURS).map(([name, def]) => (
              <button key={name} type="button" onClick={() => trigger(name)}>
                {name} <span>{def.duration.toFixed(2)}s</span>
              </button>
            ))}
          </div>
          <p className={styles.hint}>hold on the fox to pet. click near it to pounce. wiggle the cursor in front of its face to play. hold the cursor still near its head to be sniffed.</p>
        </fieldset>

        <fieldset className={styles.group}>
          <legend>layers</legend>
          <label className={styles.choice}>
            <input type="checkbox" checked={trail} onChange={(e) => setTrail(e.target.checked)} />
            trail
          </label>
          <label className={styles.choice}>
            <input type="checkbox" checked={eyes} onChange={(e) => setEyes(e.target.checked)} />
            eyes
          </label>
          <label className={styles.choice}>
            <input type="checkbox" checked={bloom} onChange={(e) => setBloom(e.target.checked)} />
            bloom
          </label>
        </fieldset>

        <pre ref={readoutRef} className={styles.readout} aria-live="off" />
      </aside>
      ) : null}
    </div>
  );
}
