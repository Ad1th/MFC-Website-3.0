import { BufferGeometry, Float32BufferAttribute, Matrix4, Quaternion, Vector3 } from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

/**
 * The Khronos fox rig: loading helpers, bone lookup, bind-pose frames and
 * surface sampling. Model space: +z forward (head), +y up, +x is the fox's left.
 * Model units are roughly centimetres; the scene scales the fox by FOX_SCALE.
 */

export const FOX_URL = '/models/fox.glb';
export const FOX_SCALE = 0.01;

export const BONE_NAMES = {
  hip: 'b_Hip_01',
  spine1: 'b_Spine01_02',
  spine2: 'b_Spine02_03',
  neck: 'b_Neck_04',
  head: 'b_Head_05',
  rArmUp: 'b_RightUpperArm_06',
  rArmFore: 'b_RightForeArm_07',
  rHand: 'b_RightHand_08',
  lArmUp: 'b_LeftUpperArm_09',
  lArmFore: 'b_LeftForeArm_010',
  lHand: 'b_LeftHand_011',
  tail1: 'b_Tail01_012',
  tail2: 'b_Tail02_013',
  tail3: 'b_Tail03_014',
  lLeg1: 'b_LeftLeg01_015',
  lLeg2: 'b_LeftLeg02_016',
  lFoot1: 'b_LeftFoot01_017',
  lFoot2: 'b_LeftFoot02_018',
  rLeg1: 'b_RightLeg01_019',
  rLeg2: 'b_RightLeg02_020',
  rFoot1: 'b_RightFoot01_021',
  rFoot2: 'b_RightFoot02_022',
};

/** Measured from the bind pose (see DECISIONS D-050). Model space. */
export const LANDMARKS = {
  earBaseLeft: new Vector3(8, 66, 46),
  earBaseRight: new Vector3(-8, 66, 46),
  eyeLeft: new Vector3(4.7, 61.2, 56.5),
  eyeRight: new Vector3(-4.7, 61.2, 56.5),
  nose: new Vector3(0, 55, 67),
  tailTip: new Vector3(0, 18, -88),
  bodyCentre: new Vector3(0, 42, -5),
};

const FOX_AXES = {
  yaw: new Vector3(0, 1, 0),
  pitch: new Vector3(1, 0, 0),
  roll: new Vector3(0, 0, 1),
};

const smoothstep = (e0, e1, x) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};

/** Deterministic PRNG so the particle layout is identical on every load. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The glTF has no normals. Average face normals over coincident positions. */
function computeSmoothNormals(geometry) {
  const pos = geometry.attributes.position;
  const sums = new Map();
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const ab = new Vector3();
  const ac = new Vector3();
  const key = (v) => `${Math.round(v.x * 10)},${Math.round(v.y * 10)},${Math.round(v.z * 10)}`;
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    const face = ab.cross(ac);
    for (const v of [a, b, c]) {
      const k = key(v);
      const sum = sums.get(k) ?? new Vector3();
      sum.add(face);
      sums.set(k, sum);
    }
  }
  const normals = new Float32Array(pos.count * 3);
  const v = new Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i);
    const n = sums.get(key(v)).clone().normalize();
    normals[i * 3] = n.x;
    normals[i * 3 + 1] = n.y;
    normals[i * 3 + 2] = n.z;
  }
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
}

function addEarMask(geometry, headIndex) {
  if (geometry.attributes.aEar) return;
  const pos = geometry.attributes.position;
  const si = geometry.attributes.skinIndex;
  const sw = geometry.attributes.skinWeight;
  const ear = new Float32Array(pos.count);
  for (let v = 0; v < pos.count; v += 1) {
    let w = 0;
    for (let k = 0; k < 4; k += 1) if (si.getComponent(v, k) === headIndex) w += sw.getComponent(v, k);
    if (w < 0.85) continue;
    const x = pos.getX(v);
    const y = pos.getY(v);
    const z = pos.getZ(v);
    const mask = smoothstep(65, 73, y) * smoothstep(2.5, 4.5, Math.abs(x)) * smoothstep(36, 40, z) * (1 - smoothstep(53, 57, z));
    ear[v] = Math.sign(x) * mask;
  }
  geometry.setAttribute('aEar', new Float32BufferAttribute(ear, 1));
}

/**
 * Clone the loaded glTF into an independent, animatable rig.
 * @param {{ scene: import('three').Object3D, animations: import('three').AnimationClip[] }} gltf
 */
export function createRig(gltf) {
  const root = cloneSkinned(gltf.scene);
  /** @type {import('three').SkinnedMesh|null} */
  let mesh = null;
  root.traverse((o) => {
    if (o.isSkinnedMesh) mesh = o;
  });
  if (!mesh) throw new Error('fox: no skinned mesh in model');
  mesh.frustumCulled = false;

  const bones = {};
  for (const [key, name] of Object.entries(BONE_NAMES)) {
    const bone = root.getObjectByName(name);
    if (!bone) throw new Error(`fox: bone ${name} missing`);
    bones[key] = bone;
  }

  const geometry = mesh.geometry;
  if (!geometry.attributes.normal) computeSmoothNormals(geometry);
  addEarMask(geometry, mesh.skeleton.bones.indexOf(bones.head));

  root.updateMatrixWorld(true);
  const rootInverse = new Matrix4().copy(root.matrixWorld).invert();
  const m = new Matrix4();
  const tp = new Vector3();
  const tq = new Quaternion();
  const ts = new Vector3();

  /** Fox-space yaw, pitch and roll axes expressed in each bone's local frame. */
  const localAxes = {};
  /** Inverse bind rotation of each bone's parent, for fox-space translations. */
  const parentInverse = {};
  /** Bind local rotation and position, so poses can be layered without drift. */
  const bind = {};
  for (const [key, bone] of Object.entries(bones)) {
    m.multiplyMatrices(rootInverse, bone.matrixWorld).decompose(tp, tq, ts);
    const inverse = tq.clone().invert();
    localAxes[key] = {
      yaw: FOX_AXES.yaw.clone().applyQuaternion(inverse).normalize(),
      pitch: FOX_AXES.pitch.clone().applyQuaternion(inverse).normalize(),
      roll: FOX_AXES.roll.clone().applyQuaternion(inverse).normalize(),
    };
    m.multiplyMatrices(rootInverse, bone.parent.matrixWorld).decompose(tp, tq, ts);
    parentInverse[key] = { rotation: tq.clone().invert(), scale: ts.clone() };
    bind[key] = { quaternion: bone.quaternion.clone(), position: bone.position.clone() };
  }

  /** Head-bone-local eye offsets, so eyes ride the head exactly. */
  const headBindInverse = new Matrix4().multiplyMatrices(rootInverse, bones.head.matrixWorld).invert();
  const eyesLocal = {
    left: LANDMARKS.eyeLeft.clone().applyMatrix4(headBindInverse),
    right: LANDMARKS.eyeRight.clone().applyMatrix4(headBindInverse),
  };
  const noseLocal = LANDMARKS.nose.clone().applyMatrix4(headBindInverse);
  const tailBindInverse = new Matrix4().multiplyMatrices(rootInverse, bones.tail3.matrixWorld).invert();
  const tailTipLocal = LANDMARKS.tailTip.clone().applyMatrix4(tailBindInverse);

  return { root, mesh, bones, localAxes, parentInverse, bind, eyesLocal, noseLocal, tailTipLocal, animations: gltf.animations };
}

/**
 * Read the fur texture into a luminance lookup for particle colouring.
 * @param {import('three').Texture|null} texture
 */
export function furLuminance(texture) {
  const image = texture?.image;
  if (!image || typeof document === 'undefined') return null;
  try {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    return (u, v) => {
      const x = Math.min(size - 1, Math.max(0, Math.floor(u * size)));
      const y = Math.min(size - 1, Math.max(0, Math.floor(v * size)));
      const i = (y * size + x) * 4;
      return (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
    };
  } catch {
    return null;
  }
}

/**
 * Area-weighted points on the bind-pose surface. Each point copies the skin
 * indices and weights of its nearest triangle vertex, so it skins on the GPU.
 * @param {import('three').SkinnedMesh} mesh
 * @param {number} count
 * @param {{ emberRatio?: number, seed?: number, luminance?: ((u: number, v: number) => number)|null }} [options]
 */
export function sampleSurface(mesh, count, { emberRatio = 1, seed = 7, luminance = null } = {}) {
  const src = mesh.geometry;
  const pos = src.attributes.position;
  const uv = src.attributes.uv;
  const si = src.attributes.skinIndex;
  const sw = src.attributes.skinWeight;
  const ear = src.attributes.aEar;
  const tris = pos.count / 3;
  const cdf = new Float32Array(tris);
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const ab = new Vector3();
  const ac = new Vector3();
  let total = 0;
  for (let t = 0; t < tris; t += 1) {
    a.fromBufferAttribute(pos, t * 3);
    b.fromBufferAttribute(pos, t * 3 + 1);
    c.fromBufferAttribute(pos, t * 3 + 2);
    total += ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() * 0.5;
    cdf[t] = total;
  }

  const rand = mulberry32(seed);
  const position = new Float32Array(count * 3);
  const skinIndex = new Float32Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  const aEar = new Float32Array(count);
  const aSeed = new Float32Array(count * 4);
  const aKind = new Float32Array(count);
  const aLum = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const r = rand() * total;
    let lo = 0;
    let hi = tris - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    const t = lo;
    let u = rand();
    let v = rand();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const w = 1 - u - v;
    a.fromBufferAttribute(pos, t * 3);
    b.fromBufferAttribute(pos, t * 3 + 1);
    c.fromBufferAttribute(pos, t * 3 + 2);
    position[i * 3] = a.x * w + b.x * u + c.x * v;
    position[i * 3 + 1] = a.y * w + b.y * u + c.y * v;
    position[i * 3 + 2] = a.z * w + b.z * u + c.z * v;

    const nearest = t * 3 + (w >= u && w >= v ? 0 : u >= v ? 1 : 2);
    for (let k = 0; k < 4; k += 1) {
      skinIndex[i * 4 + k] = si.getComponent(nearest, k);
      skinWeight[i * 4 + k] = sw.getComponent(nearest, k);
    }
    aEar[i] = ear ? ear.getX(nearest) : 0;
    aSeed[i * 4] = rand();
    aSeed[i * 4 + 1] = rand();
    aSeed[i * 4 + 2] = rand();
    aSeed[i * 4 + 3] = rand();
    aKind[i] = rand() < emberRatio ? 1 : 0;
    if (luminance && uv) {
      const tu = uv.getX(t * 3) * w + uv.getX(t * 3 + 1) * u + uv.getX(t * 3 + 2) * v;
      const tv = uv.getY(t * 3) * w + uv.getY(t * 3 + 1) * u + uv.getY(t * 3 + 2) * v;
      aLum[i] = luminance(tu, tv);
    } else {
      aLum[i] = 0.5;
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
  geometry.setAttribute('skinIndex', new Float32BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(skinWeight, 4));
  geometry.setAttribute('aEar', new Float32BufferAttribute(aEar, 1));
  geometry.setAttribute('aSeed', new Float32BufferAttribute(aSeed, 4));
  geometry.setAttribute('aKind', new Float32BufferAttribute(aKind, 1));
  geometry.setAttribute('aLum', new Float32BufferAttribute(aLum, 1));
  return geometry;
}
