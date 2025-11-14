/**
 * Library import smoke test
 * Ensures type-safe imports work from published packages
 */
import { describe, expect, test } from 'bun:test';
import { exec } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

describe('@uimatch/selector-anchors + @uimatch/selector-spi type imports', () => {
  test('should import and type-check successfully', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'uimatch-lib-smoke-'));
    let packDir: string | undefined;

    try {
      // Create minimal package.json
      await writeFile(
        join(tmpDir, 'package.json'),
        JSON.stringify(
          {
            name: 'lib-consumer-test',
            type: 'module',
            dependencies: {},
          },
          null,
          2
        )
      );

      // Create tsconfig.json
      await writeFile(
        join(tmpDir, 'tsconfig.json'),
        JSON.stringify(
          {
            compilerOptions: {
              target: 'ES2022',
              module: 'ESNext',
              moduleResolution: 'nodenext',
              lib: ['ES2022'],
              strict: true,
              skipLibCheck: true,
              esModuleInterop: true,
            },
          },
          null,
          2
        )
      );

      // Create test TypeScript file
      const testCode = `
import plugin from '@uimatch/selector-anchors';
import type { SelectorResolverPlugin, Resolution } from '@uimatch/selector-spi';

// Type check: plugin should conform to SPI
const p: SelectorResolverPlugin = plugin;

// Type check: Resolution type should be available
const resolution: Resolution = {
  selector: 'test',
};

void p;
void resolution;

console.log('Type checks passed');
export {};
`;

      await writeFile(join(tmpDir, 'test.ts'), testCode);

      // Pack packages to a temporary directory
      packDir = await mkdtemp(join(tmpdir(), 'uimatch-pack-'));
      const packagesDir = join(process.cwd(), 'packages');

      const { stdout: spiPack } = await execAsync(`pnpm pack --pack-destination ${packDir}`, {
        cwd: join(packagesDir, 'uimatch-selector-spi'),
      });
      const { stdout: anchorsPack } = await execAsync(`pnpm pack --pack-destination ${packDir}`, {
        cwd: join(packagesDir, 'uimatch-selector-anchors'),
      });

      // pnpm pack outputs the full path to the generated tarball
      const spiTgzPath = spiPack.trim().split('\n').pop() ?? '';
      const anchorsTgzPath = anchorsPack.trim().split('\n').pop() ?? '';

      // Install packages
      await execAsync(`npm install ${spiTgzPath} ${anchorsTgzPath} typescript`, {
        cwd: tmpDir
      });

      // Type check
      const { stdout } = await execAsync('npx tsc --noEmit test.ts', {
        cwd: tmpDir,
      });

      expect(stdout).toBe('');
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
      if (packDir) {
        await rm(packDir, { recursive: true, force: true });
      }
    }
  }, 60000);
});

describe('@uimatch/shared-logging type imports', () => {
  test('should import Logger types successfully', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'uimatch-logging-smoke-'));
    let packDir: string | undefined;

    try {
      await writeFile(
        join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'logging-test', type: 'module' }, null, 2)
      );

      await writeFile(
        join(tmpDir, 'tsconfig.json'),
        JSON.stringify(
          {
            compilerOptions: {
              target: 'ES2022',
              module: 'ESNext',
              moduleResolution: 'nodenext',
              lib: ['ES2022'],
              strict: true,
              skipLibCheck: true,
              esModuleInterop: true,
            },
          },
          null,
          2
        )
      );

      const testCode = `
import { createLogger, silentLogger } from '@uimatch/shared-logging';
import type { Logger, LogLevel } from '@uimatch/shared-logging';

const logger: Logger = createLogger({ module: 'test' });
const silent: Logger = silentLogger;
const level: LogLevel = 'info';

logger.info({ level }, 'Logger type checks passed');
silent.debug('No-op');

console.log('Logger type checks passed');
export {};
`;

      await writeFile(join(tmpDir, 'test.ts'), testCode);

      // Pack package to a temporary directory
      packDir = await mkdtemp(join(tmpdir(), 'uimatch-pack-'));
      const { stdout: loggingPack } = await execAsync(`pnpm pack --pack-destination ${packDir}`, {
        cwd: join(process.cwd(), 'packages', 'shared-logging'),
      });

      // pnpm pack outputs the full path to the generated tarball
      const loggingTgzPath = loggingPack.trim().split('\n').pop() ?? '';

      await execAsync(`npm install ${loggingTgzPath} typescript`, {
        cwd: tmpDir,
      });

      const { stdout } = await execAsync('npx tsc --noEmit test.ts', {
        cwd: tmpDir,
      });

      expect(stdout).toBe('');
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
      if (packDir) {
        await rm(packDir, { recursive: true, force: true });
      }
    }
  }, 60000);
});
