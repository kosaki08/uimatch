/**
 * Color space conversion and perceptual difference calculation
 */

import type { RGB } from './normalize';

export interface Lab {
  L: number;
  a: number;
  b: number;
}

/**
 * Convert RGB to XYZ color space
 * @param rgb RGB color (0-255 range)
 * @returns XYZ color
 */
function rgbToXyz(rgb: RGB): { x: number; y: number; z: number } {
  // Normalize to 0-1 range
  let r = rgb.r / 255;
  let g = rgb.g / 255;
  let b = rgb.b / 255;

  // Apply sRGB gamma correction
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

  // Convert to XYZ using D65 illuminant
  const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;

  return { x, y, z };
}

/**
 * Convert XYZ to Lab color space
 * @param xyz XYZ color
 * @returns Lab color
 */
function xyzToLab(xyz: { x: number; y: number; z: number }): Lab {
  // D65 reference white point
  const xn = 0.95047;
  const yn = 1.0;
  const zn = 1.08883;

  const fx = (t: number) => (t > 0.008856 ? Math.pow(t, 1 / 3) : 7.787 * t + 16 / 116);

  const xr = fx(xyz.x / xn);
  const yr = fx(xyz.y / yn);
  const zr = fx(xyz.z / zn);

  const L = 116 * yr - 16;
  const a = 500 * (xr - yr);
  const b = 200 * (yr - zr);

  return { L, a, b };
}

/**
 * Convert RGB to Lab color space
 * @param rgb RGB color (0-255 range)
 * @returns Lab color
 */
export function rgbToLab(rgb: RGB): Lab {
  const xyz = rgbToXyz(rgb);
  return xyzToLab(xyz);
}

/**
 * Calculate CIEDE2000 color difference
 * @param rgb1 First RGB color
 * @param rgb2 Second RGB color
 * @returns Delta E 2000 value (perceptual color difference)
 */
export function deltaE2000(rgb1: RGB, rgb2: RGB): number {
  const lab1 = rgbToLab(rgb1);
  const lab2 = rgbToLab(rgb2);

  // Calculate CIEDE2000
  const kL = 1.0;
  const kC = 1.0;
  const kH = 1.0;

  const L1 = lab1.L;
  const a1 = lab1.a;
  const b1 = lab1.b;
  const L2 = lab2.L;
  const a2 = lab2.a;
  const b2 = lab2.b;

  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const Cbar = (C1 + C2) / 2;

  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cbar, 7) / (Math.pow(Cbar, 7) + Math.pow(25, 7))));

  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);

  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);

  const h1p = Math.atan2(b1, a1p) * (180 / Math.PI);
  const h2p = Math.atan2(b2, a2p) * (180 / Math.PI);

  const H1p = h1p >= 0 ? h1p : h1p + 360;
  const H2p = h2p >= 0 ? h2p : h2p + 360;

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp: number;
  if (C1p * C2p === 0) {
    dhp = 0;
  } else if (Math.abs(H2p - H1p) <= 180) {
    dhp = H2p - H1p;
  } else if (H2p - H1p > 180) {
    dhp = H2p - H1p - 360;
  } else {
    dhp = H2p - H1p + 360;
  }

  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * Math.PI) / 180 / 2);

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;

  let Hbarp: number;
  if (C1p * C2p === 0) {
    Hbarp = H1p + H2p;
  } else if (Math.abs(H1p - H2p) <= 180) {
    Hbarp = (H1p + H2p) / 2;
  } else if (H1p + H2p < 360) {
    Hbarp = (H1p + H2p + 360) / 2;
  } else {
    Hbarp = (H1p + H2p - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos(((Hbarp - 30) * Math.PI) / 180) +
    0.24 * Math.cos((2 * Hbarp * Math.PI) / 180) +
    0.32 * Math.cos(((3 * Hbarp + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * Hbarp - 63) * Math.PI) / 180);

  const dTheta = 30 * Math.exp(-Math.pow((Hbarp - 275) / 25, 2));

  const RC = 2 * Math.sqrt(Math.pow(Cbarp, 7) / (Math.pow(Cbarp, 7) + Math.pow(25, 7)));

  const SL = 1 + (0.015 * Math.pow(Lbarp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbarp - 50, 2));
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;

  const RT = -Math.sin((2 * dTheta * Math.PI) / 180) * RC;

  const dE =
    Math.sqrt(
      Math.pow(dLp / (kL * SL), 2) +
        Math.pow(dCp / (kC * SC), 2) +
        Math.pow(dHp / (kH * SH), 2) +
        RT * (dCp / (kC * SC)) * (dHp / (kH * SH))
    ) || 0;

  return dE;
}
