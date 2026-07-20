import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TurnBackendError, type ModelMessage } from './backend.js';
import { createCodexExecBackend } from './codex-exec.js';

const fakeCliSource = `
import { access } from 'node:fs/promises';
const rawArgs = process.argv.slice(2);
const omitRequiredHelpOption = rawArgs.includes('--fake-missing-help');
const args = rawArgs.filter((argument) => argument !== '--fake-missing-help');
if (process.env.FIGMA_ACCESS_TOKEN || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY) {
  throw new Error('sensitive parent environment was inherited');
}
if (args.length === 1 && args[0] === '--version') {
  process.stdout.write('codex-cli 0.0.0-self-check\\n');
  process.exit(0);
}
if (args.length === 1 && args[0] === '--help') {
  process.stdout.write('--ask-for-approval\\n');
  process.exit(0);
}
if (args.length === 2 && args[0] === 'exec' && args[1] === '--help') {
  process.stdout.write('--config --cd --ephemeral --ignore-rules --ignore-user-config --image --json --model ' + (omitRequiredHelpOption ? '' : '--output-schema ') + '--sandbox --skip-git-repo-check\\n');
  process.exit(0);
}
const requiredFlags = ['exec', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check', '--json'];
for (const flag of requiredFlags) {
  if (!args.includes(flag)) throw new Error('missing required argument: ' + flag);
}
const valueAfter = (flag) => args[args.indexOf(flag) + 1];
if (valueAfter('--sandbox') !== 'read-only') throw new Error('sandbox is not read-only');
if (valueAfter('--ask-for-approval') !== 'never') throw new Error('approval policy is not never');
if (valueAfter('--config') !== 'shell_environment_policy.inherit=none') throw new Error('shell environment is inherited');
if (!args.includes('project_doc_max_bytes=0')) throw new Error('agent instructions are enabled');
await access(valueAfter('--output-schema'));
await access(valueAfter('--cd'));
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--image') await access(args[index + 1]);
}
const model = valueAfter('--model');
if (model === 'fake-timeout') await new Promise(() => {});
if (model === 'fake-error') {
  process.stderr.write('intentional fake failure\\n');
  process.exit(2);
}
const prompt = await new Promise((resolve) => {
  let value = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { value += chunk; });
  process.stdin.on('end', () => resolve(value));
});
if (!prompt.includes('USER:') || !prompt.includes('[Attached image 1]')) {
  throw new Error('prompt or image marker missing');
}
if (model === 'fake-invalid-output') {
  process.stdout.write(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 5, reasoning_output_tokens: 1 } }) + '\\n');
  process.exit(0);
}
process.stdout.write(JSON.stringify({ type: 'thread.started', thread_id: 'fake' }) + '\\n');
process.stdout.write(JSON.stringify({ type: 'item.completed', item: { id: 'item-1', type: 'agent_message', text: '{"diagnosis":"fake","changes":[{"selector":".button","property":"padding","value":"8px 16px"}]}' } }) + '\\n');
process.stdout.write(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 5, reasoning_output_tokens: 1 } }) + '\\n');
`;

export async function runCodexExecSelfCheck(): Promise<void> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'uimatch-eval-codex-self-check-'));
  try {
    const fakeCliPath = join(temporaryRoot, 'fake-codex.mjs');
    await writeFile(fakeCliPath, fakeCliSource, { encoding: 'utf8', flag: 'wx' });
    const workspacePath = join(temporaryRoot, 'workspace');
    await mkdir(workspacePath);
    const message: ModelMessage = {
      content: [
        { text: 'Repair this UI.', type: 'text' },
        {
          image_url: {
            url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          },
          type: 'image_url',
        },
      ],
      role: 'user',
    };
    const backend = await createCodexExecBackend({
      command: process.execPath,
      prefixArgs: [fakeCliPath],
      timeoutMs: 2_000,
    });
    try {
      await createCodexExecBackend({
        command: process.execPath,
        prefixArgs: [fakeCliPath, '--fake-missing-help'],
      });
      throw new Error('Codex backend CLI preflight self-check did not fail');
    } catch (error) {
      if (!(error instanceof TurnBackendError) || !error.message.includes('--output-schema')) {
        throw error;
      }
    }
    const result = await backend.runTurn({
      messages: [message],
      model: 'fake-success',
      workspacePath,
    });
    if (
      result.billing.mode !== 'subscription' ||
      result.usage.backend !== 'codex-exec' ||
      result.usage.cachedInputTokens !== 2 ||
      result.usage.totalTokens !== 15 ||
      !result.content.includes('"diagnosis":"fake"')
    ) {
      throw new Error('Codex backend success self-check failed');
    }

    try {
      await backend.runTurn({ messages: [message], model: 'fake-error', workspacePath });
      throw new Error('Codex backend failure self-check did not fail');
    } catch (error) {
      if (!(error instanceof TurnBackendError) || error.billing.mode !== 'subscription') {
        throw error;
      }
    }

    try {
      await backend.runTurn({
        messages: [message],
        model: 'fake-invalid-output',
        workspacePath,
      });
      throw new Error('Codex backend partial usage self-check did not fail');
    } catch (error) {
      if (
        !(error instanceof TurnBackendError) ||
        error.billing.mode !== 'subscription' ||
        error.usage?.totalTokens !== 15
      ) {
        throw error;
      }
    }

    const timeoutBackend = await createCodexExecBackend({
      command: process.execPath,
      prefixArgs: [fakeCliPath],
      timeoutMs: 50,
    });
    try {
      await timeoutBackend.runTurn({ messages: [message], model: 'fake-timeout', workspacePath });
      throw new Error('Codex backend timeout self-check did not fail');
    } catch (error) {
      if (!(error instanceof TurnBackendError) || !error.message.includes('timeout')) throw error;
    }
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}
