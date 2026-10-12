import { describe, expect, it } from "vitest"
import { rateRound, rateSession } from "../../src/domain/elo"
import type { DecidedRound, FourPlayers, Rating } from "../../src/domain/types"
import { player } from "../helpers"

const ada = player("A", "Ada")
const ben = player("B", "Ben")
const cia = player("C", "Cia")
const dan = player("D", "Dan")

function round(
  home: [typeof ada, typeof ben],
  away: [typeof cia, typeof dan],
  winner: "home" | "away",
): DecidedRound {
  return { home, away, winner }
}

describe("rateRound", () => {
  it("moves an even game by 16 points", () => {
    const rated = rateRound(
      round([ada, ben], [cia, dan], "home"),
      new Map<string, Rating>(),
    )
    expect(rated.get("A")).toMatchObject({ elo: 1016, wins: 1, losses: 0 })
    expect(rated.get("B")).toMatchObject({ elo: 1016, wins: 1, losses: 0 })
    expect(rated.get("C")).toMatchObject({ elo: 984, wins: 0, losses: 1 })
    expect(rated.get("D")).toMatchObject({ elo: 984, wins: 0, losses: 1 })
  })

  it("gives a favorite fewer points than an even game", () => {
    const ratings = new Map<string, Rating>([
      ["A", { elo: 1100, wins: 0, losses: 0 }],
      ["B", { elo: 1300, wins: 0, losses: 0 }],
      ["C", { elo: 1000, wins: 0, losses: 0 }],
      ["D", { elo: 1000, wins: 0, losses: 0 }],
    ])
    const rated = rateRound(round([ada, ben], [cia, dan], "home"), ratings)
    expect(rated.get("A")?.elo).toBe(1108)
    expect(rated.get("B")?.elo).toBe(1308)
    expect(rated.get("C")?.elo).toBe(992)
    expect(rated.get("D")?.elo).toBe(992)
  })

  it("moves an even 1v1 by 16 points", () => {
    const rated = rateRound({ home: [ada], away: [ben], winner: "home" }, new Map())
    expect(rated.get("A")).toMatchObject({ elo: 1016, wins: 1, losses: 0 })
    expect(rated.get("B")).toMatchObject({ elo: 984, wins: 0, losses: 1 })
  })

  it("gives the underdog the larger swing", () => {
    const ratings = new Map<string, Rating>([
      ["A", { elo: 1200, wins: 4, losses: 1 }],
      ["B", { elo: 1200, wins: 4, losses: 1 }],
      ["C", { elo: 1000, wins: 0, losses: 0 }],
      ["D", { elo: 1000, wins: 0, losses: 0 }],
    ])
    const rated = rateRound(round([ada, ben], [cia, dan], "away"), ratings)
    expect(rated.get("A")).toMatchObject({ elo: 1176, wins: 4, losses: 2 })
    expect(rated.get("C")).toMatchObject({ elo: 1024, wins: 1, losses: 0 })
  })
})

describe("rateSession", () => {
  it("applies the three games in order", () => {
    const players: FourPlayers = [ada, ben, cia, dan]
    const rounds: [DecidedRound, DecidedRound, DecidedRound] = [
      round([ada, ben], [cia, dan], "home"),
      round([ada, cia], [ben, dan], "home"),
      round([ada, dan], [ben, cia], "home"),
    ]
    const { changes } = rateSession(players, rounds, new Map())
    expect(changes.map((change) => [change.userId, change.after, change.wins, change.losses])).toEqual([
      ["A", 1048, 3, 0],
      ["B", 984, 1, 2],
      ["C", 984, 1, 2],
      ["D", 984, 1, 2],
    ])
    expect(changes[0]).toMatchObject({ before: 1000 })
  })
})
