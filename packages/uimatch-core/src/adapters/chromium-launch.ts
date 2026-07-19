import { access } from 'node:fs/promises';
import { chromium, type Browser } from 'playwright';

const SANDBOX_OPT_OUT_FLAGS = new Set(['--no-sandbox', '--disable-setuid-sandbox']);

export interface ChromiumLaunchPolicy {
  headless: boolean;
  channel?: string;
  chromiumSandbox: boolean;
  args: string[];
}

interface ChromiumLaunchRequest {
  additionalArgs?: string[];
  timeout?: number;
}

function parseSandboxSetting(value: string | undefined): boolean {
  if (value === undefined || value === 'true') return true;
  if (value === 'false') return false;
  throw new RangeError('UIMATCH_CHROMIUM_SANDBOX must be "true" or "false"');
}

export function getChromiumLaunchPolicy(
  request: Pick<ChromiumLaunchRequest, 'additionalArgs'> = {}
): ChromiumLaunchPolicy {
  const chromiumSandbox = parseSandboxSetting(process.env.UIMATCH_CHROMIUM_SANDBOX);
  const args = [
    ...(process.env.UIMATCH_CHROME_ARGS?.split(/\s+/).filter(Boolean) ?? []),
    ...(request.additionalArgs ?? []),
  ];

  if (chromiumSandbox) {
    const optOutFlag = args.find((arg) => SANDBOX_OPT_OUT_FLAGS.has(arg));
    if (optOutFlag) {
      throw new RangeError(
        `${optOutFlag} conflicts with UIMATCH_CHROMIUM_SANDBOX=true; set UIMATCH_CHROMIUM_SANDBOX=false to opt out explicitly`
      );
    }
  }

  const configuredChannel = process.env.UIMATCH_CHROME_CHANNEL?.trim();
  return {
    headless: process.env.UIMATCH_HEADLESS !== 'false',
    channel: configuredChannel || undefined,
    chromiumSandbox,
    args,
  };
}

async function bundledChromiumExists(): Promise<boolean> {
  try {
    await access(chromium.executablePath());
    return true;
  } catch {
    return false;
  }
}

export async function launchChromium(request: ChromiumLaunchRequest = {}): Promise<Browser> {
  const policy = getChromiumLaunchPolicy(request);
  const bundledAvailable = policy.channel ? true : await bundledChromiumExists();
  const channel = policy.channel ?? (bundledAvailable ? undefined : 'chrome');

  try {
    return await chromium.launch({
      ...policy,
      channel,
      timeout: request.timeout,
    });
  } catch (cause) {
    const source = channel ? `the ${channel} channel` : 'bundled Chromium';
    const installHint = bundledAvailable
      ? ''
      : ' Bundled Chromium was not found; run "npx playwright install chromium" or install system Chrome.';
    const sandboxHint = policy.chromiumSandbox
      ? ' If this environment cannot run the Chromium sandbox, explicitly set UIMATCH_CHROMIUM_SANDBOX=false.'
      : '';
    throw new Error(`Failed to launch ${source}.${installHint}${sandboxHint}`, { cause });
  }
}
