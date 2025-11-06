/**
 * Type definitions for uiMatch Doctor command
 */

import { z } from 'zod';

// Status of individual check
export type DoctorStatus = 'pass' | 'warn' | 'fail' | 'skip';

// Severity level of check
export type DoctorSeverity = 'low' | 'medium' | 'high' | 'critical';

// Output format options
export type DoctorFormat = 'table' | 'markdown' | 'json' | 'sarif' | 'junit';

// Check category
export type DoctorCheckCategory =
  | 'env'
  | 'playwright'
  | 'figma'
  | 'anchors'
  | 'config'
  | 'cache'
  | 'git'
  | 'fs'
  | 'external';

// Context passed to each check
export interface DoctorCheckContext {
  cwd: string;
  offline: boolean;
  fix: boolean;
  logger: (line: string) => void;
}

// Result of individual check
export interface DoctorCheckResult {
  id: string;
  title: string;
  status: DoctorStatus;
  severity: DoctorSeverity;
  durationMs: number;
  details?: string;
  fixApplied?: boolean;
  category: DoctorCheckCategory;
}

// Check function signature
export type DoctorCheck = (ctx: DoctorCheckContext) => Promise<DoctorCheckResult>;

// Report schema
export const DoctorReportSchema = z.object({
  reportVersion: z.string(),
  generator: z.object({
    name: z.string(),
    version: z.string(),
  }),
  timestamp: z.string(),
  summary: z.object({
    passed: z.number(),
    warnings: z.number(),
    failed: z.number(),
    skipped: z.number(),
    score: z.number().min(0).max(100),
  }),
  checks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      status: z.enum(['pass', 'warn', 'fail', 'skip']),
      severity: z.enum(['low', 'medium', 'high', 'critical']),
      durationMs: z.number(),
      details: z.string().optional(),
      fixApplied: z.boolean().optional(),
      category: z.enum([
        'env',
        'playwright',
        'figma',
        'anchors',
        'config',
        'cache',
        'git',
        'fs',
        'external',
      ]),
    })
  ),
});

export type DoctorReport = z.infer<typeof DoctorReportSchema>;

// CLI options
export interface DoctorOptions {
  quick?: boolean;
  deep?: boolean;
  strict?: boolean;
  offline?: boolean;
  format?: DoctorFormat;
  outDir?: string;
  reportName?: string;
  select?: DoctorCheckCategory[];
  fix?: boolean;
  ci?: boolean;
  keep?: number;
}
