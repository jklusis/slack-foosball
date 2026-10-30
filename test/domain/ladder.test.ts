import { describe, expect, it } from "vitest"
import { activeLadder, rankStandings } from "../../src/domain/ladder"
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

describe("activeLadder", () => {
  const day = 24 * 60 * 60 * 1000
  const now = Date.UTC(2026, 9, 30)
  const at = (userId: string, lastPlayedAt?: number): PlayerStanding => ({
    ...standing(userId, 1000, 0),
    ...(lastPlayedAt !== undefined ? { lastPlayedAt } : {}),
  })

  it("hides players whose last game on that ladder is at least the limit old", () => {
    const ladder = activeLadder(
      {
        doubles: [at("recent", now - 29 * day), at("edge", now - 30 * day), at("never")],
        singles: [at("recent", now - 31 * day), at("solo", now - day)],
      },
      now,
      30,
    )
    expect(ladder.doubles.map((player) => player.userId)).toEqual(["recent"])
    expect(ladder.singles.map((player) => player.userId)).toEqual(["solo"])
  })

  it("uses the configured number of days", () => {
    const ladder = activeLadder({ doubles: [at("a", now - 10 * day)], singles: [] }, now, 7)
    expect(ladder.doubles).toEqual([])
  })
})
