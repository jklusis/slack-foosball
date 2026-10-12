import type { PlayerStanding } from "./types"

export function rankStandings(standings: readonly PlayerStanding[]): PlayerStanding[] {
  return [...standings].sort((left, right) => {
    if (right.elo !== left.elo) return right.elo - left.elo
    if (right.wins !== left.wins) return right.wins - left.wins
    const byName = left.displayName.localeCompare(right.displayName)
    if (byName !== 0) return byName
    return left.userId.localeCompare(right.userId)
  })
}
