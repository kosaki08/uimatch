import type { ModelTurnUsage } from '../types.js';

const openRouterEndpoint = 'https://openrouter.ai/api/v1/chat/completions';
const modelRequestTimeoutMs = 120_000;
const maximumRequestAttempts = 3;
const maximumRetryDelayMs = 120_000;
const transientHttpStatuses = new Set([429, 502, 503, 504, 529]);

type FetchFunction = (input: string, init: RequestInit) => Promise<Response>;
type SleepFunction = (milliseconds: number) => Promise<void>;

export interface ModelMessage {
  content:
    | string
    | Array<{ text: string; type: 'text' } | { image_url: { url: string }; type: 'image_url' }>;
  role: 'assistant' | 'system' | 'user';
}

export interface ModelTurn {
  content: string;
  finishReason: string;
  requestAttempts: number;
  retryDelaysMs: number[];
  usage: ModelTurnUsage;
}

export class OpenRouterCallError extends Error {
  readonly attempts: number;
  readonly retryDelaysMs: number[];

  constructor(message: string, attempts: number, retryDelaysMs: number[], cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'OpenRouterCallError';
    this.attempts = attempts;
    this.retryDelaysMs = retryDelaysMs;
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function asText(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be a string`);
  }
  return value;
}

function asNonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative finite number`);
  }
  return value;
}

function asNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return value as number;
}

function optionalNonNegativeInteger(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  return asNonNegativeInteger(value, label);
}

function readRoutingMetadata(value: unknown): {
  fallbackUsed?: boolean;
  provider?: string;
} {
  if (value === undefined) return {};
  const metadata = asRecord(value, 'OpenRouter response openrouter_metadata');
  const attempt = optionalNonNegativeInteger(
    metadata.attempt,
    'OpenRouter response openrouter_metadata.attempt'
  );
  const endpoints = metadata.endpoints;
  let provider: string | undefined;
  if (endpoints !== undefined) {
    const endpointRecord = asRecord(endpoints, 'OpenRouter response openrouter_metadata.endpoints');
    if (!Array.isArray(endpointRecord.available)) {
      throw new TypeError(
        'OpenRouter response openrouter_metadata.endpoints.available must be an array'
      );
    }
    for (const [index, candidate] of endpointRecord.available.entries()) {
      const candidateRecord = asRecord(
        candidate,
        `OpenRouter response openrouter_metadata.endpoints.available[${index}]`
      );
      if (candidateRecord.selected === true) {
        provider = asString(
          candidateRecord.provider,
          `OpenRouter response openrouter_metadata.endpoints.available[${index}].provider`
        );
        break;
      }
    }
  }
  return {
    ...(attempt !== undefined ? { fallbackUsed: attempt > 1 } : {}),
    ...(provider ? { provider } : {}),
  };
}

function defaultRetryDelayMs(attempt: number): number {
  return 1_000 * 2 ** (attempt - 1);
}

function parseRetryAfterMs(value: string | null, nowMs: number): number | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (!Number.isSafeInteger(seconds)) return maximumRetryDelayMs + 1;
    const milliseconds = seconds * 1_000;
    return Number.isSafeInteger(milliseconds) ? milliseconds : maximumRetryDelayMs + 1;
  }
  const timestamp = Date.parse(trimmed);
  if (!Number.isFinite(timestamp)) return undefined;
  return Math.max(0, timestamp - nowMs);
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function discardResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Cleanup must not replace the request failure that drives retry or reporting.
  }
}

async function requestWithRetry(
  input: string,
  createInit: () => RequestInit,
  dependencies: {
    fetch: FetchFunction;
    now: () => number;
    sleep: SleepFunction;
  }
): Promise<{ attempts: number; response: Response; retryDelaysMs: number[] }> {
  const retryDelaysMs: number[] = [];
  for (let attempt = 1; attempt <= maximumRequestAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await dependencies.fetch(input, createInit());
    } catch (error) {
      if (attempt === maximumRequestAttempts) {
        throw new OpenRouterCallError(
          `OpenRouter request failed after ${attempt} attempts: ${error instanceof Error ? error.message : String(error)}`,
          attempt,
          retryDelaysMs,
          error
        );
      }
      const delayMs = defaultRetryDelayMs(attempt);
      retryDelaysMs.push(delayMs);
      await dependencies.sleep(delayMs);
      continue;
    }

    if (response.ok) {
      return { attempts: attempt, response, retryDelaysMs };
    }
    const retryAfter = response.headers.get('Retry-After');
    if (!transientHttpStatuses.has(response.status) || attempt === maximumRequestAttempts) {
      await discardResponseBody(response);
      throw new OpenRouterCallError(
        `OpenRouter request failed with HTTP ${response.status}${retryAfter ? ` (Retry-After: ${retryAfter})` : ''}`,
        attempt,
        retryDelaysMs
      );
    }
    const delayMs =
      parseRetryAfterMs(retryAfter, dependencies.now()) ?? defaultRetryDelayMs(attempt);
    if (delayMs > maximumRetryDelayMs) {
      await discardResponseBody(response);
      throw new OpenRouterCallError(
        `OpenRouter requested a retry delay of ${delayMs}ms, exceeding the ${maximumRetryDelayMs}ms harness limit`,
        attempt,
        retryDelaysMs
      );
    }
    await discardResponseBody(response);
    retryDelaysMs.push(delayMs);
    await dependencies.sleep(delayMs);
  }
  throw new Error('OpenRouter retry loop exhausted unexpectedly');
}

export async function requestOpenRouterTurn(options: {
  apiKey: string;
  messages: ModelMessage[];
  model: string;
}): Promise<ModelTurn> {
  const request = await requestWithRetry(
    openRouterEndpoint,
    () => ({
      body: JSON.stringify({
        max_tokens: 800,
        messages: options.messages,
        model: options.model,
        provider: { data_collection: 'deny' },
        stream: false,
        temperature: 0,
      }),
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
        'X-OpenRouter-Metadata': 'enabled',
      },
      method: 'POST',
      signal: AbortSignal.timeout(modelRequestTimeoutMs),
    }),
    {
      fetch: (input, init) => fetch(input, init),
      now: Date.now,
      sleep,
    }
  );

  try {
    const body: unknown = await request.response.json();
    const record = asRecord(body, 'OpenRouter response');
    const choices = record.choices;
    if (!Array.isArray(choices) || choices.length === 0) {
      throw new TypeError('OpenRouter response choices must be a non-empty array');
    }
    const choice = asRecord(choices[0], 'OpenRouter response choices[0]');
    const message = asRecord(choice.message, 'OpenRouter response choices[0].message');
    const usage = asRecord(record.usage, 'OpenRouter response usage');
    const completionDetails =
      usage.completion_tokens_details === undefined
        ? undefined
        : asRecord(usage.completion_tokens_details, 'OpenRouter response completion token details');
    const routing = readRoutingMetadata(record.openrouter_metadata);
    const costUsd = asNonNegativeNumber(usage.cost, 'OpenRouter response usage.cost');
    const completionTokens = asNonNegativeInteger(
      usage.completion_tokens,
      'OpenRouter response usage.completion_tokens'
    );
    const promptTokens = asNonNegativeInteger(
      usage.prompt_tokens,
      'OpenRouter response usage.prompt_tokens'
    );
    const totalTokens = asNonNegativeInteger(
      usage.total_tokens,
      'OpenRouter response usage.total_tokens'
    );
    const reasoningTokens = completionDetails
      ? optionalNonNegativeInteger(
          completionDetails.reasoning_tokens,
          'OpenRouter response usage.completion_tokens_details.reasoning_tokens'
        )
      : undefined;
    if (promptTokens + completionTokens !== totalTokens) {
      throw new TypeError('OpenRouter response token totals are inconsistent');
    }

    return {
      content: asText(message.content, 'OpenRouter response message.content'),
      finishReason: asString(choice.finish_reason, 'OpenRouter response choices[0].finish_reason'),
      requestAttempts: request.attempts,
      retryDelaysMs: request.retryDelaysMs,
      usage: {
        completionTokens,
        costUsd,
        generationId: asString(record.id, 'OpenRouter response id'),
        promptTokens,
        ...(routing.fallbackUsed !== undefined ? { fallbackUsed: routing.fallbackUsed } : {}),
        ...(routing.provider ? { provider: routing.provider } : {}),
        ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
        responseModel: asString(record.model, 'OpenRouter response model'),
        totalTokens,
      },
    };
  } catch (error) {
    throw new OpenRouterCallError(
      `OpenRouter response validation failed: ${error instanceof Error ? error.message : String(error)}`,
      request.attempts,
      request.retryDelaysMs,
      error
    );
  }
}

export async function runOpenRouterRetrySelfCheck(): Promise<void> {
  let requestInitCount = 0;
  const waited: number[] = [];
  const responses = [
    new Response(null, { headers: { 'Retry-After': '2' }, status: 503 }),
    new Response('{}', { status: 200 }),
  ];
  const retried = await requestWithRetry(
    'https://example.invalid',
    () => {
      requestInitCount += 1;
      return {};
    },
    {
      fetch: () => Promise.resolve(responses.shift() ?? new Response('{}', { status: 200 })),
      now: () => 0,
      sleep: (milliseconds) => {
        waited.push(milliseconds);
        return Promise.resolve();
      },
    }
  );
  if (
    retried.attempts !== 2 ||
    requestInitCount !== 2 ||
    waited.length !== 1 ||
    waited[0] !== 2_000
  ) {
    throw new Error('OpenRouter Retry-After self-check failed');
  }

  let networkAttempts = 0;
  const networkRetry = await requestWithRetry('https://example.invalid', () => ({}), {
    fetch: () => {
      networkAttempts += 1;
      return networkAttempts === 1
        ? Promise.reject(new Error('temporary network error'))
        : Promise.resolve(new Response('{}', { status: 200 }));
    },
    now: () => 0,
    sleep: () => Promise.resolve(),
  });
  if (networkRetry.attempts !== 2 || networkRetry.retryDelaysMs[0] !== 1_000) {
    throw new Error('OpenRouter network retry self-check failed');
  }

  try {
    await requestWithRetry('https://example.invalid', () => ({}), {
      fetch: () => Promise.resolve(new Response(null, { status: 401 })),
      now: () => 0,
      sleep: () => Promise.resolve(),
    });
    throw new Error('OpenRouter non-retryable response self-check did not fail');
  } catch (error) {
    if (!(error instanceof OpenRouterCallError) || error.attempts !== 1) {
      throw error;
    }
  }

  try {
    await requestWithRetry('https://example.invalid', () => ({}), {
      fetch: () =>
        Promise.resolve(new Response(null, { headers: { 'Retry-After': '121' }, status: 503 })),
      now: () => 0,
      sleep: () => Promise.resolve(),
    });
    throw new Error('OpenRouter excessive Retry-After self-check did not fail');
  } catch (error) {
    if (!(error instanceof OpenRouterCallError) || error.retryDelaysMs.length !== 0) {
      throw error;
    }
  }
}
