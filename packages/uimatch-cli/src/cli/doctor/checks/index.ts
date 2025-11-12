/**
 * Export all check categories
 */

import type { DoctorCheck, DoctorCheckCategory } from '../types.js';
import { anchorsChecks } from './anchors.js';
import { envChecks } from './env.js';
import { playwrightChecks } from './playwright.js';

export const allChecks: Record<DoctorCheckCategory, DoctorCheck[]> = {
  env: envChecks,
  playwright: playwrightChecks,
  anchors: anchorsChecks,
  // Placeholder for other categories - to be implemented
  figma: [],
  config: [],
  cache: [],
  git: [],
  fs: [],
  external: [],
};

export function getSelectedChecks(
  categories?: DoctorCheckCategory[]
): { category: DoctorCheckCategory; checks: DoctorCheck[] }[] {
  if (!categories || categories.length === 0) {
    // Default: env + playwright only for quick check
    return [
      { category: 'env', checks: allChecks.env },
      { category: 'playwright', checks: allChecks.playwright },
    ];
  }

  return categories
    .map((cat) => ({
      category: cat,
      checks: allChecks[cat] || [],
    }))
    .filter((item) => item.checks.length > 0);
}
