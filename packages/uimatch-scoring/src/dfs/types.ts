/**
 * Type definitions for Design Fidelity Score (DFS) calculation
 */

import type { CompareImageResult } from 'uimatch-core';

/**
 * Weights for DFS calculation components
 */
export interface DFSWeights {
  pixel: number;
  color: number;
  spacing: number;
  radius: number;
  border: number;
  shadow: number;
  typography: number;
}

/**
 * Style diff from comparison result
 */
export interface StyleDiff {
  selector: string;
  properties: Record<
    string,
    {
      actual?: string;
      expected?: string;
      expectedToken?: string;
      delta?: number;
      unit?: string;
    }
  >;
  severity: 'low' | 'medium' | 'high';
  patchHints?: Array<{
    property: string;
    suggestedValue: string;
    severity: 'low' | 'medium' | 'high';
  }>;
}

/**
 * Input parameters for DFS calculation
 */
export interface DFSInput {
  result: CompareImageResult;
  styleDiffs: StyleDiff[];
  weights?: Partial<DFSWeights>;
}

/**
 * DFS calculation result
 */
export interface DFSResult {
  /** Design Fidelity Score (0-100) */
  score: number;
}
