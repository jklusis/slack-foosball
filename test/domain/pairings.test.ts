import { describe, expect, it } from "vitest"
import { pairings, randomTeams, singlesMatch } from "../../src/domain/pairings"
import type { FourPlayers } from "../../src/domain/types"
import { player } from "../helpers"

describe("pairings", () => {
  it("partners every player with every other player once", () => {
    const players: FourPlayers = [
      player("A"),
      player("B"),
      player("C"),
      player("D"),
    ]
    const rounds = pairings(players)
    const partners = rounds.flatMap((round) => [
      pair(round.home[0].userId, round.home[1].userId),
      pair(round.away[0].userId, round.away[1].userId),
    ])
    expect(partners.sort()).toEqual(["A:B", "A:C", "A:D", "B:C", "B:D", "C:D"])
    expect(rounds.every((round) => round.winner === null)).toBe(true)
  })

  it("pairs a 1v1 in join order", () => {
    const [round] = singlesMatch([player("A"), player("B")])
    expect(round?.home.map((item) => item.userId)).toEqual(["A"])
    expect(round?.away.map((item) => item.userId)).toEqual(["B"])
    expect(round?.winner).toBeNull()
  })

  it("draws random 2v2 teams with each of the three splits equally likely", () => {
    const players: FourPlayers = [player("A"), player("B"), player("C"), player("D")]
    const splits = new Map<string, number>()
    for (const draws of everyShuffle()) {
      const [round] = randomTeams(players, sequence(draws))
      const ids = [...round.home, ...round.away].map((item) => item.userId)
      expect([...ids].sort()).toEqual(["A", "B", "C", "D"])
      expect(round.winner).toBeNull()
      const split = [pair(round.home[0].userId, round.home[1].userId), pair(round.away[0].userId, round.away[1].userId)]
        .sort()
        .join(" vs ")
      splits.set(split, (splits.get(split) ?? 0) + 1)
    }
    expect([...splits.entries()].sort()).toEqual([
      ["A:B vs C:D", 8],
      ["A:C vs B:D", 8],
      ["A:D vs B:C", 8],
    ])
  })
})

// One draw per swap of a four-player shuffle, covering every outcome once.
function everyShuffle(): number[][] {
  const draws: number[][] = []
  for (let first = 0; first < 4; first += 1) {
    for (let second = 0; second < 3; second += 1) {
      for (let third = 0; third < 2; third += 1) {
        draws.push([(first + 0.5) / 4, (second + 0.5) / 3, (third + 0.5) / 2])
      }
    }
  }
  return draws
}

function sequence(values: number[]): () => number {
  let index = 0
  return () => {
    const value = values[index]
    index += 1
    if (value === undefined) throw new Error("ran out of draws")
    return value
  }
}

function pair(left: string, right: string): string {
  return [left, right].sort().join(":")
}
