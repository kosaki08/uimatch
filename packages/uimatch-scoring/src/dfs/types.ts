/**
 * Type definitions for Design Fidelity Score (DFS) calculation
 */

import type { CompareImageResult, StyleDiff } from '@uimatch/core';

export type { StyleDiff };

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
