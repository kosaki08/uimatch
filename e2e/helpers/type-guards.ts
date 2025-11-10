/**
 * Type guard utilities for safe type narrowing in E2E tests
 *
 * Provides runtime type validation to satisfy TypeScript's type-aware ESLint rules
 * without disabling safety checks.
 */

import type { SelectorsAnchors } from '@uimatch/selector-anchors';

/**
 * Type guard to validate SelectorsAnchors structure
 *
 * @param v - Unknown value to validate
 * @returns True if value conforms to SelectorsAnchors interface
 *
 * @example
 * ```ts
 * if (isSelectorsAnchors(data)) {
 *   // data is now typed as SelectorsAnchors
 *   console.log(data.version);
 * }
 * ```
 */
export function isSelectorsAnchors(v: unknown): v is SelectorsAnchors {
  return (
    !!v &&
    typeof v === 'object' &&
    'version' in v &&
    'anchors' in v &&
    Array.isArray((v as { anchors: unknown }).anchors)
  );
}
