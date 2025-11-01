/**
 * LLM-friendly output formatter for Claude Code
 * Transforms comparison results into actionable patch suggestions
 */

import type { StyleDiff } from 'uimatch-core';
import type { CompareResult } from '../types/index.js';

/**
 * Target format for patch suggestions
 */
export type PatchTarget = 'tailwind' | 'css' | 'vanilla-extract';

/**
 * Confidence level for patch suggestions
 */
export type PatchConfidence = 'high' | 'medium' | 'low';

/**
 * Single style issue for LLM consumption
 */
export interface StyleIssue {
  prop: string;
  actual: string;
  expected: string;
  delta: number | string;
  unit: 'px' | 'ΔE' | 'categorical';
  severity: 'low' | 'medium' | 'high';
  suggest: {
    css?: string;
    tailwind?: string;
    vanillaExtract?: string;
  };
  confidence: PatchConfidence;
  note: string;
}

/**
 * Component diff grouped by selector
 */
export interface ComponentDiff {
  selector: string;
  issues: StyleIssue[];
}

/**
 * LLM-ready payload
 */
export interface LLMPayload {
  component: string;
  score: {
    SFS: number;
    DFS: number;
    high: number;
    medium: number;
    low: number;
  };
  rules: {
    target: PatchTarget;
    preferTokens: boolean;
  };
  diffs: ComponentDiff[];
}

/**
 * Convert px value to Tailwind class
 * Maps common spacing/size values to Tailwind utilities
 */
function pxToTailwind(property: string, px: number): string | undefined {
  const prop = property.toLowerCase();

  // Spacing utilities (padding, margin)
  if (prop.includes('padding') || prop.includes('margin')) {
    const spacingMap: Record<number, string> = {
      0: '0',
      1: '0.5', // 0.125rem
      2: '0.5',
      4: '1',
      6: '1.5',
      8: '2',
      10: '2.5',
      12: '3',
      14: '3.5',
      16: '4',
      20: '5',
      24: '6',
      28: '7',
      32: '8',
      36: '9',
      40: '10',
      44: '11',
      48: '12',
      56: '14',
      64: '16',
    };

    const closest = Object.keys(spacingMap)
      .map(Number)
      .reduce((prev, curr) => (Math.abs(curr - px) < Math.abs(prev - px) ? curr : prev));

    const classValue = spacingMap[closest];

    if (prop.includes('padding-inline') || prop === 'padding-left' || prop === 'padding-right') {
      return `px-${classValue}`;
    }
    if (prop.includes('padding-block') || prop === 'padding-top' || prop === 'padding-bottom') {
      return `py-${classValue}`;
    }
    if (prop === 'padding') {
      return `p-${classValue}`;
    }
    if (prop.includes('margin-inline') || prop === 'margin-left' || prop === 'margin-right') {
      return `mx-${classValue}`;
    }
    if (prop.includes('margin-block') || prop === 'margin-top' || prop === 'margin-bottom') {
      return `my-${classValue}`;
    }
    if (prop === 'margin') {
      return `m-${classValue}`;
    }
  }

  // Font size
  if (prop === 'font-size') {
    const sizeMap: Record<number, string> = {
      12: 'text-xs',
      14: 'text-sm',
      16: 'text-base',
      18: 'text-lg',
      20: 'text-xl',
      24: 'text-2xl',
      30: 'text-3xl',
      36: 'text-4xl',
    };
    return sizeMap[px];
  }

  // Line height (unitless or px)
  if (prop === 'line-height') {
    const lineHeightMap: Record<number, string> = {
      16: 'leading-none',
      20: 'leading-tight',
      24: 'leading-snug',
      28: 'leading-normal',
      32: 'leading-relaxed',
      36: 'leading-loose',
    };
    return lineHeightMap[px];
  }

  // Gap
  if (prop.includes('gap')) {
    const spacingMap: Record<number, string> = {
      0: '0',
      4: '1',
      8: '2',
      12: '3',
      16: '4',
      20: '5',
      24: '6',
      32: '8',
    };
    const closest = Object.keys(spacingMap)
      .map(Number)
      .reduce((prev, curr) => (Math.abs(curr - px) < Math.abs(prev - px) ? curr : prev));
    return `gap-${spacingMap[closest]}`;
  }

  // Border radius
  if (prop.includes('border-radius')) {
    const radiusMap: Record<number, string> = {
      0: 'rounded-none',
      2: 'rounded-sm',
      4: 'rounded',
      6: 'rounded-md',
      8: 'rounded-lg',
      12: 'rounded-xl',
      16: 'rounded-2xl',
      9999: 'rounded-full',
    };
    return radiusMap[px];
  }

  // Border width (including per-side)
  if (prop.includes('border-width') || /border-(top|right|bottom|left)-width/.test(prop)) {
    const side = prop.match(/border-(top|right|bottom|left)-width/)?.[1];
    const cls = (n: number) =>
      n === 0 ? '0' : n === 1 ? '' : n === 2 ? '2' : n === 4 ? '4' : n === 8 ? '8' : `[${n}px]`;

    if (side) {
      // Per-side border: border-t, border-r, border-b, border-l
      const v = cls(px);
      const sideAbbr = side[0]; // t/r/b/l
      return v === '0'
        ? `border-${sideAbbr}-0`
        : v === ''
          ? `border-${sideAbbr}`
          : `border-${sideAbbr}-${v}`;
    }

    // All-sides border
    if (px === 0) return 'border-0';
    if (px === 1) return 'border';
    if (px === 2) return 'border-2';
    if (px === 4) return 'border-4';
    if (px === 8) return 'border-8';
    return `border-[${px}px]`;
  }

  return undefined;
}

/**
 * Determine confidence level based on property metadata
 */
function determineConfidence(
  property: string,
  propData: StyleDiff['properties'][string],
  normalizedScore: number
): PatchConfidence {
  // High confidence: token-based colors or very small deviations
  if (propData.expectedToken) {
    return 'high';
  }

  if (normalizedScore < 0.2) {
    return 'high';
  }

  if (normalizedScore < 0.5) {
    return 'medium';
  }

  return 'low';
}

/**
 * Generate patch suggestions for a property
 */
function generateSuggestions(
  property: string,
  propData: StyleDiff['properties'][string],
  target: PatchTarget
): StyleIssue['suggest'] {
  const suggest: StyleIssue['suggest'] = {};

  // Guard against undefined expected value
  const expectedValue = propData.expected ?? '';

  // CSS suggestion (always available)
  suggest.css = `${property}: ${expectedValue};`;

  // Tailwind suggestion (if applicable)
  if (target === 'tailwind' || target === 'css') {
    // Pixel-based properties
    if (propData.unit === 'px' && expectedValue) {
      const px = parseFloat(expectedValue);
      if (!Number.isNaN(px)) {
        suggest.tailwind = pxToTailwind(property, px);
      }
    }

    // Color with token
    if (propData.expectedToken && property.includes('color')) {
      suggest.tailwind = `text-${propData.expectedToken.split('-').pop()}`;
    }

    // Categorical properties (layout)
    if (propData.unit === 'categorical') {
      if (property === 'display') {
        if (expectedValue === 'flex') suggest.tailwind = 'flex';
        else if (expectedValue === 'grid') suggest.tailwind = 'grid';
        else if (expectedValue === 'block') suggest.tailwind = 'block';
        else if (expectedValue === 'inline-block') suggest.tailwind = 'inline-block';
        else if (expectedValue === 'none') suggest.tailwind = 'hidden';
      } else if (property === 'flex-direction') {
        if (expectedValue === 'row') suggest.tailwind = 'flex-row';
        else if (expectedValue === 'column') suggest.tailwind = 'flex-col';
        else if (expectedValue === 'row-reverse') suggest.tailwind = 'flex-row-reverse';
        else if (expectedValue === 'column-reverse') suggest.tailwind = 'flex-col-reverse';
      } else if (property === 'align-items') {
        const mapAI: Record<string, string> = {
          center: 'items-center',
          'flex-start': 'items-start',
          start: 'items-start',
          'flex-end': 'items-end',
          end: 'items-end',
          baseline: 'items-baseline',
          stretch: 'items-stretch',
        };
        suggest.tailwind = mapAI[expectedValue];
      } else if (property === 'justify-content') {
        const mapJC: Record<string, string> = {
          center: 'justify-center',
          'flex-start': 'justify-start',
          start: 'justify-start',
          'flex-end': 'justify-end',
          end: 'justify-end',
          'space-between': 'justify-between',
          'space-around': 'justify-around',
          'space-evenly': 'justify-evenly',
        };
        suggest.tailwind = mapJC[expectedValue];
      } else if (property === 'background-color' && /^#fff(f{0,2})?$/i.test(expectedValue)) {
        suggest.tailwind = 'bg-white';
      }
    }
  }

  // Vanilla Extract suggestion (CSS-in-JS style)
  if (target === 'vanilla-extract') {
    const camelProp = property.replace(/-([a-z])/g, (g) => g[1]?.toUpperCase() ?? '');
    // For categorical properties, use unquoted values if valid identifiers
    if (
      propData.unit === 'categorical' &&
      ['display', 'flex-direction', 'align-items', 'justify-content'].includes(property)
    ) {
      suggest.vanillaExtract = `${camelProp}: '${expectedValue}'`;
    } else {
      suggest.vanillaExtract = `${camelProp}: '${expectedValue}'`;
    }
  }

  return suggest;
}

/**
 * Generate note/rationale for the diff
 */
function generateNote(
  property: string,
  propData: StyleDiff['properties'][string],
  tolerance?: number
): string {
  const parts: string[] = [];

  if (propData.unit === 'px' && tolerance !== undefined) {
    parts.push(`tol=±${tolerance.toFixed(1)}px`);
  } else if (propData.unit === 'ΔE' && tolerance !== undefined) {
    parts.push(`tol=±${tolerance.toFixed(1)}ΔE`);
  }

  if (propData.expectedToken) {
    parts.push(`token: ${propData.expectedToken}`);
  }

  return parts.join(', ');
}

/**
 * Guess component name from report context
 */
function guessComponentName(report: CompareResult['report']): string {
  // Try to extract from first selector
  if (report.styleDiffs.length > 0) {
    const firstSelector = report.styleDiffs[0]?.selector;
    if (firstSelector) {
      // Extract data-testid if available
      const match = firstSelector.match(/data-testid="([^"]+)"/);
      if (match && match[1]) {
        return match[1]
          .split('-')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join('');
      }

      // Extract class name
      const classMatch = firstSelector.match(/\.([a-zA-Z0-9_-]+)/);
      if (classMatch && classMatch[1]) {
        return classMatch[1]
          .split('-')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join('');
      }
    }
  }

  return 'Component';
}

/**
 * Format comparison result for LLM consumption
 */
export function formatForLLM(
  result: CompareResult,
  options: { target?: PatchTarget; preferTokens?: boolean } = {}
): LLMPayload {
  const { target = 'tailwind', preferTokens = true } = options;
  const { report } = result;

  const componentName = guessComponentName(report);

  const score = {
    SFS: report.styleSummary?.styleFidelityScore ?? 0,
    DFS: report.metrics.dfs,
    high: report.styleSummary?.highCount ?? 0,
    medium: report.styleSummary?.mediumCount ?? 0,
    low: report.styleSummary?.lowCount ?? 0,
  };

  const diffs: ComponentDiff[] = report.styleDiffs.map((diff) => {
    // Type guard for complete property data
    type CompletePropertyData = Required<StyleDiff['properties'][string]>;

    const issues: StyleIssue[] = Object.entries(diff.properties)
      .filter((entry): entry is [string, CompletePropertyData] => {
        const [, propData] = entry;
        // Filter out entries with missing required fields
        return (
          propData.actual !== undefined &&
          propData.expected !== undefined &&
          propData.delta !== undefined &&
          propData.unit !== undefined
        );
      })
      .map(([property, propData]) => {
        // propData is now guaranteed to have all required fields
        // Estimate normalized score (0-1) for confidence determination
        let normalizedScore = 0.5;
        if (propData.unit === 'px') {
          const expected = parseFloat(propData.expected) || 0;
          const delta = Math.abs(Number(propData.delta));
          normalizedScore = expected > 0 ? delta / (expected * 0.15) : 1; // 15% tolerance
        } else if (propData.unit === 'ΔE') {
          normalizedScore = Math.abs(Number(propData.delta)) / 3.0; // ΔE threshold
        }

        return {
          prop: property,
          actual: propData.actual,
          expected: propData.expected,
          delta: propData.delta,
          unit: propData.unit as StyleIssue['unit'],
          severity: diff.severity,
          suggest: generateSuggestions(property, propData, target),
          confidence: determineConfidence(property, propData, normalizedScore),
          note: generateNote(property, propData),
        };
      });

    return {
      selector: diff.selector,
      issues,
    };
  });

  return {
    component: componentName,
    score,
    rules: {
      target,
      preferTokens,
    },
    diffs,
  };
}

/**
 * Generate LLM prompt with payload
 */
export function generateLLMPrompt(payload: LLMPayload): string {
  const instruction = `Fix the following style differences in the ${payload.component} component.
Apply minimal changes using ${payload.rules.target} format.
${payload.rules.preferTokens ? 'Prefer design tokens (CSS variables) when available.' : ''}

Output format:
1. Summary of changes
2. Patch code (${payload.rules.target})
3. Risk assessment

Style differences:`;

  return `${instruction}\n\n${JSON.stringify(payload, null, 2)}`;
}
