import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CodexReasoningEffort, ModelTokenUsage, ModelTurnUsage } from '../types.js';
import {
  TurnBackendError,
  type BackendTurnInput,
  type BackendTurnResult,
  type ModelMessage,
  type TurnBackend,
} from './backend.js';

export const defaultCodexTurnTimeoutMs = 120_000;
export const maximumCodexTurnTimeoutMs = 2_147_483_647;
const processTerminationGraceMs = 2_000;
const maximumProcessOutputBytes = 5 * 1024 * 1024;
const versionTimeoutMs = 10_000;
const codexRootFlags = {
  approval: '--ask-for-approval',
} as const;
const codexExecFlags = {
  config: '--config',
  cwd: '--cd',
  ephemeral: '--ephemeral',
  ignoreRules: '--ignore-rules',
  ignoreUserConfig: '--ignore-user-config',
  image: '--image',
  json: '--json',
  model: '--model',
  outputSchema: '--output-schema',
  sandbox: '--sandbox',
  skipGitRepoCheck: '--skip-git-repo-check',
} as const;
const codexEnvironmentKeys = [
  'ALL_PROXY',
  'CODEX_HOME',
  'HOME',
  'HTTPS_PROXY',
  'HTTP_PROXY',
  'LANG',
  'LC_ALL',
  'NIX_SSL_CERT_FILE',
  'NO_PROXY',
  'NODE_EXTRA_CA_CERTS',
  'PATH',
  'SHELL',
  'SSL_CERT_DIR',
  'SSL_CERT_FILE',
  'TERM',
  'TMPDIR',
  'USER',
  'WSL_DISTRO_NAME',
  'WSLENV',
  'XDG_CONFIG_HOME',
  'all_proxy',
  'http_proxy',
  'https_proxy',
  'no_proxy',
] as const;
const repairProposalSchemaPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../schemas/repair-proposal.schema.json'
);

interface ProcessResult {
  stderr: string;
  stdout: string;
}

interface CodexExecOptions {
  command?: string;
  prefixArgs?: string[];
  reasoningEffort: CodexReasoningEffort;
  timeoutMs?: number;
}

class ProcessExecutionError extends Error {
  readonly stderr: string;
  readonly stdout: string;

  constructor(message: string, output: ProcessResult, options: { cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'ProcessExecutionError';
    this.stderr = output.stderr;
    this.stdout = output.stdout;
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

function asNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return value as number;
}

function subscriptionBilling() {
  return { mode: 'subscription' as const };
}

function assertHelpSupports(help: string, flags: readonly string[], label: string): void {
  const missing = flags.filter((flag) => !help.includes(flag));
  if (missing.length > 0) {
    throw new TypeError(`${label} is missing required options: ${missing.join(', ')}`);
  }
}

function codexProcessEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    codexEnvironmentKeys.flatMap((key) => {
      const value = process.env[key];
      return value === undefined ? [] : [[key, value]];
    })
  );
}

function runProcess(options: {
  args: string[];
  command: string;
  cwd: string;
  input?: string;
  timeoutMs: number;
}): Promise<ProcessResult> {
  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: codexProcessEnvironment(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let settled = false;
    let stderr = '';
    let stdout = '';
    let timedOut = false;
    let outputExceeded = false;
    let stdinError: Error | undefined;
    let forceKillTimer: NodeJS.Timeout | undefined;

    const terminate = (): void => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill('SIGTERM');
      forceKillTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      }, processTerminationGraceMs);
      forceKillTimer.unref();
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      terminate();
    }, options.timeoutMs);
    timeout.unref();

    const appendOutput = (stream: 'stderr' | 'stdout', chunk: Buffer): void => {
      if (stream === 'stderr') stderr += chunk.toString('utf8');
      else stdout += chunk.toString('utf8');
      if (
        !outputExceeded &&
        Buffer.byteLength(stderr) + Buffer.byteLength(stdout) > maximumProcessOutputBytes
      ) {
        outputExceeded = true;
        terminate();
      }
    };
    child.stdout.on('data', (chunk: Buffer) => appendOutput('stdout', chunk));
    child.stderr.on('data', (chunk: Buffer) => appendOutput('stderr', chunk));
    child.stdin.on('error', (error) => {
      stdinError = error;
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      rejectProcess(
        new ProcessExecutionError(
          `Failed to start Codex CLI: ${error.message}`,
          { stderr, stdout },
          {
            cause: error,
          }
        )
      );
    });
    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      const output = { stderr, stdout };
      if (timedOut) {
        rejectProcess(
          new ProcessExecutionError(
            `Codex CLI exceeded the ${options.timeoutMs}ms turn timeout`,
            output
          )
        );
        return;
      }
      if (outputExceeded) {
        rejectProcess(
          new ProcessExecutionError(
            `Codex CLI output exceeded ${maximumProcessOutputBytes} bytes`,
            output
          )
        );
        return;
      }
      if (code !== 0) {
        rejectProcess(
          new ProcessExecutionError(
            `Codex CLI exited with ${code === null ? `signal ${signal ?? 'unknown'}` : `code ${code}`}${stderr.trim() ? `: ${stderr.trim()}` : ''}`,
            output
          )
        );
        return;
      }
      if (stdinError) {
        rejectProcess(
          new ProcessExecutionError(
            `Failed to send the Codex prompt: ${stdinError.message}`,
            output,
            {
              cause: stdinError,
            }
          )
        );
        return;
      }
      resolveProcess(output);
    });
    if (options.input === undefined) child.stdin.end();
    else child.stdin.end(options.input, 'utf8');
  });
}

function readDataUrl(dataUrl: string, label: string): { bytes: Buffer; extension: string } {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match?.[1] || !match[2]) {
    throw new TypeError(`${label} must be a base64 PNG, JPEG, or WebP data URL`);
  }
  const extension = match[1] === 'image/jpeg' ? 'jpg' : match[1].slice('image/'.length);
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length === 0) throw new TypeError(`${label} must not be empty`);
  return { bytes, extension };
}

function flattenMessages(messages: ModelMessage[]): { images: string[]; prompt: string } {
  const images: string[] = [];
  const sections = messages.map((message) => {
    const lines = [`${message.role.toUpperCase()}:`];
    if (typeof message.content === 'string') {
      lines.push(message.content);
    } else {
      for (const content of message.content) {
        if (content.type === 'text') lines.push(content.text);
        else {
          images.push(content.image_url.url);
          lines.push(`[Attached image ${images.length}]`);
        }
      }
    }
    return lines.join('\n');
  });
  return { images, prompt: sections.join('\n\n') };
}

async function materializeImages(dataUrls: string[], directory: string): Promise<string[]> {
  const paths: string[] = [];
  for (const [index, dataUrl] of dataUrls.entries()) {
    const image = readDataUrl(dataUrl, `model image ${index + 1}`);
    const path = join(directory, `image-${index + 1}.${image.extension}`);
    await writeFile(path, image.bytes, { flag: 'wx' });
    paths.push(path);
  }
  return paths;
}

async function removeTemporaryDirectory(directory: string): Promise<void> {
  try {
    await rm(directory, { force: true, recursive: true });
  } catch (error) {
    process.emitWarning(
      `Failed to remove Codex eval input directory ${directory}: ${error instanceof Error ? error.message : String(error)}`,
      { code: 'UIMATCH_EVAL_CLEANUP' }
    );
  }
}

function readCodexUsage(value: unknown): ModelTokenUsage {
  const usage = asRecord(value, 'Codex turn.completed usage');
  const inputTokens = asNonNegativeInteger(usage.input_tokens, 'Codex usage.input_tokens');
  const cachedInputTokens =
    usage.cached_input_tokens === undefined
      ? undefined
      : asNonNegativeInteger(usage.cached_input_tokens, 'Codex usage.cached_input_tokens');
  if (cachedInputTokens !== undefined && cachedInputTokens > inputTokens) {
    throw new TypeError('Codex cached input tokens must not exceed input tokens');
  }
  const outputTokens = asNonNegativeInteger(usage.output_tokens, 'Codex usage.output_tokens');
  const reasoningTokens =
    usage.reasoning_output_tokens === undefined
      ? undefined
      : asNonNegativeInteger(usage.reasoning_output_tokens, 'Codex usage.reasoning_output_tokens');
  return {
    ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }),
    inputTokens,
    outputTokens,
    ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
    totalTokens: inputTokens + outputTokens,
  };
}

function parseCodexJsonl(
  stdout: string,
  requestedModel: string,
  version: string
): {
  content: string;
  usage: ModelTurnUsage;
} {
  let content: string | undefined;
  let tokens: ModelTokenUsage | undefined;
  const lines = stdout.split(/\r?\n/).filter((line) => line.trim().length > 0);
  for (const [index, line] of lines.entries()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch (error) {
      throw new TypeError(
        `Codex JSONL line ${index + 1} is invalid: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    const event = asRecord(parsed, `Codex JSONL line ${index + 1}`);
    if (event.type === 'item.completed') {
      const item = asRecord(event.item, `Codex JSONL line ${index + 1}.item`);
      if (item.type === 'agent_message') {
        content = asString(item.text, `Codex JSONL line ${index + 1}.item.text`);
      }
    } else if (event.type === 'turn.completed') {
      tokens = readCodexUsage(event.usage);
    }
  }
  if (!content) throw new TypeError('Codex JSONL did not contain a completed agent message');
  if (!tokens) throw new TypeError('Codex JSONL did not contain turn usage');
  return {
    content,
    usage: {
      ...tokens,
      authMode: 'subscription',
      backend: 'codex-exec',
      backendVersion: version,
      requestedModel,
    },
  };
}

function usageFromFailedOutput(
  stdout: string,
  requestedModel: string,
  version: string
): ModelTurnUsage | undefined {
  let tokens: ModelTokenUsage | undefined;
  for (const line of stdout.split(/\r?\n/)) {
    if (line.trim().length === 0) continue;
    try {
      const event = asRecord(JSON.parse(line) as unknown, 'Codex JSONL diagnostic line');
      if (event.type === 'turn.completed') tokens = readCodexUsage(event.usage);
    } catch {
      // Preserve valid usage from other events without treating diagnostics as a response.
    }
  }
  return tokens
    ? {
        ...tokens,
        authMode: 'subscription',
        backend: 'codex-exec',
        backendVersion: version,
        requestedModel,
      }
    : undefined;
}

async function runCodexTurn(options: {
  command: string;
  input: BackendTurnInput;
  prefixArgs: string[];
  reasoningEffort: CodexReasoningEffort;
  timeoutMs: number;
  version: string;
}): Promise<BackendTurnResult> {
  const materialized = flattenMessages(options.input.messages);
  const inputDirectory = await mkdtemp(join(options.input.workspacePath, '.uimatch-codex-'));
  try {
    const imagePaths = await materializeImages(materialized.images, inputDirectory);
    const imageArgs = imagePaths.flatMap((path) => [codexExecFlags.image, path]);
    const args = [
      ...options.prefixArgs,
      codexRootFlags.approval,
      'never',
      'exec',
      codexExecFlags.ephemeral,
      codexExecFlags.ignoreUserConfig,
      codexExecFlags.ignoreRules,
      codexExecFlags.skipGitRepoCheck,
      codexExecFlags.config,
      'shell_environment_policy.inherit=none',
      codexExecFlags.config,
      'project_doc_max_bytes=0',
      codexExecFlags.config,
      `model_reasoning_effort="${options.reasoningEffort}"`,
      codexExecFlags.sandbox,
      'read-only',
      codexExecFlags.json,
      codexExecFlags.model,
      options.input.model,
      codexExecFlags.outputSchema,
      repairProposalSchemaPath,
      codexExecFlags.cwd,
      options.input.workspacePath,
      ...imageArgs,
      '-',
    ];
    let stdout = '';
    try {
      const result = await runProcess({
        args,
        command: options.command,
        cwd: options.input.workspacePath,
        input: materialized.prompt,
        timeoutMs: options.timeoutMs,
      });
      stdout = result.stdout;
      const parsed = parseCodexJsonl(result.stdout, options.input.model, options.version);
      return {
        billing: subscriptionBilling(),
        content: parsed.content,
        finishReason: 'stop',
        requestAttempts: 1,
        retryDelaysMs: [],
        usage: parsed.usage,
      };
    } catch (error) {
      const processError = error instanceof ProcessExecutionError ? error : undefined;
      const usage = usageFromFailedOutput(
        processError?.stdout ?? stdout,
        options.input.model,
        options.version
      );
      throw new TurnBackendError(error instanceof Error ? error.message : String(error), {
        attempts: 1,
        billing: subscriptionBilling(),
        cause: error,
        retryDelaysMs: [],
        ...(usage ? { usage } : {}),
      });
    }
  } finally {
    await removeTemporaryDirectory(inputDirectory);
  }
}

export async function createCodexExecBackend(options: CodexExecOptions): Promise<TurnBackend> {
  const command = options.command ?? 'codex';
  const prefixArgs = options.prefixArgs ?? [];
  let version: string;
  try {
    const versionResult = await runProcess({
      args: [...prefixArgs, '--version'],
      command,
      cwd: process.cwd(),
      timeoutMs: versionTimeoutMs,
    });
    const versionMatch = /^codex-cli\s+(\S+)\s*$/.exec(versionResult.stdout);
    if (!versionMatch?.[1]) {
      throw new TypeError('Codex CLI returned an unrecognized version string');
    }
    version = versionMatch[1];
    const rootHelp = await runProcess({
      args: [...prefixArgs, '--help'],
      command,
      cwd: process.cwd(),
      timeoutMs: versionTimeoutMs,
    });
    assertHelpSupports(rootHelp.stdout, Object.values(codexRootFlags), 'Codex CLI help');
    const execHelp = await runProcess({
      args: [...prefixArgs, 'exec', '--help'],
      command,
      cwd: process.cwd(),
      timeoutMs: versionTimeoutMs,
    });
    assertHelpSupports(execHelp.stdout, Object.values(codexExecFlags), 'Codex exec help');
  } catch (error) {
    throw new TurnBackendError(error instanceof Error ? error.message : String(error), {
      attempts: 1,
      billing: subscriptionBilling(),
      cause: error,
      retryDelaysMs: [],
    });
  }
  return {
    authMode: 'subscription',
    id: 'codex-exec',
    runTurn: (input) =>
      runCodexTurn({
        command,
        input,
        prefixArgs,
        reasoningEffort: options.reasoningEffort,
        timeoutMs: options.timeoutMs ?? defaultCodexTurnTimeoutMs,
        version,
      }),
    version,
  };
}
