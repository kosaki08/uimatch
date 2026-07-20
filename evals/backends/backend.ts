import type { EvalAuthMode, EvalBackendId, ModelBilling, ModelTurnUsage } from '../types.js';

export interface ModelMessage {
  content:
    | string
    | Array<{ text: string; type: 'text' } | { image_url: { url: string }; type: 'image_url' }>;
  role: 'assistant' | 'system' | 'user';
}

export interface BackendTurnInput {
  messages: ModelMessage[];
  model: string;
  workspacePath: string;
}

export interface BackendTurnResult {
  billing: ModelBilling;
  content: string;
  finishReason: string;
  requestAttempts: number;
  retryDelaysMs: number[];
  usage: ModelTurnUsage;
}

export interface TurnBackend {
  readonly authMode: EvalAuthMode;
  readonly id: EvalBackendId;
  readonly version: string;
  runTurn(input: BackendTurnInput): Promise<BackendTurnResult>;
}

export class TurnBackendError extends Error {
  readonly attempts: number;
  readonly billing: ModelBilling;
  readonly retryDelaysMs: number[];
  readonly usage?: ModelTurnUsage;

  constructor(
    message: string,
    options: {
      attempts: number;
      billing: ModelBilling;
      cause?: unknown;
      retryDelaysMs: number[];
      usage?: ModelTurnUsage;
    }
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'TurnBackendError';
    this.attempts = options.attempts;
    this.billing = options.billing;
    this.retryDelaysMs = options.retryDelaysMs;
    this.usage = options.usage;
  }
}
