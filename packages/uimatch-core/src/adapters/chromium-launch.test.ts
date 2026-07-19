import { afterEach, expect, test, vi } from 'vitest';
import { getChromiumLaunchPolicy, launchChromium } from './chromium-launch';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  executablePath: vi.fn(() => '/playwright/chromium'),
  launch: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({ access: mocks.access }));
vi.mock('playwright', () => ({
  chromium: {
    executablePath: mocks.executablePath,
    launch: mocks.launch,
  },
}));

const ENV_KEYS = [
  'UIMATCH_CHROMIUM_SANDBOX',
  'UIMATCH_CHROME_ARGS',
  'UIMATCH_CHROME_CHANNEL',
  'UIMATCH_HEADLESS',
] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    const original = originalEnv[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
  vi.clearAllMocks();
});

test('enables the Chromium sandbox and bundled browser by default', async () => {
  mocks.access.mockResolvedValue(undefined);
  mocks.launch.mockResolvedValue({});

  await launchChromium({ timeout: 1234 });

  expect(mocks.launch).toHaveBeenCalledWith({
    args: [],
    channel: undefined,
    chromiumSandbox: true,
    headless: true,
    timeout: 1234,
  });
});

test('selects system Chrome before launch when bundled Chromium is missing', async () => {
  mocks.access.mockRejectedValue(new Error('missing'));
  mocks.launch.mockResolvedValue({});

  await launchChromium();

  expect(mocks.launch).toHaveBeenCalledWith(
    expect.objectContaining({ channel: 'chrome', chromiumSandbox: true })
  );
});

test.each(['invalid', 'TRUE', '0'])('rejects invalid sandbox setting %s', (value) => {
  process.env.UIMATCH_CHROMIUM_SANDBOX = value;

  expect(() => getChromiumLaunchPolicy()).toThrow(
    'UIMATCH_CHROMIUM_SANDBOX must be "true" or "false"'
  );
});

test.each(['--no-sandbox', '--disable-setuid-sandbox'])(
  'rejects hidden sandbox opt-out flag %s',
  (flag) => {
    process.env.UIMATCH_CHROME_ARGS = flag;

    expect(() => getChromiumLaunchPolicy()).toThrow(
      `${flag} conflicts with UIMATCH_CHROMIUM_SANDBOX=true`
    );
  }
);

test('allows an explicit sandbox opt-out', () => {
  process.env.UIMATCH_CHROMIUM_SANDBOX = 'false';
  process.env.UIMATCH_CHROME_ARGS = '--no-sandbox';

  expect(getChromiumLaunchPolicy()).toMatchObject({
    chromiumSandbox: false,
    args: ['--no-sandbox'],
  });
});

test('preserves the launch failure as the error cause and explains the opt-out', async () => {
  const cause = new Error('sandbox unavailable');
  mocks.access.mockResolvedValue(undefined);
  mocks.launch.mockRejectedValue(cause);

  let launchError: unknown;
  try {
    await launchChromium();
  } catch (error) {
    launchError = error;
  }

  expect(launchError).toBeInstanceOf(Error);
  expect(launchError).toHaveProperty('cause', cause);
  expect(launchError).toHaveProperty(
    'message',
    expect.stringContaining('UIMATCH_CHROMIUM_SANDBOX=false')
  );
});
