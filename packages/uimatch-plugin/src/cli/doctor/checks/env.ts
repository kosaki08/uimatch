/**
 * Environment checks - Node/Bun runtime, OS, memory, CPU
 */

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await, @typescript-eslint/no-unused-vars */

import type { DoctorCheck } from '../types.js';

export const checkRuntime: DoctorCheck = async (ctx) => {
  const t0 = Date.now();
  try {
    const bunVersion = (process.versions as { bun?: string }).bun;
    const nodeVersion = process.versions.node;
    const runtime = bunVersion ? `Bun ${bunVersion}` : `Node ${nodeVersion}`;

    const details = [
      `Runtime: ${runtime}`,
      `Platform: ${process.platform}`,
      `Arch: ${process.arch}`,
      `CPUs: ${require('os').cpus().length}`,
      `Memory: ${Math.round(require('os').totalmem() / 1024 / 1024 / 1024)}GB`,
    ].join('\n');

    return {
      id: 'env:runtime',
      title: 'Runtime environment',
      status: 'pass',
      severity: 'medium',
      durationMs: Date.now() - t0,
      details,
      category: 'env',
    };
  } catch (e) {
    return {
      id: 'env:runtime',
      title: 'Runtime environment',
      status: 'fail',
      severity: 'critical',
      durationMs: Date.now() - t0,
      details: String(e),
      category: 'env',
    };
  }
};

export const checkEngines: DoctorCheck = async (ctx) => {
  const t0 = Date.now();
  try {
    const packageJsonPath = `${ctx.cwd}/package.json`;
    const { readFileSync, existsSync } = await import('fs');

    if (!existsSync(packageJsonPath)) {
      return {
        id: 'env:engines',
        title: 'package.json engines check',
        status: 'skip',
        severity: 'low',
        durationMs: Date.now() - t0,
        details: 'package.json not found',
        category: 'env',
      };
    }

    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    if (!pkg.engines) {
      return {
        id: 'env:engines',
        title: 'package.json engines check',
        status: 'skip',
        severity: 'low',
        durationMs: Date.now() - t0,
        details: 'No engines field in package.json',
        category: 'env',
      };
    }

    const nodeVersion = process.versions.node;
    const requiredNode = pkg.engines.node;

    if (requiredNode) {
      // Simple version comparison without semver dependency
      // Just check major version for basic compliance
      const firstPart = nodeVersion.split('.')[0];
      if (firstPart) {
        const currentMajor = parseInt(firstPart, 10);
        const requiredMajorMatch = requiredNode.match(/(\d+)/);
        if (requiredMajorMatch && requiredMajorMatch[1]) {
          const requiredMajor = parseInt(requiredMajorMatch[1], 10);
          if (currentMajor < requiredMajor) {
            return {
              id: 'env:engines',
              title: 'package.json engines check',
              status: 'warn',
              severity: 'medium',
              durationMs: Date.now() - t0,
              details: `Node version ${nodeVersion} may not satisfy ${requiredNode}`,
              category: 'env',
            };
          }
        }
      }
    }

    return {
      id: 'env:engines',
      title: 'package.json engines check',
      status: 'pass',
      severity: 'low',
      durationMs: Date.now() - t0,
      details: `Node ${nodeVersion} satisfies ${requiredNode || 'any'}`,
      category: 'env',
    };
  } catch (e) {
    return {
      id: 'env:engines',
      title: 'package.json engines check',
      status: 'fail',
      severity: 'low',
      durationMs: Date.now() - t0,
      details: String(e),
      category: 'env',
    };
  }
};

export const checkEnvVars: DoctorCheck = async (ctx) => {
  const t0 = Date.now();
  try {
    const checks = [
      { key: 'FIGMA_ACCESS_TOKEN', required: false, severity: 'medium' },
      { key: 'FIGMA_MCP_URL', required: false, severity: 'low' },
    ];

    const results = checks.map((check) => {
      const value = process.env[check.key];
      const present = !!value;
      return `${check.key}: ${present ? '✓ present' : '✗ missing'}`;
    });

    const missingRequired = checks.filter((c) => c.required && !process.env[c.key]);

    return {
      id: 'env:vars',
      title: 'Environment variables',
      status: missingRequired.length > 0 ? 'fail' : 'pass',
      severity: 'medium',
      durationMs: Date.now() - t0,
      details: results.join('\n'),
      category: 'env',
    };
  } catch (e) {
    return {
      id: 'env:vars',
      title: 'Environment variables',
      status: 'fail',
      severity: 'medium',
      durationMs: Date.now() - t0,
      details: String(e),
      category: 'env',
    };
  }
};

export const envChecks: DoctorCheck[] = [checkRuntime, checkEngines, checkEnvVars];
