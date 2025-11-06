/**
 * Output formatters for doctor reports
 */

import type { DoctorFormat, DoctorReport } from './types.js';

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'pass':
      return '✅';
    case 'warn':
      return '⚠️';
    case 'fail':
      return '❌';
    case 'skip':
      return '⏭️';
    default:
      return '❔';
  }
}

export function formatTable(report: DoctorReport): string {
  const lines: string[] = [];

  lines.push('\nuiMatch Doctor Report');
  lines.push('='.repeat(50));
  lines.push('');

  // Summary
  const { passed, warnings, failed, skipped, score } = report.summary;
  lines.push(`Score: ${score}/100`);
  lines.push(`Passed: ${passed} | Warnings: ${warnings} | Failed: ${failed} | Skipped: ${skipped}`);
  lines.push('');

  // Group checks by category
  const categories = new Map<string, typeof report.checks>();
  for (const check of report.checks) {
    if (!categories.has(check.category)) {
      categories.set(check.category, []);
    }
    const categoryChecks = categories.get(check.category);
    if (categoryChecks) {
      categoryChecks.push(check);
    }
  }

  // Output by category
  for (const [category, checks] of categories) {
    lines.push(`[${category.toUpperCase()}]`);
    for (const check of checks) {
      const icon = getStatusIcon(check.status);
      const time =
        check.durationMs < 1000
          ? `${check.durationMs}ms`
          : `${(check.durationMs / 1000).toFixed(1)}s`;
      lines.push(`  ${icon} ${check.title} (${time})`);
      if (check.details && (check.status === 'fail' || check.status === 'warn')) {
        const detailLines = check.details.split('\n');
        for (const line of detailLines) {
          lines.push(`     ${line}`);
        }
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function formatMarkdown(report: DoctorReport): string {
  const lines: string[] = [];

  lines.push('# uiMatch Doctor Report\n');
  lines.push(`Generated: ${new Date(report.timestamp).toLocaleString()}\n`);

  // Summary
  const { passed, warnings, failed, skipped, score } = report.summary;
  lines.push('## Summary\n');
  lines.push(`**Score:** ${score}/100\n`);
  lines.push(`- ✅ Passed: ${passed}`);
  lines.push(`- ⚠️ Warnings: ${warnings}`);
  lines.push(`- ❌ Failed: ${failed}`);
  lines.push(`- ⏭️ Skipped: ${skipped}\n`);

  // Group checks by category
  const categories = new Map<string, typeof report.checks>();
  for (const check of report.checks) {
    if (!categories.has(check.category)) {
      categories.set(check.category, []);
    }
    const categoryChecks = categories.get(check.category);
    if (categoryChecks) {
      categoryChecks.push(check);
    }
  }

  // Output by category
  lines.push('## Checks\n');
  for (const [category, checks] of categories) {
    lines.push(`### ${category.toUpperCase()}\n`);
    for (const check of checks) {
      const icon = getStatusIcon(check.status);
      const time =
        check.durationMs < 1000
          ? `${check.durationMs}ms`
          : `${(check.durationMs / 1000).toFixed(1)}s`;
      lines.push(`${icon} **${check.title}** (${time}, severity: ${check.severity})\n`);
      if (check.details) {
        lines.push('```');
        lines.push(check.details);
        lines.push('```\n');
      }
    }
  }

  return lines.join('\n');
}

export function formatJSON(report: DoctorReport): string {
  return JSON.stringify(report, null, 2);
}

export function formatSARIF(report: DoctorReport): string {
  // SARIF (Static Analysis Results Interchange Format) for CI tools
  const sarif = {
    version: '2.1.0',
    $schema:
      'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    runs: [
      {
        tool: {
          driver: {
            name: report.generator.name,
            version: report.generator.version,
            informationUri: 'https://github.com/your-org/ui-match',
          },
        },
        results: report.checks
          .filter((c) => c.status === 'fail' || c.status === 'warn')
          .map((check) => ({
            ruleId: check.id,
            level: check.status === 'fail' ? 'error' : 'warning',
            message: {
              text: check.title,
            },
            properties: {
              severity: check.severity,
              category: check.category,
              details: check.details,
            },
          })),
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}

export function formatJUnit(report: DoctorReport): string {
  // JUnit XML format for CI systems
  const testsuites = report.checks.reduce(
    (acc, check) => {
      if (!acc[check.category]) {
        acc[check.category] = [];
      }
      const categoryChecks = acc[check.category];
      if (categoryChecks) {
        categoryChecks.push(check);
      }
      return acc;
    },
    {} as Record<string, typeof report.checks>
  );

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<testsuites>');

  for (const [category, checks] of Object.entries(testsuites)) {
    const failures = checks.filter((c) => c.status === 'fail').length;
    const errors = 0;
    const skipped = checks.filter((c) => c.status === 'skip').length;
    const time = checks.reduce((sum, c) => sum + c.durationMs, 0) / 1000;

    lines.push(
      `  <testsuite name="${xmlEscape(category)}" tests="${checks.length}" failures="${failures}" errors="${errors}" skipped="${skipped}" time="${time.toFixed(3)}">`
    );

    for (const check of checks) {
      const time = check.durationMs / 1000;
      lines.push(`    <testcase name="${xmlEscape(check.title)}" time="${time.toFixed(3)}">`);

      if (check.status === 'fail') {
        lines.push(`      <failure message="${xmlEscape(check.title)}">`);
        if (check.details) {
          lines.push(`        <![CDATA[${check.details}]]>`);
        }
        lines.push('      </failure>');
      } else if (check.status === 'skip') {
        lines.push('      <skipped/>');
      }

      lines.push('    </testcase>');
    }

    lines.push('  </testsuite>');
  }

  lines.push('</testsuites>');

  return lines.join('\n');
}

export function formatReport(report: DoctorReport, format: DoctorFormat): string {
  switch (format) {
    case 'table':
      return formatTable(report);
    case 'markdown':
      return formatMarkdown(report);
    case 'json':
      return formatJSON(report);
    case 'sarif':
      return formatSARIF(report);
    case 'junit':
      return formatJUnit(report);
    default:
      return formatTable(report);
  }
}
