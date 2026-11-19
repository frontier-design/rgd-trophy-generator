/**
 * Convert modifier endpoints from percentages to an ordered band of height shares,
 * measured from the solid's top (0) to its bottom (1). Endpoints are clamped
 * independently before ordering; a zero-width band remains zero-width.
 */
export function modifierRange(from: number, to: number): { from: number; to: number } {
  const share = (percent: number) => Math.min(Math.max(percent / 100, 0), 1)
  const a = share(from)
  const b = share(to)
  return { from: Math.min(a, b), to: Math.max(a, b) }
}
