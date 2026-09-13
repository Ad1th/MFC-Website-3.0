import { Vector3 } from 'three';

/**
 * Live world positions on the primary globe. The globe spins, so scenes that fly to a
 * place on it (S03 diving to Vellore) read these every frame instead of assuming a fixed spot.
 * Written by the Globe marked `primary`.
 */
export const velloreWorld = new Vector3();
