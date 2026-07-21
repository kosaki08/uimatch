#!/usr/bin/env node
/**
 * Guard the runnable examples in user-facing docs.
 *
 * Only fenced code blocks are checked: prose may (and does) quote the wrong
 * forms on purpose, for example the troubleshooting entry that explains why
 * `npx uimatch` fails.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const FORBIDDEN = [
  {
    pattern: /\?path=\/story\//,
    reason: 'Storybook Canvas URL. Use iframe.html?id=<story-id> instead.',
  },
  {
    pattern: /#root button/,
    reason: 'Storybook 6 root id. Use #storybook-root instead.',
  },
  {
    pattern: /npx uimatch[- ]/,
    reason: 'Bare npx name is not a published package. Use npx @uimatch/cli or npx -p <pkg> <bin>.',
  },
];

const FENCE = /^\s*(```|~~~)/;

/** Generated API reference is rebuilt from sources, so it is not a review surface. */
const EXCLUDED_DIRECTORIES = new Set(['api']);

async function collectMarkdown(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      files.push(...(await collectMarkdown(join(directory, entry.name))));
    } else if (entry.name.endsWith('.md')) {
      files.push(join(directory, entry.name));
    }
  }

  return files;
}

async function findViolations(file) {
  const lines = (await readFile(file, 'utf8')).split('\n');
  const violations = [];
  let inFence = false;

  for (const [index, line] of lines.entries()) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) continue;

    for (const { pattern, reason } of FORBIDDEN) {
      if (pattern.test(line)) {
        violations.push(`${file}:${index + 1}: ${reason}\n    ${line.trim()}`);
      }
    }
  }

  return violations;
}

const packageDirectories = await readdir('packages', { withFileTypes: true });
const files = [
  'README.md',
  ...(await collectMarkdown('docs/docs')),
  ...packageDirectories
    .filter((entry) => entry.isDirectory())
    .map((entry) => join('packages', entry.name, 'README.md')),
];

const violations = (
  await Promise.all(
    files.map(async (file) => {
      try {
        return await findViolations(file);
      } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
      }
    })
  )
).flat();

if (violations.length > 0) {
  console.error('Forbidden example patterns found in documentation:\n');
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log(`✅ Checked ${files.length} documentation files`);
