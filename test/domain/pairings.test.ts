import { describe, expect, it } from "vitest"
import { pairings, singlesMatch } from "../../src/domain/pairings"
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
})

function pair(left: string, right: string): string {
  return [left, right].sort().join(":")
}
