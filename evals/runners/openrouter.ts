import type { ModelTurnUsage } from '../types.js';

const openRouterEndpoint = 'https://openrouter.ai/api/v1/chat/completions';
const modelRequestTimeoutMs = 120_000;

export interface ModelMessage {
  content:
    | string
    | Array<{ text: string; type: 'text' } | { image_url: { url: string }; type: 'image_url' }>;
  role: 'assistant' | 'system' | 'user';
}

export interface ModelTurn {
  content: string;
  finishReason: string;
  usage: ModelTurnUsage;
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

export async function requestOpenRouterTurn(options: {
  apiKey: string;
  messages: ModelMessage[];
  model: string;
}): Promise<ModelTurn> {
  const response = await fetch(openRouterEndpoint, {
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
  });
  if (!response.ok) {
    const retryAfter = response.headers.get('Retry-After');
    throw new Error(
      `OpenRouter request failed with HTTP ${response.status}${retryAfter ? ` (Retry-After: ${retryAfter})` : ''}`
    );
  }

  const body: unknown = await response.json();
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
}
