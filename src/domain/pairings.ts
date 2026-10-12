import type { FourPlayers, RoundOf, ThreeRounds, TwoPlayers } from "./types"

export function matchRound(home: TwoPlayers, away: TwoPlayers): [RoundOf<"match">] {
  return [{ home, away, winner: null }]
}

export function pairings(players: FourPlayers): ThreeRounds {
  const [first, second, third, fourth] = players
  return [
    { home: [first, second], away: [third, fourth], winner: null },
    { home: [first, third], away: [second, fourth], winner: null },
    { home: [first, fourth], away: [second, third], winner: null },
  ]
}

export function singlesMatch(players: TwoPlayers): [RoundOf<"singles">] {
  const [home, away] = players
  return [{ home: [home], away: [away], winner: null }]
}
