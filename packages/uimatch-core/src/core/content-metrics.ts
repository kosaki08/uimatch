export function calculateContentDiffRatio(
  diffPixelCount: number,
  contentPixels: number
): number | undefined {
  return contentPixels > 0 ? diffPixelCount / contentPixels : undefined;
}
