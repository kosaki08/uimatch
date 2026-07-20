import type { ModelBilling, ModelTokenUsage, ModelTurnUsage } from '../types.js';
import {
  TurnBackendError,
  type BackendTurnResult,
  type ModelMessage,
  type TurnBackend,
} from './backend.js';

const openRouterEndpoint = 'https://openrouter.ai/api/v1/chat/completions';
const modelRequestTimeoutMs = 120_000;
const maximumRequestAttempts = 3;
const maximumRetryDelayMs = 120_000;
const transientHttpStatuses = new Set([429, 502, 503, 504, 529]);
const openRouterBackendVersion = 'chat-completions-v1';

type FetchFunction = (input: string, init: RequestInit) => Promise<Response>;
type SleepFunction = (milliseconds: number) => Promise<void>;

interface OpenRouterUsage {
  billing: Extract<ModelBilling, { mode: 'metered-usd' }>;
  tokens: ModelTokenUsage;
}

function unknownBilling(): Extract<ModelBilling, { mode: 'metered-usd' }> {
  return { costUnknown: true, knownCostUsd: 0, mode: 'metered-usd' };
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

function readBillingUsage(value: unknown): OpenRouterUsage {
  const usage = asRecord(value, 'OpenRouter response usage');
  const completionDetails =
    usage.completion_tokens_details === undefined
      ? undefined
      : asRecord(usage.completion_tokens_details, 'OpenRouter response completion token details');
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
  if (promptTokens + completionTokens !== totalTokens) {
    throw new TypeError('OpenRouter response token totals are inconsistent');
  }
  const reasoningTokens = completionDetails
    ? optionalNonNegativeInteger(
        completionDetails.reasoning_tokens,
        'OpenRouter response usage.completion_tokens_details.reasoning_tokens'
      )
    : undefined;
  return {
    billing: {
      costUnknown: false,
      knownCostUsd: asNonNegativeNumber(usage.cost, 'OpenRouter response usage.cost'),
      mode: 'metered-usd',
    },
    tokens: {
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
      totalTokens,
    },
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
      throw new TurnBackendError(
        `OpenRouter network request failed on attempt ${attempt}: ${error instanceof Error ? error.message : String(error)}`,
        { attempts: attempt, billing: unknownBilling(), cause: error, retryDelaysMs }
      );
    }

    if (response.ok) {
      return { attempts: attempt, response, retryDelaysMs };
    }
    const retryAfter = response.headers.get('Retry-After');
    if (!transientHttpStatuses.has(response.status) || attempt === maximumRequestAttempts) {
      await discardResponseBody(response);
      throw new TurnBackendError(
        `OpenRouter request failed with HTTP ${response.status}${retryAfter ? ` (Retry-After: ${retryAfter})` : ''}`,
        { attempts: attempt, billing: unknownBilling(), retryDelaysMs }
      );
    }
    const delayMs =
      parseRetryAfterMs(retryAfter, dependencies.now()) ?? defaultRetryDelayMs(attempt);
    if (delayMs > maximumRetryDelayMs) {
      await discardResponseBody(response);
      throw new TurnBackendError(
        `OpenRouter requested a retry delay of ${delayMs}ms, exceeding the ${maximumRetryDelayMs}ms harness limit`,
        { attempts: attempt, billing: unknownBilling(), retryDelaysMs }
      );
    }
    await discardResponseBody(response);
    retryDelaysMs.push(delayMs);
    await dependencies.sleep(delayMs);
  }
  throw new Error('OpenRouter retry loop exhausted unexpectedly');
}

function parseOpenRouterTurn(
  body: unknown,
  request: { attempts: number; retryDelaysMs: number[] },
  requestedModel: string
): BackendTurnResult {
  let partialUsage: OpenRouterUsage | undefined;
  try {
    const record = asRecord(body, 'OpenRouter response');
    partialUsage = readBillingUsage(record.usage);
    const choices = record.choices;
    if (!Array.isArray(choices) || choices.length === 0) {
      throw new TypeError('OpenRouter response choices must be a non-empty array');
    }
    const choice = asRecord(choices[0], 'OpenRouter response choices[0]');
    const message = asRecord(choice.message, 'OpenRouter response choices[0].message');
    let routing: ReturnType<typeof readRoutingMetadata> = {};
    let routingMetadataError: string | undefined;
    try {
      routing = readRoutingMetadata(record.openrouter_metadata);
    } catch (error) {
      routingMetadataError = error instanceof Error ? error.message : String(error);
    }

    return {
      billing: partialUsage.billing,
      content: asText(message.content, 'OpenRouter response message.content'),
      finishReason: asString(choice.finish_reason, 'OpenRouter response choices[0].finish_reason'),
      requestAttempts: request.attempts,
      retryDelaysMs: request.retryDelaysMs,
      usage: {
        ...partialUsage.tokens,
        authMode: 'api',
        backend: 'openrouter',
        backendVersion: openRouterBackendVersion,
        ...(routing.fallbackUsed !== undefined ? { fallbackUsed: routing.fallbackUsed } : {}),
        generationId: asString(record.id, 'OpenRouter response id'),
        ...(routing.provider ? { provider: routing.provider } : {}),
        requestedModel,
        responseModel: asString(record.model, 'OpenRouter response model'),
        ...(routingMetadataError ? { routingMetadataError } : {}),
      },
    };
  } catch (error) {
    const partialTurnUsage: ModelTurnUsage | undefined = partialUsage
      ? {
          ...partialUsage.tokens,
          authMode: 'api',
          backend: 'openrouter',
          backendVersion: openRouterBackendVersion,
          requestedModel,
        }
      : undefined;
    throw new TurnBackendError(
      `OpenRouter response validation failed: ${error instanceof Error ? error.message : String(error)}`,
      {
        attempts: request.attempts,
        billing: partialUsage?.billing ?? unknownBilling(),
        cause: error,
        retryDelaysMs: request.retryDelaysMs,
        ...(partialTurnUsage ? { usage: partialTurnUsage } : {}),
      }
    );
  }
}

async function requestOpenRouterTurn(options: {
  apiKey: string;
  messages: ModelMessage[];
  model: string;
}): Promise<BackendTurnResult> {
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

  let body: unknown;
  try {
    body = await request.response.json();
  } catch (error) {
    throw new TurnBackendError(
      `OpenRouter response validation failed: ${error instanceof Error ? error.message : String(error)}`,
      {
        attempts: request.attempts,
        billing: unknownBilling(),
        cause: error,
        retryDelaysMs: request.retryDelaysMs,
      }
    );
  }
  return parseOpenRouterTurn(body, request, options.model);
}

export function createOpenRouterBackend(apiKey: string): TurnBackend {
  return {
    authMode: 'api',
    id: 'openrouter',
    runTurn: ({ messages, model }) => requestOpenRouterTurn({ apiKey, messages, model }),
    version: openRouterBackendVersion,
  };
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
  try {
    await requestWithRetry('https://example.invalid', () => ({}), {
      fetch: () => {
        networkAttempts += 1;
        return Promise.reject(new Error('ambiguous delivery failure'));
      },
      now: () => 0,
      sleep: () => Promise.resolve(),
    });
    throw new Error('OpenRouter network failure self-check did not fail');
  } catch (error) {
    if (
      !(error instanceof TurnBackendError) ||
      error.attempts !== 1 ||
      error.retryDelaysMs.length !== 0 ||
      networkAttempts !== 1 ||
      error.billing.mode !== 'metered-usd' ||
      !error.billing.costUnknown
    ) {
      throw error;
    }
  }

  try {
    await requestWithRetry('https://example.invalid', () => ({}), {
      fetch: () => Promise.resolve(new Response(null, { status: 401 })),
      now: () => 0,
      sleep: () => Promise.resolve(),
    });
    throw new Error('OpenRouter non-retryable response self-check did not fail');
  } catch (error) {
    if (!(error instanceof TurnBackendError) || error.attempts !== 1) {
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
    if (!(error instanceof TurnBackendError) || error.retryDelaysMs.length !== 0) {
      throw error;
    }
  }

  const validUsage = {
    completion_tokens: 3,
    cost: 0.001,
    prompt_tokens: 7,
    total_tokens: 10,
  };
  try {
    parseOpenRouterTurn(
      { choices: [], id: 'generation-id', model: 'provider/model', usage: validUsage },
      { attempts: 1, retryDelaysMs: [] },
      'requested/model'
    );
    throw new Error('OpenRouter partial usage self-check did not fail');
  } catch (error) {
    if (
      !(error instanceof TurnBackendError) ||
      error.billing.mode !== 'metered-usd' ||
      error.billing.costUnknown ||
      error.billing.knownCostUsd !== 0.001
    ) {
      throw error;
    }
  }

  try {
    parseOpenRouterTurn(
      {
        choices: [{ finish_reason: 'stop', message: { content: '{}' } }],
        id: 'generation-id',
        model: 'provider/model',
        usage: { ...validUsage, cost: 'unknown' },
      },
      { attempts: 1, retryDelaysMs: [] },
      'requested/model'
    );
    throw new Error('OpenRouter unknown cost self-check did not fail');
  } catch (error) {
    if (
      !(error instanceof TurnBackendError) ||
      error.billing.mode !== 'metered-usd' ||
      !error.billing.costUnknown
    ) {
      throw error;
    }
  }

  const metadataDiagnostic = parseOpenRouterTurn(
    {
      choices: [{ finish_reason: 'stop', message: { content: '{}' } }],
      id: 'generation-id',
      model: 'provider/model',
      openrouter_metadata: { endpoints: { available: 'invalid' } },
      usage: validUsage,
    },
    { attempts: 1, retryDelaysMs: [] },
    'requested/model'
  );
  if (!metadataDiagnostic.usage.routingMetadataError) {
    throw new Error('OpenRouter routing metadata failure was not retained as a diagnostic');
  }
}
