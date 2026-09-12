/**
 * Held poses layered over the Survey clip, in fox-space degrees per bone:
 *   yaw   around +y (positive turns toward the fox's left, +x)
 *   pitch around +x (positive tips forward-pointing bones down)
 *   roll  around +z (the long axis)
 * hip is a fox-space translation in model units (about centimetres).
 * Tuned in ?sandbox=fox; see DECISIONS D-051.
 */

export const POSES = {
  sit: {
    hip: [0, -12, -2],
    bones: {
      hip: [0, -34, 0],
      spine1: [0, 12, 0],
      spine2: [0, 6, 0],
      neck: [0, 8, 0],
      head: [0, 12, 0],
      lArmUp: [0, 30, 0],
      rArmUp: [0, 30, 0],
      lArmFore: [0, -4, 0],
      rArmFore: [0, -4, 0],
      lLeg1: [0, -48, 0],
      rLeg1: [0, -48, 0],
      lLeg2: [0, 70, 0],
      rLeg2: [0, 70, 0],
      lFoot1: [0, -24, 0],
      rFoot1: [0, -24, 0],
      tail1: [-18, 30, 0],
      tail2: [-16, 10, 0],
      tail3: [-12, 0, 0],
    },
  },
  lie: {
    hip: [0, -28, 0],
    bones: {
      hip: [0, -4, 0],
      spine1: [0, 4, 0],
      neck: [0, 10, 0],
      head: [0, 8, 0],
      lArmUp: [0, -62, 0],
      rArmUp: [0, -62, 0],
      lArmFore: [0, 30, 0],
      rArmFore: [0, 30, 0],
      lHand: [0, 20, 0],
      rHand: [0, 20, 0],
      lLeg1: [0, -72, 0],
      rLeg1: [0, -72, 0],
      lLeg2: [0, 110, 0],
      rLeg2: [0, 110, 0],
      lFoot1: [0, -40, 0],
      rFoot1: [0, -40, 0],
      tail1: [-20, 34, 0],
      tail2: [-14, 12, 0],
    },
  },
  /**
   * S01 logo pose, held over the Run clip: the Firefox mark's silhouette. Spine arched so
   * the body curves around the planet, head reaching forward and down, forelegs stretched
   * ahead, hind legs trailing, tail swept up and forward over the back.
   */
  curl: {
    hip: [0, 4, 0],
    bones: {
      hip: [0, 10, 0],
      spine1: [0, -14, 0],
      spine2: [0, -16, 0],
      neck: [0, 18, 0],
      head: [0, 22, 0],
      lArmUp: [0, -40, 0],
      rArmUp: [0, -34, 0],
      lArmFore: [0, -10, 0],
      rArmFore: [0, -12, 0],
      lLeg1: [0, 38, 0],
      rLeg1: [0, 44, 0],
      lLeg2: [0, -20, 0],
      rLeg2: [0, -24, 0],
      tail1: [0, -48, 0],
      tail2: [0, -38, 0],
      tail3: [0, -30, 0],
    },
  },
  /** Added on top of lie: head down and turned toward the flank, tail swept round to the nose. */
  sleep: {
    hip: [0, -6, 0],
    bones: {
      spine1: [10, 4, 0],
      spine2: [14, 4, 0],
      neck: [28, 26, 0],
      head: [30, 22, -10],
      lArmUp: [0, -12, 0],
      rArmUp: [0, -12, 0],
      tail1: [-36, 10, 0],
      tail2: [-40, 4, 0],
      tail3: [-38, 0, 0],
    },
  },
};
