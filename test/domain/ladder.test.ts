import { describe, expect, it } from "vitest"
import { rankStandings } from "../../src/domain/ladder"
import type { PlayerStanding } from "../../src/domain/types"

function standing(
  userId: string,
  elo: number,
  wins: number,
  displayName = userId,
): PlayerStanding {
  return { userId, displayName, elo, wins, losses: 0 }
}

describe("rankStandings", () => {
  it("orders by rating, then wins, then name", () => {
    const ranked = rankStandings([
      standing("b", 1000, 2, "Bea"),
      standing("a", 1100, 1, "Ada"),
      standing("c", 1000, 2, "Ada"),
      standing("d", 1000, 1, "Cia"),
    ])
    expect(ranked.map((player) => player.userId)).toEqual(["a", "c", "b", "d"])
  })
})
