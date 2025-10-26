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

  // Handle "normal" -> 1.2 * fontSize
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
 * Parse CSS color to RGB
 * Supports: hex (#RGB, #RRGGBB, #RRGGBBAA), rgb(), rgba()
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
