import type { Player, PlayerStanding, Rating, RatingChange, Side } from "./types"

export const STARTING_RATING = 1000
export const K_FACTOR = 32

export function ratingOf(ratings: ReadonlyMap<string, Rating>, userId: string): Rating {
  const found = ratings.get(userId)
  if (!found) return { elo: STARTING_RATING, wins: 0, losses: 0 }
  return { ...found }
}

type ScoredRound = {
  home: readonly Player[]
  away: readonly Player[]
  winner: Side
}

export function rateRound(
  round: ScoredRound,
  ratings: ReadonlyMap<string, Rating>,
): Map<string, Rating> {
  const homeAverage = average(round.home.map((player) => ratingOf(ratings, player.userId).elo))
  const awayAverage = average(round.away.map((player) => ratingOf(ratings, player.userId).elo))
  const expectedHome = 1 / (1 + 10 ** ((awayAverage - homeAverage) / 400))
  const homeScore = round.winner === "home" ? 1 : 0
  const homeDelta = Math.round(K_FACTOR * (homeScore - expectedHome))

  const next = new Map<string, Rating>()
  for (const [userId, rating] of ratings) next.set(userId, { ...rating })

  for (const player of round.home) {
    const current = ratingOf(next, player.userId)
    next.set(player.userId, {
      elo: current.elo + homeDelta,
      wins: current.wins + (round.winner === "home" ? 1 : 0),
      losses: current.losses + (round.winner === "away" ? 1 : 0),
    })
  }
  for (const player of round.away) {
    const current = ratingOf(next, player.userId)
    next.set(player.userId, {
      elo: current.elo - homeDelta,
      wins: current.wins + (round.winner === "away" ? 1 : 0),
      losses: current.losses + (round.winner === "home" ? 1 : 0),
    })
  }
  return next
}

export function rateSession(
  players: readonly Player[],
  rounds: readonly ScoredRound[],
  initial: ReadonlyMap<string, Rating>,
): { changes: RatingChange[]; standings: PlayerStanding[] } {
  let current = new Map(initial)
  for (const round of rounds) current = rateRound(round, current)

  const changes = players.map((player) => {
    const before = ratingOf(initial, player.userId)
    const after = ratingOf(current, player.userId)
    return {
      userId: player.userId,
      displayName: player.displayName,
      before: before.elo,
      after: after.elo,
      wins: after.wins,
      losses: after.losses,
    }
  })

  const standings = players.map((player) => {
    const after = ratingOf(current, player.userId)
    return {
      userId: player.userId,
      displayName: player.displayName,
      elo: after.elo,
      wins: after.wins,
      losses: after.losses,
    }
  })

  return { changes, standings }
}

function average(values: number[]): number {
  const total = values.reduce((sum, value) => sum + value, 0)
  return total / values.length
}
