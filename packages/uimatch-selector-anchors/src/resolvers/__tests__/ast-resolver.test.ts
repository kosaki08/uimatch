import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { resolveFromTypeScript } from '../ast-resolver.js';

const tempDirs: string[] = [];

async function writeSource(content: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'uimatch-ast-resolver-'));
  tempDirs.push(directory);
  const file = join(directory, 'component.tsx');
  await writeFile(file, content, 'utf8');
  return file;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('resolveFromTypeScript', () => {
  test('uses TypeScript source positions for CRLF input', async () => {
    const file = await writeSource(
      ['const Component = () =>', '(', '<button data-testid="target" />', ');'].join('\r\n')
    );

    const result = await resolveFromTypeScript(file, 3, 1);

    expect(result?.selectors).toContain('[data-testid="target"]');
  });

  test('validates columns against CRLF line content', async () => {
    const file = await writeSource('abc\r\nx');

    await expect(resolveFromTypeScript(file, 1, 3)).resolves.not.toBeNull();
    await expect(resolveFromTypeScript(file, 2, 0)).resolves.not.toBeNull();
    await expect(resolveFromTypeScript(file, 1, 4)).rejects.toThrow(RangeError);
  });

  test.each([
    [0, 0],
    [1.5, 0],
    [1, -1],
    [1, 0.5],
    [10, 0],
    [1, 1_000],
  ])('rejects an invalid source position at line %p, column %p', async (line, col) => {
    const file = await writeSource('<button />');

    try {
      await resolveFromTypeScript(file, line, col);
      throw new Error('Expected source position validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(RangeError);
    }
  });
});
