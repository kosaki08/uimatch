interface ColorDeltaESettings {
  colorDeltaEThreshold: number;
  acceptanceColorDeltaE: number;
}

/** Resolve color thresholds for the style and quality-gate stages. */
export function resolveColorDeltaEThresholds(
  explicitThreshold: number | undefined,
  settings: ColorDeltaESettings
): { style: number; acceptance: number } {
  return {
    style: explicitThreshold ?? settings.colorDeltaEThreshold,
    acceptance: explicitThreshold ?? settings.acceptanceColorDeltaE,
  };
}
