import { requireFour } from "./types"
import type { FourPlayers, Player, RoundOf, ThreeRounds, TwoPlayers } from "./types"

export function matchRound(home: TwoPlayers, away: TwoPlayers): [RoundOf<"match">] {
  return [{ home, away, winner: null }]
}

// Fisher-Yates over all four players: each of the three team splits is equally likely, and so is
// which team takes the home side. `random` returns a number in [0, 1), like Math.random.
export function randomTeams(players: FourPlayers, random: () => number): [RoundOf<"match">] {
  const order: Player[] = [...players]
  for (let index = order.length - 1; index > 0; index -= 1) {
    const other = Math.min(index, Math.floor(random() * (index + 1)))
    const current = order[index]
    const swapped = order[other]
    if (!current || !swapped) throw new Error("Shuffle out of range")
    order[index] = swapped
    order[other] = current
  }
  const [first, second, third, fourth] = requireFour(order)
  return matchRound([first, second], [third, fourth])
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
