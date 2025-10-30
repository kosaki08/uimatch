/**
 * Quality gate profiles for different comparison scenarios
 */

export interface QualityGateProfile {
  name: string;
  description: string;
  thresholds: {
    /**
     * Pixel difference ratio threshold (0-1)
     * Uses pixelDiffRatioContent when available, falls back to pixelDiffRatio
     */
    pixelDiffRatio: number;
    /**
     * Color delta E average threshold
     */
    deltaE: number;
    /**
     * Maximum allowed high-severity style issues
     */
    maxHighSeverityIssues: number;
    /**
     * Maximum allowed layout category high-severity issues
     */
    maxLayoutHighIssues: number;
    /**
     * Critical area gap threshold for immediate failure (0-1)
     * When exceeded, quality gate immediately fails regardless of other metrics
     * @default 0.15 (15% area difference)
     */
    areaGapCritical?: number;
    /**
     * Warning area gap threshold (0-1)
     * When exceeded, adds warning to quality gate reasons
     * @default 0.05 (5% area difference)
     */
    areaGapWarning?: number;
  };
  /**
   * Content basis to use for comparison (affects contentRect calculation)
   */
  contentBasis?: 'union' | 'intersection';
  /**
   * Enable automatic re-evaluation for pad mode with union basis
   * When true, the system will recommend intersection basis if suspicions are detected
   * @default true
   */
  autoReEvaluate?: boolean;
}

/**
 * Pre-defined quality gate profiles for common scenarios
 */
export const QUALITY_GATE_PROFILES: Record<string, QualityGateProfile> = {
  /**
   * Strict component comparison - for pixel-perfect design system components
   * Best for: Design system library components, marketing pages, exact replicas
   */
  'component/strict': {
    name: 'Component (Strict)',
    description: 'Pixel-perfect comparison for design system components',
    thresholds: {
      pixelDiffRatio: 0.01, // 1%
      deltaE: 3.0,
      maxHighSeverityIssues: 0,
      maxLayoutHighIssues: 0,
      areaGapCritical: 0.15, // 15% area difference fails immediately
      areaGapWarning: 0.05, // 5% area difference triggers warning
    },
    autoReEvaluate: true,
  },

  /**
   * Development component comparison - for iterative development
   * Best for: Development workflow, incremental improvements
   */
  'component/dev': {
    name: 'Component (Development)',
    description: 'Relaxed thresholds for iterative development',
    thresholds: {
      pixelDiffRatio: 0.08, // 8%
      deltaE: 5.0,
      maxHighSeverityIssues: 0,
      maxLayoutHighIssues: 0,
      areaGapCritical: 0.2, // 20% area difference (more lenient for dev)
      areaGapWarning: 0.08, // 8% area difference warning
    },
    autoReEvaluate: true,
  },

  /**
   * Page vs component (padded) comparison - for full-page screenshots with padding
   * Best for: Comparing isolated components against full page context
   * Uses intersection content basis by default
   */
  'page-vs-component': {
    name: 'Page vs Component (Padded)',
    description: 'Comparison accounting for padding/letterboxing',
    thresholds: {
      pixelDiffRatio: 0.12, // 12% (content basis)
      deltaE: 5.0,
      maxHighSeverityIssues: 2,
      maxLayoutHighIssues: 0, // Layout issues are critical even with padding
      areaGapCritical: 0.25, // 25% area difference (lenient due to padding)
      areaGapWarning: 0.12, // 12% area difference warning
    },
    contentBasis: 'intersection', // Use intersection to exclude padding
    autoReEvaluate: true, // Aggressive re-evaluation for pad scenarios
  },

  /**
   * Lenient profile - for early prototyping and rough drafts
   * Best for: Prototyping, proof-of-concept, initial implementations
   */
  lenient: {
    name: 'Lenient',
    description: 'Very relaxed thresholds for prototyping',
    thresholds: {
      pixelDiffRatio: 0.15, // 15%
      deltaE: 8.0,
      maxHighSeverityIssues: 5,
      maxLayoutHighIssues: 2,
      areaGapCritical: 0.3, // 30% area difference (very lenient)
      areaGapWarning: 0.15, // 15% area difference warning
    },
    autoReEvaluate: false, // Lenient profile doesn't need aggressive re-evaluation
  },

  /**
   * Custom baseline - use config file thresholds
   * This is the default when no profile is specified
   */
  custom: {
    name: 'Custom',
    description: 'Uses thresholds from configuration file',
    thresholds: {
      pixelDiffRatio: 0.01, // Will be overridden by config
      deltaE: 5.0, // Will be overridden by config
      maxHighSeverityIssues: 0, // Will be overridden by config
      maxLayoutHighIssues: 0, // Will be overridden by config
      areaGapCritical: 0.15, // Will be overridden by config
      areaGapWarning: 0.05, // Will be overridden by config
    },
    autoReEvaluate: true, // Will be overridden by config
  },
};

/**
 * Get a quality gate profile by name
 * @param profileName - Profile name or 'custom' for config-based thresholds
 * @returns Quality gate profile
 * @throws Error if profile not found
 */
export function getQualityGateProfile(profileName: string): QualityGateProfile {
  const profile = QUALITY_GATE_PROFILES[profileName];
  if (!profile) {
    throw new Error(
      `Quality gate profile '${profileName}' not found. Available: ${Object.keys(QUALITY_GATE_PROFILES).join(', ')}`
    );
  }
  return profile;
}

/**
 * List all available quality gate profiles
 * @returns Array of profile names with descriptions
 */
export function listQualityGateProfiles(): Array<{ name: string; description: string }> {
  return Object.entries(QUALITY_GATE_PROFILES).map(([key, profile]) => ({
    name: key,
    description: profile.description,
  }));
}
