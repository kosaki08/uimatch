/**
 * Main doctor command implementation
 */

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { hostname } from 'os';
import path from 'path';
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
    const { execSync } = require('child_process');
    const sha = execSync('git rev-parse --short HEAD 2>/dev/null', { encoding: 'utf-8' }).trim();
    return `${timestamp}_${host}_${sha}`;
  } catch {
    return `${timestamp}_${host}`;
  }
}

export async function runDoctor(args: string[]): Promise<void> {
  const options = parseArgs(args);

  // Show help if requested
  if (args.includes('--help') || args.includes('-h')) {
    console.log('uiMatch Doctor - Environment and configuration checker');
    console.log('');
    console.log('Usage: uimatch doctor [options]');
    console.log('');
    console.log('Options:');
    console.log('  --quick              Quick check (env + playwright only)');
    console.log('  --deep               Deep check (all categories)');
    console.log('  --strict             Treat warnings as failures');
    console.log('  --offline            Skip checks requiring network');
    console.log('  --fix                Auto-fix issues when possible');
    console.log('  --ci                 CI mode (strict + json + quiet)');
    console.log('  --format <format>    Output format: table|markdown|json|sarif|junit');
    console.log('  --out-dir <dir>      Output directory (default: uimatch-out/doctor)');
    console.log('  --report-name <name> Report filename (default: report.json)');
    console.log(
      '  --select <cats>      Check categories: env,playwright,figma,anchors,config,cache,git,fs,external'
    );
    console.log('  --keep <n>           Keep last N reports (cleanup old runs)');
    console.log('');
    process.exit(0);
  }

  const cwd = process.cwd();
  const format = options.format || (options.ci ? 'json' : 'table');
  const logger = options.ci ? () => {} : console.log;

  // Get checks to run
  const selectedChecks = getSelectedChecks(options.select);
  const allResults: DoctorCheckResult[] = [];

  if (!options.ci) {
    console.log('Running uiMatch Doctor...\n');
  }

  // Run all checks
  for (const { category, checks } of selectedChecks) {
    if (!options.ci) {
      console.log(`[${category.toUpperCase()}]`);
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
        console.log(`  ${icon} ${result.title}`);
      }
    }

    if (!options.ci) {
      console.log('');
    }
  }

  // Create report
  const packageJson = JSON.parse(readFileSync(path.join(cwd, 'package.json'), 'utf-8'));
  const version = packageJson.workspaces
    ? JSON.parse(readFileSync(path.join(cwd, 'packages/uimatch-plugin/package.json'), 'utf-8'))
        .version
    : packageJson.version;

  const report: DoctorReport = {
    reportVersion: '1.0.0',
    generator: {
      name: 'uimatch-cli',
      version,
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
    console.log(formatted);
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
      console.log(`\nReport saved to: ${reportPath}`);
    }
  }

  // Exit code
  const strict = options.strict || options.ci;
  const failed = report.summary.failed;
  const warnings = report.summary.warnings;

  const exitCode = failed > 0 ? 2 : strict && warnings > 0 ? 1 : 0;

  if (!options.ci) {
    console.log(`\nScore: ${report.summary.score}/100`);
    if (exitCode > 0) {
      console.log(`Exit code: ${exitCode}`);
    }
  }

  process.exit(exitCode);
}
