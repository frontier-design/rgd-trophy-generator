// Pure math only: no library imports allowed in material/ (enforced by ESLint).

interface ProfilePoint {
  /** Radius (distance from the revolve axis). */
  x: number
  /** Height, y up. */
  y: number
}

/** A segment counts as an overhang when its normal points at least this much down. */
const DOWNWARD = 0.3

/**
 * Cheap ambient occlusion along a lathe profile: how much each point sits just beneath
 * an overhang (a downward-facing part of the profile that reaches further out than the
 * point). 0 = open, 1 = tucked right under a ledge. Fades out over `reach` px below the
 * ledge and grows with how far the ledge sticks out.
 *
 * The profile must run bottom → top (as `outlineToLatheProfile` returns it): then a
 * segment's outward normal is (dy, -dx), so downward-facing segments are the ones that
 * step outward (dx > 0).
 */
export function ledgeOcclusion(profile: ProfilePoint[], reach: number): number[] {
  const overhangs: { y: number; x: number }[] = []
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i] as ProfilePoint
    const b = profile[i + 1] as ProfilePoint
    const dx = b.x - a.x
    const dy = b.y - a.y
    const length = Math.hypot(dx, dy)
    if (length === 0) continue
    const normalY = -dx / length
    if (normalY <= -DOWNWARD) overhangs.push({ y: Math.min(a.y, b.y), x: Math.max(a.x, b.x) })
  }

  return profile.map((p) => {
    let occlusion = 0
    for (const o of overhangs) {
      const below = o.y - p.y
      const outward = o.x - p.x
      if (below < 0 || below > reach || outward <= 0) continue
      occlusion = Math.max(occlusion, (1 - below / reach) * Math.min(1, outward / reach))
    }
    return occlusion
  })
}
