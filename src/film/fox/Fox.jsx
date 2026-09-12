import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { AnimationMixer, Matrix4, Points, Quaternion, Vector3 } from 'three';
import { createRig, furLuminance, sampleSurface, FOX_SCALE, FOX_URL, LANDMARKS } from './rig.js';
import { createFlameMaterial, createParticleMaterial } from './materials.js';
import { createFoxBrain } from './foxBrain.js';
import { createBehaviourEngine } from './behaviours.js';
import { POSES } from './poses.js';
import Trail from './Trail.jsx';
import Eyes from './Eyes.jsx';
import Sparks from './Sparks.jsx';
import { TIERS } from '../quality.js';
import { reportParticles } from '../debug/stats.js';
import { FOX_REGRESS } from './testHooks.js';

/**
 * The fox. Two rendering approaches share one rig, brain and behaviour engine:
 *   A: skinned mesh with the flame body shader plus a GPU-skinned ember emitter
 *   B: pure particle fox (surface points) shedding a smaller share of embers
 * All per-frame work reads refs and writes uniforms. No React state per frame.
 *
 * @typedef {object} FoxInput
 * @property {number} velocity       scroll-like velocity, px/s
 * @property {number} idleSeconds    time since last input
 * @property {string|null} hint      scene pose hint: sit, curl, run, sleep
 * @property {string|null} forced    force a mood (sandbox)
 * @property {boolean} scripted      a scene pose is playing; behaviours hold
 * @property {number} speed          forward ground speed in model units per second
 * @property {Vector3|null} look     world point to look at
 * @property {number} lookWeight     0 to 1
 * @property {boolean} petting       pointer held on the fox
 * @property {Vector3} wind          world-space wind, length 0 to 1
 * @property {number} [timeScale]    1 = normal; 0 freezes animation, embers and trail (bullet time)
 * @property {{ name: string, weight: number }|null} [scenePose]  a POSES entry a scene holds
 * @property {number|null} [eyeOverride]  eye openness a scene drives directly (scroll-driven blink)
 */

const DEG = Math.PI / 180;
const qTmp = new Quaternion();
const vTmp = new Vector3();
const mTmp = new Matrix4();

function mergeOffsets(target, source, weight) {
  for (const [key, [yaw, pitch, roll]] of Object.entries(source)) {
    const bone = target[key] ?? (target[key] = [0, 0, 0]);
    bone[0] += yaw * weight;
    bone[1] += pitch * weight;
    bone[2] += roll * weight;
  }
}

function applyBoneOffsets(rig, offsets) {
  for (const [key, [yaw, pitch, roll]] of Object.entries(offsets)) {
    const bone = rig.bones[key];
    const axes = rig.localAxes[key];
    if (!bone || !axes) continue;
    if (yaw) bone.quaternion.multiply(qTmp.setFromAxisAngle(axes.yaw, yaw * DEG));
    if (pitch) bone.quaternion.multiply(qTmp.setFromAxisAngle(axes.pitch, pitch * DEG));
    if (roll) bone.quaternion.multiply(qTmp.setFromAxisAngle(axes.roll, roll * DEG));
  }
}

const Fox = forwardRef(function Fox({ approach = 'A', tier = 2, input, trail = true, eyes = true, position = [0, 0, 0], rotation = [0, 0, 0] }, ref) {
  const gltf = useGLTF(FOX_URL);
  const rig = useMemo(() => createRig(gltf), [gltf]);
  const groupRef = useRef(null);
  const brain = useMemo(() => createFoxBrain(), []);
  const engine = useMemo(() => createBehaviourEngine(), []);
  const eyeState = useRef({ scale: 1 });
  const trailFade = useRef(1);
  const lastPounce = useRef(null);
  const sparksRef = useRef(null);
  const debugPose = useRef({});
  const lastFrame = useRef({ mood: 'trot', brain: null });

  const fur = useMemo(() => rig.mesh.material.map ?? null, [rig]);

  const flame = useMemo(() => createFlameMaterial(fur, { ghost: approach === 'C' }), [fur, approach]);

  const particles = useMemo(() => {
    const budget = TIERS[tier]?.particles ?? TIERS[2].particles;
    if (!budget) return null;
    const geometry =
      approach === 'A'
        ? sampleSurface(rig.mesh, budget, { emberRatio: 1, seed: 11 })
        : sampleSurface(rig.mesh, budget, { emberRatio: 0.22, seed: 23, luminance: furLuminance(fur), earBoost: 5 });
    const material =
      approach === 'A'
        ? createParticleMaterial(rig.mesh, { size: 0.0065, life: 0.95, rise: 16, spread: 7 })
        : createParticleMaterial(rig.mesh, { size: 0.0105, life: 0.8, rise: 13, spread: 5 });
    const points = new Points(geometry, material);
    points.frustumCulled = false;
    return { points, material, count: budget };
  }, [rig, approach, tier, fur]);

  useEffect(() => {
    rig.mesh.material = flame;
    // A: solid flame body. B: particles only. C: B's particles over a faint flame shell.
    rig.mesh.visible = approach !== 'B';
  }, [rig, flame, approach]);

  useEffect(() => {
    reportParticles(particles?.count ?? 0);
    // The particles skin against the mesh's bindMatrixInverse, which tracks the rig
    // root's world transform, so they must live under the same root. Parented to the
    // outer group they stayed behind whenever the root moved (overtake, pounce).
    // Test builds can re-create the old bug (FOX_REGRESS) to prove the regression test fails.
    const parent = FOX_REGRESS === 'embers-parent' && groupRef.current ? groupRef.current : rig.root;
    if (particles) parent.add(particles.points);
    return () => {
      if (particles) parent.remove(particles.points);
      particles?.points.geometry.dispose();
      particles?.material.dispose();
    };
  }, [particles, rig]);

  const mixer = useMemo(() => new AnimationMixer(rig.root), [rig]);
  const actions = useMemo(() => {
    const clip = (name) => rig.animations.find((c) => c.name === name);
    const make = (name) => {
      const action = mixer.clipAction(clip(name));
      action.play();
      action.setEffectiveWeight(0);
      return action;
    };
    // Sleep is a Blender-authored clip when the model carries one (DECISIONS D-057);
    // otherwise the code pose in poses.js is used.
    return { survey: make('Survey'), walk: make('Walk'), run: make('Run'), sleep: clip('Sleep') ? make('Sleep') : null };
  }, [mixer, rig]);

  useEffect(() => () => mixer.stopAllAction(), [mixer]);

  useImperativeHandle(
    ref,
    () => ({
      trigger(name, opts = {}, { force = false } = {}) {
        const payload = { ...opts };
        if (name === 'pounce' && opts.targetWorld && groupRef.current) {
          mTmp.copy(groupRef.current.matrixWorld).invert();
          const local = vTmp.copy(opts.targetWorld).applyMatrix4(mTmp);
          const offset = new Vector3(local.x - rig.root.position.x, 0, local.z - rig.root.position.z);
          const clamped = offset.length() > 150;
          if (clamped) offset.setLength(150);
          payload.target = offset;
          lastPounce.current = { x: opts.targetWorld.x, z: opts.targetWorld.z, clamped };
        }
        return engine.trigger(name, payload, { force, scripted: input.current.scripted });
      },
      reset() {
        engine.reset();
        rig.root.position.set(0, 0, 0);
      },
      get mood() {
        return lastFrame.current.mood;
      },
      get active() {
        return engine.active;
      },
      get particleCount() {
        return particles?.count ?? 0;
      },
      /** The world point of the last pounce click and whether the 1.5 m cap applied. */
      get lastPounce() {
        return lastPounce.current;
      },
      /** Head-tracking spring state (degrees, degrees per second). */
      get look() {
        return engine.look;
      },
      setPose(key, yaw = 0, pitch = 0, roll = 0) {
        debugPose.current[key] = [yaw, pitch, roll];
      },
      clearPose() {
        debugPose.current = {};
      },
      /** Live world positions of the head, the point between the eyes and the tail tip (follow cameras). */
      anchors() {
        const head = rig.bones.head.getWorldPosition(new Vector3());
        const eyes = rig.bones.head.localToWorld(rig.eyesLocal.left.clone().add(rig.eyesLocal.right).multiplyScalar(0.5));
        const tailTip = rig.bones.tail3.localToWorld(rig.tailTipLocal.clone());
        return { head, eyes, tailTip };
      },
      /**
       * World-space centroids for regression tests. The same sample of particle source
       * points is skinned on the CPU twice with the shader's formula: once through the
       * particles' own parent transform (`ember`, where the embers really render) and once
       * through the skinned mesh's transform (`body`, where the fox's surface is). With the
       * particles attached correctly the two are identical; attached to the wrong parent
       * they separate by however far the rig root has moved.
       */
      tracking(sample = 256) {
        let ember = null;
        let body = null;
        if (particles) {
          const geo = particles.points.geometry;
          const pos = geo.attributes.position;
          const si = geo.attributes.skinIndex;
          const sw = geo.attributes.skinWeight;
          const boneMatrices = rig.mesh.skeleton.boneMatrices;
          const bone = new Matrix4();
          const bound = new Vector3();
          const skinned = new Vector3();
          const part = new Vector3();
          const local = new Vector3();
          const emberSum = new Vector3();
          const bodySum = new Vector3();
          const step = Math.max(1, Math.floor(pos.count / sample));
          let n = 0;
          for (let i = 0; i < pos.count; i += step) {
            bound.fromBufferAttribute(pos, i).applyMatrix4(rig.mesh.bindMatrix);
            skinned.set(0, 0, 0);
            for (let k = 0; k < 4; k += 1) {
              const w = sw.getComponent(i, k);
              if (!w) continue;
              bone.fromArray(boneMatrices, si.getComponent(i, k) * 16);
              skinned.add(part.copy(bound).applyMatrix4(bone).multiplyScalar(w));
            }
            local.copy(skinned).applyMatrix4(rig.mesh.bindMatrixInverse);
            emberSum.add(part.copy(local).applyMatrix4(particles.points.matrixWorld));
            bodySum.add(part.copy(local).applyMatrix4(rig.mesh.matrixWorld));
            n += 1;
          }
          ember = emberSum.divideScalar(n);
          body = bodySum.divideScalar(n);
        }
        const root = rig.root.getWorldPosition(new Vector3());
        // Live body length, nose to tail base, in world units: the scale for drift limits.
        const nose = rig.bones.head.localToWorld(rig.noseLocal.clone());
        const tailBase = rig.bones.tail1.getWorldPosition(new Vector3());
        const plain = (v) => (v ? { x: v.x, y: v.y, z: v.z } : null);
        return { ember: plain(ember), body: plain(body), root: plain(root), bodyLength: nose.distanceTo(tailBase) };
      },
      /** Sandbox diagnostics: positions, pose weights and a NaN check on the skeleton. */
      debug() {
        const matrices = rig.mesh.skeleton.boneMatrices;
        let nan = 0;
        for (let i = 0; i < matrices.length; i += 1) if (!Number.isFinite(matrices[i])) nan += 1;
        const round = (v) => v.toArray().map((x) => Math.round(x * 100) / 100);
        // Lowest skinned vertex, in model units above the fox's floor (CPU skinning, on demand only).
        const vertex = new Vector3();
        let lowest = Infinity;
        const count = rig.mesh.geometry.attributes.position.count;
        for (let i = 0; i < count; i += 1) {
          rig.mesh.getVertexPosition(i, vertex);
          vertex.applyMatrix4(rig.mesh.matrix);
          lowest = Math.min(lowest, vertex.y + rig.root.position.y);
        }
        return {
          wind: flame.uniforms.uWind.value.toArray().map((x) => Math.round(x * 1000) / 1000),
          trailFade: Math.round(trailFade.current * 100) / 100,
          lowestY: Math.round(lowest * 100) / 100,
          root: round(rig.root.position),
          hip: round(rig.bones.hip.position),
          hipWorld: round(rig.bones.hip.getWorldPosition(new Vector3())),
          pose: lastFrame.current.pose,
          nanInBoneMatrices: nan,
        };
      },
      /** Screen-space hit info for pointer interactions. */
      project(camera, size) {
        const head = rig.bones.head.getWorldPosition(new Vector3());
        const body = rig.root.localToWorld(LANDMARKS.bodyCentre.clone());
        const toPx = (v) => {
          const p = v.clone().project(camera);
          return { x: (p.x * 0.5 + 0.5) * size.width, y: (-p.y * 0.5 + 0.5) * size.height };
        };
        const h = toPx(head);
        const b = toPx(body);
        const tail = toPx(rig.bones.tail3.getWorldPosition(new Vector3()));
        const radius = Math.max(Math.hypot(h.x - b.x, h.y - b.y), Math.hypot(tail.x - b.x, tail.y - b.y)) * 0.9;
        return { head: h, body: b, radius, headWorld: head };
      },
    }),
    [engine, particles, rig, input, flame],
  );

  const foxTime = useRef(0);
  const timeScaleRef = useRef(1);

  useFrame((state, delta) => {
    const inp = input.current;
    const timeScale = inp.timeScale ?? 1;
    timeScaleRef.current = timeScale;
    const dt = Math.min(delta, 1 / 20) * timeScale;
    // The fox's own clock: it stops in bullet time, so embers hang in the air.
    foxTime.current += dt;
    const time = foxTime.current;

    const b = brain.update(dt, inp);
    lastFrame.current.mood = b.mood;
    lastFrame.current.pose = { sit: +b.pose.sit.toFixed(2), lie: +b.pose.lie.toFixed(2), sleep: +b.pose.sleep.toFixed(2) };

    // Look target in fox space.
    let look = null;
    if (inp.look && inp.lookWeight > 0.001 && groupRef.current) {
      mTmp.multiplyMatrices(groupRef.current.matrixWorld, rig.root.matrix).invert();
      const target = vTmp.copy(inp.look).applyMatrix4(mTmp);
      const head = rig.bones.head.getWorldPosition(new Vector3()).applyMatrix4(mTmp);
      const dir = target.sub(head);
      const yaw = Math.atan2(dir.x, dir.z) / DEG;
      const pitch = -Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) / DEG;
      const behind = 1 - Math.min(Math.max((Math.abs(yaw) - 100) / 40, 0), 1);
      look = {
        yaw: Math.max(-55, Math.min(55, yaw)),
        pitch: Math.max(-35, Math.min(30, pitch)),
        weight: inp.lookWeight * behind,
      };
    }

    const out = engine.update(dt, {
      mood: b.mood,
      entered: b.entered,
      previous: b.previous,
      scripted: inp.scripted,
      look,
      petting: inp.petting,
    });

    // Restore the bind pose first. three's PropertyMixer only writes a bone when the
    // mixed clip value changed since last frame, so whenever a clip holds still
    // (Survey at timeScale 0 in sleep, held keys, untracked Foot02 and root joints)
    // last frame's offset stays on the bone and the next offset compounds it. That
    // is what twisted sit into a knot and spun the sleeping fox out of frame
    // (verified with a minimal mixer test, DECISIONS D-055).
    for (const [key, bone] of Object.entries(rig.bones)) {
      bone.quaternion.copy(rig.bind[key].quaternion);
      bone.position.copy(rig.bind[key].position);
    }

    // Base clips.
    // With a Sleep clip, sleep weight hands the whole skeleton over to that clip.
    const clipSleep = actions.sleep ? b.pose.sleep : 0;
    const awake = 1 - clipSleep;
    actions.walk.setEffectiveWeight(b.weights.walk * awake).setEffectiveTimeScale(b.speeds.walk);
    actions.run.setEffectiveWeight(b.weights.run * awake).setEffectiveTimeScale(b.speeds.run);
    actions.survey.setEffectiveWeight(b.weights.survey * awake).setEffectiveTimeScale(b.speeds.survey);
    if (actions.sleep) actions.sleep.setEffectiveWeight(clipSleep).setEffectiveTimeScale(0);
    mixer.update(dt);

    // Poses, behaviours and sandbox debug offsets, all layered on top.
    const offsets = {};
    const hip = new Vector3();
    for (const name of ['sit', 'lie', 'sleep']) {
      let w = b.pose[name];
      if (clipSleep > 0) {
        if (name === 'sleep') continue;
        if (name === 'lie') w *= awake;
      }
      if (w < 0.001) continue;
      mergeOffsets(offsets, POSES[name].bones, w);
      hip.x += POSES[name].hip[0] * w;
      hip.y += POSES[name].hip[1] * w;
      hip.z += POSES[name].hip[2] * w;
    }
    if (inp.scenePose && POSES[inp.scenePose.name] && inp.scenePose.weight > 0.001) {
      const pose = POSES[inp.scenePose.name];
      mergeOffsets(offsets, pose.bones, inp.scenePose.weight);
      hip.x += pose.hip[0] * inp.scenePose.weight;
      hip.y += pose.hip[1] * inp.scenePose.weight;
      hip.z += pose.hip[2] * inp.scenePose.weight;
    }
    mergeOffsets(offsets, out.bones, 1);
    mergeOffsets(offsets, debugPose.current, 1);
    applyBoneOffsets(rig, offsets);

    hip.add(out.hip);
    if (hip.lengthSq() > 0) {
      const parent = rig.parentInverse.hip;
      rig.bones.hip.position.add(hip.applyQuaternion(parent.rotation).divide(parent.scale));
    }

    rig.root.position.set(out.root.x, out.root.y, out.root.z + b.overtake * 55);
    rig.root.updateMatrixWorld(true);
    if (approach === 'B') rig.mesh.skeleton.update();

    // Shader drivers.
    const wind = inp.wind ?? vTmp.set(0, 0, 0);
    if (groupRef.current) {
      mTmp.copy(groupRef.current.matrixWorld).invert();
    }
    const windLocal = wind.clone().transformDirection(mTmp).multiplyScalar(wind.length());
    const heat = Math.min(1, b.heat);

    flame.uniforms.uTime.value = time;
    flame.uniforms.uHeat.value = heat;
    flame.uniforms.uWarm.value = out.warm;
    flame.uniforms.uBreath.value = b.breath;
    flame.uniforms.uFlicker.value = 0.7 + heat * 0.6;
    flame.uniforms.uWind.value.copy(windLocal);
    flame.uniforms.uEarL.value = out.ears.L;
    flame.uniforms.uEarR.value = out.ears.R;

    if (particles) {
      const u = particles.material.uniforms;
      u.uTime.value = time;
      u.uHeat.value = heat;
      u.uWarm.value = out.warm;
      u.uBreath.value = b.breath;
      u.uEarL.value = out.ears.L;
      u.uEarR.value = out.ears.R;
      u.uWind.value.copy(windLocal);
      u.uVelocity.value.set(0, 0, inp.speed ?? 0);
      u.uScale.value = state.size.height * state.viewport.dpr * 0.5 * state.camera.projectionMatrix.elements[5];
      // Sleeping embers shrink to a breathing glow.
      u.uLife.value = b.mood === 'sleep' ? 0.55 : approach === 'A' ? 0.95 : 0.8;
      u.uOpacity.value = b.mood === 'sleep' ? 0.55 : 1;
    }

    eyeState.current.scale = typeof inp.eyeOverride === 'number' ? inp.eyeOverride : out.eyeScale;
    trailFade.current += (out.trailFade - trailFade.current) * (1 - Math.exp(-10 * dt));

    for (const request of out.sparks) {
      const at = request.at === 'nose' ? rig.bones.head.localToWorld(rig.noseLocal.clone()) : rig.root.localToWorld(LANDMARKS.bodyCentre.clone());
      sparksRef.current?.emit(at, request);
    }
  }, -1);

  const worldDrift = useRef(new Vector3());
  useFrame(() => {
    const speed = input.current.speed ?? 0;
    worldDrift.current.set(0, 0, -speed * FOX_SCALE * timeScaleRef.current);
    if (groupRef.current) worldDrift.current.applyQuaternion(groupRef.current.getWorldQuaternion(new Quaternion()));
  }, -1);

  return (
    <>
      <group ref={groupRef} position={position} rotation={rotation} scale={FOX_SCALE}>
        <primitive object={rig.root} />
      </group>
      {trail ? <Trail rig={rig} driftRef={worldDrift} fadeRef={trailFade} timeScaleRef={timeScaleRef} /> : null}
      {eyes ? <Eyes rig={rig} eyeState={eyeState} /> : null}
      <Sparks ref={sparksRef} driftRef={worldDrift} timeScaleRef={timeScaleRef} />
    </>
  );
});

useGLTF.preload(FOX_URL);

export default Fox;
