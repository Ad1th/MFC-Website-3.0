import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AdditiveBlending, BufferGeometry, CameraHelper, Color, Float32BufferAttribute, LineBasicMaterial, LineSegments, PerspectiveCamera, SkeletonHelper, Vector3 } from 'three';
import { film } from '../store.js';
import { getScenes } from '../scroll.js';
import { createPose, sampleShot } from '../camera/shots.js';
import { getFox } from '../actors/foxShots.js';
import { PALETTE } from '../palette.js';

/**
 * The Director's Cut (press D). The film keeps scrolling, seen from behind the camera: every mesh
 * in wireframe, the active scene's camera path as a glowing line, the camera's field of view as a
 * moving pyramid and the fox's skeleton. The real shot plays in an inset in the corner; the HUD and
 * credits are DOM (dom/DirectorsCutHud.jsx). While mounted this takes over rendering (a positive
 * frame priority stops R3F's own render).
 */

const PATH_SAMPLES = 180;
const INSET = 0.28;
const MARGIN = 24;

const forward = new Vector3();
const right = new Vector3();
const up = new Vector3();
const lookTarget = new Vector3();

export default function DirectorsCut() {
  const { scene, camera, gl, size } = useThree();
  const director = useMemo(() => new PerspectiveCamera(50, 1, 0.05, 5000), []);
  const proxy = useMemo(() => new PerspectiveCamera(45, 1, 0.12, 3), []);
  const frustum = useMemo(() => {
    const helper = new CameraHelper(proxy);
    helper.setColors(new Color(PALETTE.ember), new Color(PALETTE.ember), new Color(PALETTE.fire), new Color(PALETTE.flameCore), new Color(PALETTE.fire));
    return helper;
  }, [proxy]);
  const path = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(PATH_SAMPLES * 6), 3));
    const line = new LineSegments(geometry, new LineBasicMaterial({ color: PALETTE.fire, transparent: true, blending: AdditiveBlending, depthWrite: false }));
    line.frustumCulled = false;
    return line;
  }, []);
  const state = useRef({ scene: null, aspect: 0, frame: 0, skeleton: null, wireframes: new Map() });

  useEffect(() => {
    scene.add(frustum, path);
    const local = state.current;
    return () => {
      scene.remove(frustum, path);
      frustum.dispose();
      path.geometry.dispose();
      path.material.dispose();
      if (local.skeleton) {
        scene.remove(local.skeleton);
        local.skeleton.dispose();
        local.skeleton = null;
      }
      local.wireframes.forEach((was, material) => {
        material.wireframe = was;
      });
      local.wireframes.clear();
    };
  }, [scene, frustum, path]);

  useFrame(() => {
    const s = state.current;
    s.frame += 1;
    const { activeScene } = film.getState();
    const sceneDef = getScenes()[activeScene];

    // Wireframe everything that can be, including meshes mounted after the toggle.
    if (s.frame % 30 === 1) {
      scene.traverse((object) => {
        if (!object.isMesh || object === path) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (!material || !('wireframe' in material) || s.wireframes.has(material)) continue;
          s.wireframes.set(material, material.wireframe);
          material.wireframe = true;
        }
      });
    }

    // The camera path of the scene that is playing, broken at hidden cuts.
    const aspect = size.width / size.height;
    if (sceneDef && (sceneDef.id !== s.scene || aspect !== s.aspect || s.frame % 90 === 1)) {
      s.scene = sceneDef.id;
      s.aspect = aspect;
      const positions = path.geometry.attributes.position.array;
      const a = createPose();
      const b = createPose();
      let count = 0;
      if (sampleShot(sceneDef.id, 0, a, aspect)) {
        for (let i = 1; i <= PATH_SAMPLES; i += 1) {
          sampleShot(sceneDef.id, i / PATH_SAMPLES, b, aspect);
          if (b.cut === a.cut) {
            positions.set([a.position.x, a.position.y, a.position.z, b.position.x, b.position.y, b.position.z], count * 6);
            count += 1;
          }
          a.position.copy(b.position);
          a.cut = b.cut;
        }
      }
      path.geometry.setDrawRange(0, count * 2);
      path.geometry.attributes.position.needsUpdate = true;
    }

    // The fox's skeleton, once the fox has loaded.
    const mesh = getFox()?.skinnedMesh;
    if (mesh && !s.skeleton) {
      s.skeleton = new SkeletonHelper(mesh);
      s.skeleton.material.color = new Color(PALETTE.flameCore);
      s.skeleton.material.depthTest = false;
      scene.add(s.skeleton);
    }

    // The shot's frustum, short enough to read as a pyramid.
    proxy.position.copy(camera.position);
    proxy.quaternion.copy(camera.quaternion);
    proxy.fov = camera.fov;
    proxy.aspect = aspect;
    proxy.updateProjectionMatrix();
    proxy.updateMatrixWorld();
    frustum.update();

    // The observer: behind, above and to the right of the film camera.
    camera.getWorldDirection(forward);
    right.crossVectors(forward, camera.up).normalize();
    up.crossVectors(right, forward).normalize();
    director.position.copy(camera.position).addScaledVector(forward, -5).addScaledVector(up, 2.2).addScaledVector(right, 3.2);
    director.up.copy(up);
    director.lookAt(lookTarget.copy(camera.position).addScaledVector(forward, 2));
    director.aspect = aspect;
    director.updateProjectionMatrix();

    const width = size.width;
    const height = size.height;
    gl.setScissorTest(false);
    gl.setViewport(0, 0, width, height);
    frustum.visible = true;
    path.visible = true;
    if (s.skeleton) s.skeleton.visible = true;
    gl.render(scene, director);

    // Inset: the real shot, without the overlays.
    const insetWidth = Math.round(width * INSET);
    const insetHeight = Math.round(insetWidth / aspect);
    const x = width - insetWidth - MARGIN;
    gl.setScissorTest(true);
    gl.setScissor(x, MARGIN, insetWidth, insetHeight);
    gl.setViewport(x, MARGIN, insetWidth, insetHeight);
    gl.clear();
    frustum.visible = false;
    path.visible = false;
    if (s.skeleton) s.skeleton.visible = false;
    gl.render(scene, camera);
    gl.setScissorTest(false);
    gl.setViewport(0, 0, width, height);
  }, 1);

  return null;
}
