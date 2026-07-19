const DEFAULT_SELECTOR_PLUGIN_TIMEOUT_MS = 30_000;
const MAX_NODE_TIMER_DELAY_MS = 2_147_483_647;
const DEFAULT_SELECTOR_PLUGIN = '@uimatch/selector-anchors';

export class SelectorPluginTimeoutError extends Error {
  override readonly name = 'SelectorPluginTimeoutError';
}

function validateTimeoutMs(timeoutMs: number, label: string): number {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_NODE_TIMER_DELAY_MS) {
    throw new RangeError(`${label} must be an integer between 1 and ${MAX_NODE_TIMER_DELAY_MS}`);
  }
  return timeoutMs;
}

export function validateSelectorPluginTimeoutMs(timeoutMs: number): number {
  return validateTimeoutMs(timeoutMs, 'Selector plugin timeout');
}

function createSelectorPluginTimeoutError(
  pluginId: string,
  timeoutMs: number
): SelectorPluginTimeoutError {
  return new SelectorPluginTimeoutError(
    `Selector plugin "${pluginId}" timed out after ${timeoutMs}ms`
  );
}

export function resolveSelectorPluginId(
  explicitPluginId: string | undefined,
  environmentPluginId: string | undefined,
  hasAnchorsPath: boolean
): string | undefined {
  const configuredPluginId = explicitPluginId ?? environmentPluginId;
  if (configuredPluginId !== undefined) {
    const pluginId = configuredPluginId.trim();
    if (pluginId.length === 0) {
      throw new RangeError('Selector plugin ID must not be empty');
    }
    return pluginId;
  }
  return hasAnchorsPath ? DEFAULT_SELECTOR_PLUGIN : undefined;
}

export function getSelectorPluginTimeoutMs(
  value = process.env.UIMATCH_SELECTOR_PLUGIN_TIMEOUT_MS
): number {
  if (value === undefined) return DEFAULT_SELECTOR_PLUGIN_TIMEOUT_MS;
  if (!/^[1-9]\d*$/.test(value)) {
    throw new RangeError('UIMATCH_SELECTOR_PLUGIN_TIMEOUT_MS must be a positive integer');
  }

  const timeoutMs = Number(value);
  return validateTimeoutMs(timeoutMs, 'UIMATCH_SELECTOR_PLUGIN_TIMEOUT_MS');
}

export async function runSelectorPluginWithTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  pluginId: string,
  deadlineAt?: number
): Promise<T> {
  validateSelectorPluginTimeoutMs(timeoutMs);

  const expiresAt = deadlineAt ?? performance.now() + timeoutMs;
  if (!Number.isFinite(expiresAt)) {
    throw new RangeError('Selector plugin deadline must be finite');
  }
  const remainingMs = Math.min(timeoutMs, Math.ceil(expiresAt - performance.now()));
  if (remainingMs < 1) {
    throw createSelectorPluginTimeoutError(pluginId, timeoutMs);
  }

  const operationPromise = operation();
  void operationPromise.catch(() => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operationPromise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(createSelectorPluginTimeoutError(pluginId, timeoutMs));
        }, remainingMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
