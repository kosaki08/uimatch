const DEFAULT_SELECTOR_PLUGIN_TIMEOUT_MS = 30_000;
const DEFAULT_SELECTOR_PLUGIN = '@uimatch/selector-anchors';

export class SelectorPluginTimeoutError extends Error {
  override readonly name = 'SelectorPluginTimeoutError';
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
  if (!Number.isSafeInteger(timeoutMs)) {
    throw new RangeError('UIMATCH_SELECTOR_PLUGIN_TIMEOUT_MS must be a safe integer');
  }
  return timeoutMs;
}

export async function runSelectorPluginWithTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  pluginId: string
): Promise<T> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new RangeError('Selector plugin timeout must be a positive safe integer');
  }

  void operation.catch(() => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(
            new SelectorPluginTimeoutError(
              `Selector plugin "${pluginId}" timed out after ${timeoutMs}ms`
            )
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
