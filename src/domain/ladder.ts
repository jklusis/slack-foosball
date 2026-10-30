import type { Ladder, PlayerStanding } from "./types"

const dayMs = 24 * 60 * 60 * 1000

export function rankStandings(standings: readonly PlayerStanding[]): PlayerStanding[] {
  return [...standings].sort((left, right) => {
    if (right.elo !== left.elo) return right.elo - left.elo
    if (right.wins !== left.wins) return right.wins - left.wins
    const byName = left.displayName.localeCompare(right.displayName)
    if (byName !== 0) return byName
    return left.userId.localeCompare(right.userId)
  })
}

// A player with no recorded game time is treated as inactive.
export function activeLadder(ladder: Ladder, now: number, inactiveDays: number): Ladder {
  const since = now - inactiveDays * dayMs
  const isActive = (standing: PlayerStanding) =>
    standing.lastPlayedAt !== undefined && standing.lastPlayedAt > since
  return { doubles: ladder.doubles.filter(isActive), singles: ladder.singles.filter(isActive) }
}
