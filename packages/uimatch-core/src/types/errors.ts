/**
 * Error types for explicit error handling
 */

/**
 * Base error interface with error code
 */
export interface BaseError {
  code: string;
  message: string;
}

/**
 * Capture-related errors
 */
export interface CaptureError extends BaseError {
  code:
    | 'CAPTURE_MISSING_INPUT'
    | 'CAPTURE_ELEMENT_NOT_FOUND'
    | 'CAPTURE_TIMEOUT'
    | 'CAPTURE_FAILED';
  selector?: string;
  url?: string;
}

/**
 * Comparison-related errors
 */
export interface ComparisonError extends BaseError {
  code: 'COMPARISON_DIMENSION_MISMATCH' | 'COMPARISON_INVALID_IMAGE' | 'COMPARISON_FAILED';
  details?: string;
}

/**
 * Configuration-related errors
 */
export interface ConfigError extends BaseError {
  code: 'CONFIG_VALIDATION_FAILED' | 'CONFIG_INVALID_VALUE';
  field?: string;
  details?: string;
}

/**
 * All possible error types
 */
export type AppError = CaptureError | ComparisonError | ConfigError;

/**
 * Create a capture error
 */
export function createCaptureError(
  code: CaptureError['code'],
  message: string,
  options?: { selector?: string; url?: string }
): CaptureError {
  return {
    code,
    message,
    selector: options?.selector,
    url: options?.url,
  };
}

/**
 * Create a comparison error
 */
export function createComparisonError(
  code: ComparisonError['code'],
  message: string,
  details?: string
): ComparisonError {
  return {
    code,
    message,
    details,
  };
}

/**
 * Create a config error
 */
export function createConfigError(
  code: ConfigError['code'],
  message: string,
  options?: { field?: string; details?: string }
): ConfigError {
  return {
    code,
    message,
    field: options?.field,
    details: options?.details,
  };
}
