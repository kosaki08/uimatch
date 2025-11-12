/**
 * Safe error message extractor to satisfy TypeScript no-unsafe-* rules
 */
export const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

/**
 * Safe error stack extractor
 */
export const errorStack = (e: unknown): string | undefined =>
  e instanceof Error ? e.stack : undefined;

/**
 * Check if value is a non-null object
 */
export const isObject = (val: unknown): val is Record<string, unknown> =>
  typeof val === 'object' && val !== null;

/**
 * Safe property access with type guard
 */
export const getStringProp = (
  obj: unknown,
  key: string,
): string | undefined => {
  if (!isObject(obj)) return undefined;
  const val = obj[key];
  return typeof val === 'string' ? val : undefined;
};
