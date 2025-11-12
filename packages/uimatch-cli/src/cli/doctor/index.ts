/**
 * Main doctor command implementation
 */

import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import path from 'node:path';
import { outln } from '../print.js';
import { getSelectedChecks } from './checks/index.js';
import { formatReport } from './format.js';
import type { DoctorCheckResult, DoctorOptions, DoctorReport } from './types.js';

function parseArgs(args: string[]): DoctorOptions {
  const options: DoctorOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--quick':
        options.quick = true;
        break;
      case '--deep':
        options.deep = true;
        break;
      case '--strict':
        options.strict = true;
        break;
      case '--offline':
        options.offline = true;
        break;
      case '--fix':
        options.fix = true;
        break;
      case '--ci':
        options.ci = true;
        // CI implies: strict, json format, quiet
        options.strict = true;
        if (!options.format) options.format = 'json';
        break;
      case '--format':
        i++;
        options.format = args[i] as DoctorOptions['format'];
        break;
      case '--out-dir':
        i++;
        options.outDir = args[i];
        break;
      case '--report-name':
        i++;
        options.reportName = args[i];
        break;
      case '--select': {
        i++;
        const categoriesStr = args[i];
        if (categoriesStr) {
          options.select = categoriesStr.split(',') as DoctorOptions['select'];
        }
        break;
      }
      case '--keep': {
        i++;
        const keepStr = args[i];
        if (keepStr) {
          options.keep = parseInt(keepStr, 10);
        }
        break;
      }
    }
  }

  return options;
}

function calculateScore(results: DoctorCheckResult[]): number {
  const failed = results.filter((r) => r.status === 'fail').length;
  const warnings = results.filter((r) => r.status === 'warn').length;

  // Score calculation: start at 100, deduct points for failures and warnings
  const failPenalty = failed * 30;
  const warnPenalty = warnings * 10;

  return Math.max(0, 100 - failPenalty - warnPenalty);
}

function getRunId(): string {
  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/:/g, '-')
    .replace(/\.\d{3}Z$/, 'Z')
    .replace('T', '_');
  const host = hostname()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-');

  // Get short SHA if in git repo
  try {
    const sha = execSync('git rev-parse --short HEAD', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return `${timestamp}_${host}_${sha}`;
  } catch {
    return `${timestamp}_${host}`;
  }
}

export async function runDoctor(args: string[]): Promise<void> {
  const options = parseArgs(args);

  // Show help if requested
  if (args.includes('--help') || args.includes('-h')) {
    outln('uiMatch Doctor - Environment and configuration checker');
    outln('');
    outln('Usage: uimatch doctor [options]');
    outln('');
    outln('Options:');
    outln('  --quick              Quick check (env + playwright only)');
    outln('  --deep               Deep check (all categories)');
    outln('  --strict             Treat warnings as failures');
    outln('  --offline            Skip checks requiring network');
    outln('  --fix                Auto-fix issues when possible');
    outln('  --ci                 CI mode (strict + json + quiet)');
    outln('  --format <format>    Output format: table|markdown|json|sarif|junit');
    outln('  --out-dir <dir>      Output directory (default: uimatch-out/doctor)');
    outln('  --report-name <name> Report filename (default: report.json)');
    outln(
      '  --select <cats>      Check categories: env,playwright,figma,anchors,config,cache,git,fs,external'
    );
    outln('  --keep <n>           Keep last N reports (cleanup old runs)');
    outln('');
    process.exit(0);
  }

  const cwd = process.cwd();
  const format = options.format || (options.ci ? 'json' : 'table');
  const logger = options.ci ? () => {} : outln;

  // Get checks to run based on flags
  const ALL_CATEGORIES: DoctorOptions['select'] = [
    'env',
    'playwright',
    'figma',
    'anchors',
    'config',
    'cache',
    'git',
    'fs',
    'external',
  ];

  const selectCategories = options.select
    ? options.select
    : options.deep
      ? ALL_CATEGORIES
      : options.quick
        ? (['env', 'playwright'] as DoctorOptions['select'])
        : undefined; // Default: env + playwright (handled by getSelectedChecks)

  const selectedChecks = getSelectedChecks(selectCategories);
  const allResults: DoctorCheckResult[] = [];

  if (!options.ci) {
    process.stdout.write('Running uiMatch Doctor...\n');
  }

  // Run all checks
  for (const { category, checks } of selectedChecks) {
    if (!options.ci) {
      process.stdout.write(`[${category.toUpperCase()}]` + '\n');
    }

    for (const check of checks) {
      const ctx = {
        cwd,
        offline: !!options.offline,
        fix: !!options.fix,
        logger,
      };

      const result = await check(ctx);
      allResults.push(result);

      if (!options.ci) {
        const icon =
          result.status === 'pass'
            ? '✅'
            : result.status === 'warn'
              ? '⚠️'
              : result.status === 'fail'
                ? '❌'
                : '⏭️';
        process.stdout.write(`  ${icon} ${result.title}` + '\n');
      }
    }

    if (!options.ci) {
      process.stdout.write('' + '\n');
    }
  }

  // Create report
  const packageJson = JSON.parse(readFileSync(path.join(cwd, 'package.json'), 'utf-8')) as {
    workspaces?: unknown;
    version?: string;
  };
  const version = packageJson.workspaces
    ? (
        JSON.parse(readFileSync(path.join(cwd, 'packages/@uimatch/cli/package.json'), 'utf-8')) as {
          version?: string;
        }
      ).version
    : packageJson.version;

  const report: DoctorReport = {
    reportVersion: '1.0.0',
    generator: {
      name: 'uimatch-cli',
      version: version ?? '0.0.0',
    },
    timestamp: new Date().toISOString(),
    summary: {
      passed: allResults.filter((r) => r.status === 'pass').length,
      warnings: allResults.filter((r) => r.status === 'warn').length,
      failed: allResults.filter((r) => r.status === 'fail').length,
      skipped: allResults.filter((r) => r.status === 'skip').length,
      score: calculateScore(allResults),
    },
    checks: allResults,
  };

  // Format and output
  const formatted = formatReport(report, format);

  // Console output for table/markdown
  if (format === 'table' || format === 'markdown') {
    process.stdout.write(formatted + '\n');
  }

  // File output
  if (format === 'json' || format === 'sarif' || format === 'junit' || options.outDir) {
    const baseDir = path.resolve(options.outDir || 'uimatch-out/doctor');
    const runId = getRunId();
    const runDir = path.join(baseDir, runId);

    mkdirSync(runDir, { recursive: true });

    const reportName = options.reportName || 'report.json';
    const reportPath = path.join(runDir, reportName);

    writeFileSync(reportPath, formatted, 'utf-8');

    if (!options.ci) {
      process.stdout.write(`\nReport saved to: ${reportPath}`);
    }

    // Rotate old reports if --keep is set
    if (options.keep && options.keep > 0) {
      try {
        const { readdirSync, statSync, rmSync } = await import('node:fs');
        const dirs = readdirSync(baseDir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => ({
            name: d.name,
            mtime: statSync(path.join(baseDir, d.name)).mtimeMs,
          }))
          .sort((a, b) => b.mtime - a.mtime); // Sort by newest first

        const toDelete = dirs.slice(options.keep);
        for (const d of toDelete) {
          rmSync(path.join(baseDir, d.name), { recursive: true, force: true });
        }

        if (!options.ci && toDelete.length > 0) {
          process.stdout.write(`Cleaned up ${toDelete.length} old report(s)` + '\n');
        }
      } catch {
        // Best-effort cleanup, don't fail if it doesn't work
      }
    }
  }

  // Exit code
  const strict = options.strict || options.ci;
  const failed = report.summary.failed;
  const warnings = report.summary.warnings;

  const exitCode = failed > 0 ? 2 : strict && warnings > 0 ? 1 : 0;

  if (!options.ci) {
    process.stdout.write(`\nScore: ${report.summary.score}/100`);
    if (exitCode > 0) {
      process.stdout.write(`Exit code: ${exitCode}` + '\n');
    }
  }

  process.exit(exitCode);
}
