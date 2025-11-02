/**
 * Utilities for normalizing CSS values
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export interface BoxShadowParsed {
  blur: number;
  rgb?: RGB;
}

/**
 * Convert CSS length value to pixels
 * @param value CSS length value (e.g., "16px", "1rem", "1.5em")
 * @param baseFontSize Base font size in pixels (for em/rem conversion)
 * @returns Value in pixels, or undefined if parsing fails
 */
export function toPx(value?: string, baseFontSize = 16): number | undefined {
  if (!value || value === 'auto' || value === 'none') return undefined;

  const trimmed = value.trim();
  if (trimmed === '0') return 0;

  const match = trimmed.match(/^(-?[\d.]+)(px|rem|em)?$/);
  if (!match || !match[1]) return undefined;

  const num = parseFloat(match[1]);
  const unit = match[2] || 'px';

  switch (unit) {
    case 'px':
      return num;
    case 'rem':
      return num * baseFontSize;
    case 'em':
      return num * baseFontSize;
    default:
      return undefined;
  }
}

/**
 * Normalize line-height to pixels
 * @param value line-height value (e.g., "normal", "1.5", "24px")
 * @param fontSize Font size in pixels
 * @returns line-height in pixels, or undefined if parsing fails
 */
export function normLineHeight(value?: string, fontSize = 16): number | undefined {
  if (!value) return undefined;

  const trimmed = value.trim();

  // Handle "normal" → 1.2 * fontSize
  if (trimmed === 'normal') return 1.2 * fontSize;

  // Handle unitless (e.g., "1.5")
  const unitless = parseFloat(trimmed);
  if (!isNaN(unitless) && /^[\d.]+$/.test(trimmed)) {
    return unitless * fontSize;
  }

  // Handle explicit units (e.g., "24px")
  return toPx(trimmed, fontSize);
}

/**
 * Convert HSL to RGB
 * @param h Hue (0-360)
 * @param s Saturation (0-100)
 * @param l Lightness (0-100)
 * @returns RGB object
 */
function hslToRgb(h: number, s: number, l: number): RGB {
  // Normalize values
  h = h % 360;
  if (h < 0) h += 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0,
    g = 0,
    b = 0;

  if (h >= 0 && h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h >= 60 && h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h >= 180 && h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h >= 240 && h < 300) {
    r = x;
    g = 0;
    b = c;
  } else if (h >= 300 && h < 360) {
    r = c;
    g = 0;
    b = x;
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

/**
 * Parse CSS color to RGB
 * Supports: hex (#RGB, #RRGGBB, #RRGGBBAA), rgb(), rgba(), hsl(), hsla()
 * @param color CSS color value
 * @returns RGB object, or undefined if parsing fails
 */
export function parseCssColorToRgb(color?: string): RGB | undefined {
  if (!color) return undefined;

  const trimmed = color.trim();

  // Hex color (#RGB, #RRGGBB, #RRGGBBAA)
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    let r: number, g: number, b: number, a: number | undefined;

    if (hex.length === 3) {
      // #RGB
      const c0 = hex.charAt(0);
      const c1 = hex.charAt(1);
      const c2 = hex.charAt(2);
      if (!c0 || !c1 || !c2) return undefined;
      r = parseInt(c0 + c0, 16);
      g = parseInt(c1 + c1, 16);
      b = parseInt(c2 + c2, 16);
    } else if (hex.length === 6) {
      // #RRGGBB
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else if (hex.length === 8) {
      // #RRGGBBAA
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
      a = parseInt(hex.slice(6, 8), 16) / 255;
    } else {
      return undefined;
    }

    if (isNaN(r) || isNaN(g) || isNaN(b)) return undefined;
    return a !== undefined ? { r, g, b, a } : { r, g, b };
  }

  // rgb() or rgba()
  const rgbMatch = trimmed.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/
  );
  if (rgbMatch && rgbMatch[1] && rgbMatch[2] && rgbMatch[3]) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    const a = rgbMatch[4] ? parseFloat(rgbMatch[4]) : undefined;

    if (isNaN(r) || isNaN(g) || isNaN(b)) return undefined;
    if (a !== undefined && isNaN(a)) return undefined;

    return a !== undefined ? { r, g, b, a } : { r, g, b };
  }

  // hsl() or hsla()
  const hslMatch = trimmed.match(
    /^hsla?\(\s*([\d.]+)(?:deg)?\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)$/
  );
  if (hslMatch && hslMatch[1] && hslMatch[2] && hslMatch[3]) {
    const h = parseFloat(hslMatch[1]);
    const s = parseFloat(hslMatch[2]);
    const l = parseFloat(hslMatch[3]);
    const a = hslMatch[4] ? parseFloat(hslMatch[4]) : undefined;

    if (isNaN(h) || isNaN(s) || isNaN(l)) return undefined;
    if (a !== undefined && isNaN(a)) return undefined;

    const rgb = hslToRgb(h, s, l);
    return a !== undefined ? { ...rgb, a } : rgb;
  }

  return undefined;
}

/**
 * Parse box-shadow to extract blur and color
 * MVP: Only parse the first shadow, only extract blur and color
 * @param shadow box-shadow value
 * @returns Parsed shadow with blur and color, or undefined if parsing fails
 */
export function parseBoxShadow(shadow?: string): BoxShadowParsed | undefined {
  if (!shadow || shadow === 'none') return undefined;

  const trimmed = shadow.trim();

  // Simple regex to extract blur and color from first shadow (supports inset)
  // Format: [inset] <offset-x> <offset-y> <blur-radius> <spread-radius>? <color>
  // We only care about blur-radius and color for MVP
  const match = trimmed.match(
    /^(?:inset\s+)?([+-]?\d+(?:\.\d+)?px)\s+([+-]?\d+(?:\.\d+)?px)\s+(\d+(?:\.\d+)?px)(?:\s+([+-]?\d+(?:\.\d+)?px))?\s+(.+)$/
  );

  if (!match) {
    // Try without spread radius
    const matchNoSpread = trimmed.match(
      /^(?:inset\s+)?([+-]?\d+(?:\.\d+)?px)\s+([+-]?\d+(?:\.\d+)?px)\s+(\d+(?:\.\d+)?px)\s+(.+)$/
    );
    if (!matchNoSpread) return undefined;

    const blur = toPx(matchNoSpread[3]) ?? 0;
    const rgb = parseCssColorToRgb(matchNoSpread[4]);
    return { blur, rgb };
  }

  const blur = toPx(match[3]) ?? 0;
  const rgb = parseCssColorToRgb(match[5]);
  return { blur, rgb };
}

/**
 * Normalize text for i18n resilience
 * - NFKC normalization for unicode compatibility
 * - Trim leading/trailing whitespace
 * - Compress consecutive whitespace to single space
 * @param text Text to normalize
 * @returns Normalized text
 */
export function normalizeText(text: string): string {
  return text
    .normalize('NFKC') // Unicode normalization (e.g., half-width → full-width)
    .trim() // Remove leading/trailing whitespace
    .replace(/\s+/g, ' '); // Compress consecutive whitespace
}

/**
 * Options for text normalization
 */
export interface TextNormalizeOptions {
  /** Apply NFKC unicode normalization (default: true) */
  nfkc?: boolean;
  /** Trim leading/trailing whitespace (default: true) */
  trim?: boolean;
  /** Collapse consecutive whitespace to single space (default: true) */
  collapseWhitespace?: boolean;
  /** Case-sensitive comparison (default: true, false = case-insensitive) */
  caseSensitive?: boolean;
}

/**
 * Extended text normalization with options
 * @param text Text to normalize
 * @param opts Normalization options
 * @returns Normalized text
 */
export function normalizeTextEx(text: string, opts: TextNormalizeOptions = {}): string {
  let s = String(text ?? '');
  if (opts.nfkc !== false) s = s.normalize('NFKC');
  if (opts.trim !== false) s = s.trim();
  if (opts.collapseWhitespace !== false) s = s.replace(/\s+/g, ' ');
  if (opts.caseSensitive === false) s = s.toLowerCase();
  return s;
}

/**
 * Lightweight text similarity score (0..1)
 * Uses hybrid approach: 80% token overlap + 20% character position match
 * @param a First text
 * @param b Second text
 * @returns Similarity score from 0 (completely different) to 1 (identical)
 */
export function textSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const norm = (t: string) => t.replace(/\s+/g, ' ').trim();
  const A = norm(a);
  const B = norm(b);
  if (!A && !B) return 1;
  if (!A || !B) return 0;

  // Character position match (prefix match count / max length)
  const maxLen = Math.max(A.length, B.length);
  const posMatches = (() => {
    const m = Math.min(A.length, B.length);
    let c = 0;
    for (let i = 0; i < m; i++) if (A[i] === B[i]) c++;
    return c / maxLen;
  })();

  // Token overlap (multiset minimum / max count)
  const toTokens = (t: string) =>
    t
      .toLowerCase()
      .split(/[\s,.;:(){}[\]<>"'、。？！・]+/)
      .filter(Boolean);
  const ta = toTokens(A);
  const tb = toTokens(B);
  const ca = new Map<string, number>();
  const cb = new Map<string, number>();
  for (const t of ta) ca.set(t, (ca.get(t) || 0) + 1);
  for (const t of tb) cb.set(t, (cb.get(t) || 0) + 1);
  let inter = 0;
  const denom = Math.max(ta.length, tb.length, 1);
  for (const [t, na] of ca) inter += Math.min(na, cb.get(t) || 0);
  const tokenScore = inter / denom;

  return tokenScore * 0.8 + posMatches * 0.2;
}
