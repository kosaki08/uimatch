/**
 * Anchors checks for uiMatch Doctor
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { DoctorCheck, DoctorCheckContext } from '../types.js';

// Schema for anchors.json validation
const AnchorsSchema = z.object({
  version: z.string().optional(),
  anchors: z.array(
    z.object({
      id: z.string().min(1),
      source: z.object({
        file: z.string(),
        line: z.number().int().positive(),
        col: z.number().int().nonnegative(),
      }),
      hint: z
        .object({
          prefer: z.array(z.enum(['testid', 'role', 'text', 'css'])).optional(),
          expectedText: z.string().optional(),
          testid: z.string().optional(),
          role: z.string().optional(),
          ariaLabel: z.string().optional(),
        })
        .optional(),
      snippetHash: z.string().optional(),
      snippet: z.string().optional(),
      snippetContext: z
        .object({
          contextBefore: z.number().int().nonnegative().optional(),
          contextAfter: z.number().int().nonnegative().optional(),
          algorithm: z.enum(['sha1', 'sha256', 'md5']).optional(),
          hashDigits: z.number().int().min(6).max(64).optional(),
        })
        .optional(),
      subselector: z.string().optional(),
      resolvedCss: z.string().nullable().optional(),
      lastSeen: z.string().nullable().optional(),
      lastKnown: z
        .object({
          selector: z.string(),
          stabilityScore: z.number().min(0).max(100).optional(),
          timestamp: z.string().optional(),
        })
        .optional(),
      meta: z.record(z.string(), z.unknown()).optional(),
    })
  ),
});

/**
 * Check if anchors.json exists
 */
export const checkAnchorsExists: DoctorCheck = async (ctx: DoctorCheckContext) => {
  const start = performance.now();
  const anchorsPath = path.join(ctx.cwd, 'anchors.json');

  try {
    await fs.access(anchorsPath);
    return {
      id: 'anchors-exists',
      title: 'Anchors file exists',
      status: 'pass',
      severity: 'low',
      durationMs: performance.now() - start,
      details: `Found anchors.json at: ${anchorsPath}`,
      category: 'anchors',
    };
  } catch {
    return {
      id: 'anchors-exists',
      title: 'Anchors file exists',
      status: 'warn',
      severity: 'low',
      durationMs: performance.now() - start,
      details: `No anchors.json found. Create one with: npx uimatch-anchors --file <source> --line <line> --id <id>`,
      category: 'anchors',
    };
  }
};

/**
 * Validate anchors.json schema
 */
export const checkAnchorsSchema: DoctorCheck = async (ctx: DoctorCheckContext) => {
  const start = performance.now();
  const anchorsPath = path.join(ctx.cwd, 'anchors.json');

  try {
    const content = await fs.readFile(anchorsPath, 'utf-8');
    const data: unknown = JSON.parse(content);

    // Validate with Zod schema
    const result = AnchorsSchema.safeParse(data);

    if (!result.success) {
      const errors = result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('\n  ');
      return {
        id: 'anchors-schema',
        title: 'Anchors schema validation',
        status: 'fail',
        severity: 'high',
        durationMs: performance.now() - start,
        details: `Invalid anchors.json schema:\n  ${errors}`,
        category: 'anchors',
      };
    }

    const anchorCount = result.data.anchors.length;
    return {
      id: 'anchors-schema',
      title: 'Anchors schema validation',
      status: 'pass',
      severity: 'medium',
      durationMs: performance.now() - start,
      details: `Valid schema with ${anchorCount} anchor(s)`,
      category: 'anchors',
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        id: 'anchors-schema',
        title: 'Anchors schema validation',
        status: 'skip',
        severity: 'low',
        durationMs: performance.now() - start,
        details: 'No anchors.json found',
        category: 'anchors',
      };
    }

    return {
      id: 'anchors-schema',
      title: 'Anchors schema validation',
      status: 'fail',
      severity: 'high',
      durationMs: performance.now() - start,
      details: `Failed to parse anchors.json: ${(error as Error).message}`,
      category: 'anchors',
    };
  }
};

/**
 * Check for duplicate anchor IDs
 */
export const checkAnchorsDuplicates: DoctorCheck = async (ctx: DoctorCheckContext) => {
  const start = performance.now();
  const anchorsPath = path.join(ctx.cwd, 'anchors.json');

  try {
    const content = await fs.readFile(anchorsPath, 'utf-8');
    const data: unknown = JSON.parse(content);

    // Validate with Zod schema
    const result = AnchorsSchema.safeParse(data);

    if (!result.success) {
      return {
        id: 'anchors-duplicates',
        title: 'Check duplicate anchor IDs',
        status: 'skip',
        severity: 'low',
        durationMs: performance.now() - start,
        details: 'Invalid anchors.json schema',
        category: 'anchors',
      };
    }

    const ids = result.data.anchors.map((a) => a.id);
    const duplicates = ids.filter((id, idx) => ids.indexOf(id) !== idx);

    if (duplicates.length > 0) {
      return {
        id: 'anchors-duplicates',
        title: 'Check duplicate anchor IDs',
        status: 'fail',
        severity: 'high',
        durationMs: performance.now() - start,
        details: `Found duplicate IDs: ${[...new Set(duplicates)].join(', ')}`,
        category: 'anchors',
      };
    }

    return {
      id: 'anchors-duplicates',
      title: 'Check duplicate anchor IDs',
      status: 'pass',
      severity: 'medium',
      durationMs: performance.now() - start,
      details: `All ${ids.length} anchor IDs are unique`,
      category: 'anchors',
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        id: 'anchors-duplicates',
        title: 'Check duplicate anchor IDs',
        status: 'skip',
        severity: 'low',
        durationMs: performance.now() - start,
        details: 'No anchors.json found',
        category: 'anchors',
      };
    }

    return {
      id: 'anchors-duplicates',
      title: 'Check duplicate anchor IDs',
      status: 'fail',
      severity: 'medium',
      durationMs: performance.now() - start,
      details: `Failed to check duplicates: ${(error as Error).message}`,
      category: 'anchors',
    };
  }
};

export const anchorsChecks: DoctorCheck[] = [
  checkAnchorsExists,
  checkAnchorsSchema,
  checkAnchorsDuplicates,
];
