/**
 * Error types for explicit error handling
 */

/**
 * Stable error codes. These are part of the published contract: they appear in
 * CLI output and are matched by programmatic callers, so they must not change
 * without an explicitly documented breaking release.
 */
export type UiMatchErrorCode =
  | 'UIMATCH_CONFIG_INVALID_FIGMA_REF'
  | 'UIMATCH_CONFIG_MISSING_FIGMA_TOKEN'
  | 'UIMATCH_SELECTOR_NOT_FOUND'
  | 'UIMATCH_IMAGE_SIZE_MISMATCH';

/**
 * `usage` means the invocation itself must change (arguments, configuration, or
 * environment). `comparison` means the run started and the comparison could not
 * be completed. The CLI maps `usage` to exit code 2 and everything else to 1.
 */
export type UiMatchErrorCategory = 'usage' | 'comparison';

const CATEGORY_BY_CODE: Record<UiMatchErrorCode, UiMatchErrorCategory> = {
  UIMATCH_CONFIG_INVALID_FIGMA_REF: 'usage',
  UIMATCH_CONFIG_MISSING_FIGMA_TOKEN: 'usage',
  UIMATCH_SELECTOR_NOT_FOUND: 'comparison',
  UIMATCH_IMAGE_SIZE_MISMATCH: 'comparison',
};

/**
 * Error carrying a stable code and the category that decides the CLI exit code.
 */
export class UiMatchError extends Error {
  override readonly name = 'UiMatchError';
  readonly code: UiMatchErrorCode;
  readonly category: UiMatchErrorCategory;

  constructor(code: UiMatchErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.category = CATEGORY_BY_CODE[code];
  }
}
