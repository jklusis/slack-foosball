import { describe, expect, it } from "vitest"
import { apply } from "../../src/domain/game"
import { Reason } from "../../src/domain/types"
import { pairings } from "../../src/domain/pairings"
import type { ActiveGame, FourPlayers, Game, OpenGame, ReportingGame } from "../../src/domain/types"
import { requireFour } from "../../src/domain/types"
import { player } from "../helpers"

const ada = player("A", "Ada")
const ben = player("B", "Ben")
const cia = player("C", "Cia")
const dan = player("D", "Dan")
const eve = player("E", "Eve")
const roster = [ada, ben, cia, dan]

function open(players: typeof roster = []): OpenGame {
  return {
    id: "game-1",
    teamId: "T1",
    channelId: "C1",
    createdBy: "Z",
    phase: "open",
    format: "doubles",
    players,
  }
}

function active(): Extract<ActiveGame, { format: "doubles" }> {
  const players = requireFour(roster) satisfies FourPlayers
  return {
    id: "game-1",
    teamId: "T1",
    channelId: "C1",
    createdBy: "Z",
    phase: "active",
    format: "doubles",
    players,
    rounds: pairings(players),
  }
}

function reporting(
  winners: Array<"home" | "away" | null> = [null, null, null],
): Extract<ReportingGame, { format: "doubles" }> {
  const game = active()
  const first = game.rounds[0]
  const second = game.rounds[1]
  const third = game.rounds[2]
  if (!first || !second || !third) throw new Error("missing rounds")
  return {
    ...game,
    phase: "reporting",
    rounds: [
      { ...first, winner: winners[0] ?? null },
      { ...second, winner: winners[1] ?? null },
      { ...third, winner: winners[2] ?? null },
    ],
  }
}

function saved(result: ReturnType<typeof apply>): Game {
  expect(result.kind).toBe("save")
  if (result.kind !== "save") throw new Error("expected save")
  return result.game
}

describe("game transitions", () => {
  it("joins in order and ignores a second join", () => {
    const once = saved(apply(open(), { type: "join", player: ada }))
    expect(once.phase === "open" && once.players.map((item) => item.userId)).toEqual(["A"])
    const twice = apply(once, { type: "join", player: ada })
    expect(twice).toEqual({ kind: "keep", game: once })
  })

  it("refreshes a display name when the same player joins again", () => {
    const joined = saved(apply(open(), { type: "join", player: ada }))
    const renamed = saved(apply(joined, { type: "join", player: player("A", "Adelaide") }))
    expect(renamed.phase === "open" && renamed.players[0]?.displayName).toBe("Adelaide")
  })

  it("rejects a fifth player", () => {
    expect(apply(open(roster), { type: "join", player: eve })).toEqual({
      kind: "reject",
      reason: Reason.gameFull,
    })
  })

  it("removes a player and keeps the remaining order", () => {
    const left = saved(apply(open(roster.slice(0, 3)), { type: "leave", userId: "B" }))
    expect(left.phase === "open" && left.players.map((item) => item.userId)).toEqual(["A", "C"])
  })

  it("rejects leave when the player is absent", () => {
    expect(apply(open([ada]), { type: "leave", userId: "B" })).toEqual({
      kind: "reject",
      reason: Reason.notInGame,
    })
  })

  it("refuses to start before four players", () => {
    expect(apply(open([ada]), { type: "start", userId: "A" })).toEqual({
      kind: "reject",
      reason: Reason.needFour,
    })
  })

  it("starts only for a joined player and locks pairings", () => {
    const full = open(roster)
    expect(apply(full, { type: "start", userId: "E" })).toEqual({
      kind: "reject",
      reason: Reason.notAPlayer,
    })
    const started = saved(apply(full, { type: "start", userId: "A" }))
    expect(started.phase).toBe("active")
    if (started.phase !== "active") return
    expect(started.rounds[0]?.home.map((item) => item.userId)).toEqual(["A", "B"])
    expect(apply(started, { type: "start", userId: "A" })).toEqual({ kind: "keep", game: started })
  })

  it("lets anyone cancel an open game and only players cancel an active one", () => {
    const openCancelled = saved(apply(open([ada]), { type: "cancel", player: eve }))
    expect(openCancelled.phase === "cancelled" && openCancelled.cancelledBy.userId).toBe("E")
    expect(apply(openCancelled, { type: "cancel", player: ada })).toEqual({
      kind: "keep",
      game: openCancelled,
    })

    expect(apply(active(), { type: "cancel", player: eve })).toEqual({
      kind: "reject",
      reason: Reason.notAPlayer,
    })
    const activeCancelled = saved(apply(active(), { type: "cancel", player: ben }))
    expect(activeCancelled.phase === "cancelled" && activeCancelled.cancelledBy.userId).toBe("B")
  })

  it("moves an active game to reporting for a player only", () => {
    expect(apply(active(), { type: "finish", userId: "E" })).toEqual({
      kind: "reject",
      reason: Reason.notAPlayer,
    })
    const finished = saved(apply(active(), { type: "finish", userId: "C" }))
    expect(finished.phase).toBe("reporting")
    expect(apply(open([ada]), { type: "finish", userId: "A" })).toEqual({
      kind: "reject",
      reason: Reason.wrongPhase,
    })
  })

  it("records a winner and rejects a save until all three are set", () => {
    const picked = saved(apply(reporting(), { type: "pick", userId: "A", round: 0, side: "home" }))
    expect(picked.phase === "reporting" && picked.rounds[0]?.winner).toBe("home")
    expect(apply(picked, { type: "pick", userId: "A", round: 0, side: "home" })).toEqual({
      kind: "keep",
      game: picked,
    })
    expect(apply(picked, { type: "save", userId: "A", ratings: new Map() })).toEqual({
      kind: "reject",
      reason: Reason.resultsIncomplete,
    })
    expect(apply(reporting(), { type: "pick", userId: "E", round: 1, side: "away" })).toEqual({
      kind: "reject",
      reason: Reason.notAPlayer,
    })
  })

  it("rates the session once and keeps the completed game on a second save", () => {
    const ready = reporting(["home", "home", "home"])
    const result = apply(ready, { type: "save", userId: "D", ratings: new Map() })
    expect(result.kind).toBe("complete")
    if (result.kind !== "complete") return
    expect(result.game.ratingChanges.map((change) => change.after)).toEqual([1048, 984, 984, 984])
    expect(result.standings.map((standing) => standing.elo)).toEqual([1048, 984, 984, 984])
    expect(apply(result.game, { type: "save", userId: "E", ratings: new Map() })).toEqual({
      kind: "keep",
      game: result.game,
    })
  })

  it("rejects a result entry before the game is being reported", () => {
    expect(apply(active(), { type: "pick", userId: "A", round: 0, side: "home" })).toEqual({
      kind: "reject",
      reason: Reason.wrongPhase,
    })
    expect(apply(active(), { type: "save", userId: "A", ratings: new Map() })).toEqual({
      kind: "reject",
      reason: Reason.wrongPhase,
    })
  })

  it("fills a 1v1 at two players and rates the single game", () => {
    const lobby = singles()
    expect(apply(lobby, { type: "start", userId: "A" })).toEqual({
      kind: "reject",
      reason: Reason.needTwo,
    })
    const one = saved(apply(lobby, { type: "join", player: ada }))
    const two = saved(apply(one, { type: "join", player: ben }))
    expect(apply(two, { type: "join", player: cia })).toEqual({
      kind: "reject",
      reason: Reason.gameFull,
    })
    const started = saved(apply(two, { type: "start", userId: "A" }))
    expect(started.phase === "active" && started.format).toBe("singles")
    if (started.phase !== "active" || started.format !== "singles") return
    expect(started.rounds[0]?.home.map((item) => item.userId)).toEqual(["A"])
    expect(started.rounds[0]?.away.map((item) => item.userId)).toEqual(["B"])

    const reporting = saved(apply(started, { type: "finish", userId: "B" }))
    expect(apply(reporting, { type: "pick", userId: "A", round: 1, side: "home" })).toEqual({
      kind: "reject",
      reason: Reason.wrongPhase,
    })
    const picked = saved(apply(reporting, { type: "pick", userId: "A", round: 0, side: "away" }))
    const result = apply(picked, { type: "save", userId: "B", ratings: new Map() })
    expect(result.kind).toBe("complete")
    if (result.kind !== "complete") return
    expect(result.game.ratingChanges.map((change) => [change.userId, change.after])).toEqual([
      ["A", 984],
      ["B", 1016],
    ])
  })

  it("plays a 2v2 as one match between the two teams", () => {
    const lobby = match()
    const teamA = saved(apply(lobby, { type: "join", player: ada, team: "A" }))
    const both = saved(apply(teamA, { type: "join", player: ben, team: "A" }))
    expect(apply(both, { type: "join", player: cia, team: "A" })).toEqual({
      kind: "reject",
      reason: Reason.teamFull,
    })
    const moved = saved(apply(both, { type: "join", player: ben, team: "B" }))
    expect(moved.phase === "open" && moved.format === "match" && moved.teamA.map((item) => item.userId)).toEqual(["A"])
    expect(moved.phase === "open" && moved.format === "match" && moved.teamB.map((item) => item.userId)).toEqual(["B"])
    const withC = saved(apply(moved, { type: "join", player: cia, team: "B" }))
    const full = saved(apply(withC, { type: "join", player: dan, team: "A" }))
    expect(apply(full, { type: "start", userId: "E" })).toEqual({ kind: "reject", reason: Reason.notAPlayer })
    const started = saved(apply(full, { type: "start", userId: "A" }))
    expect(started.phase === "active" && started.format).toBe("match")
    if (started.phase !== "active" || started.format !== "match") return
    expect(started.rounds).toHaveLength(1)
    expect(started.rounds[0]?.home.map((item) => item.userId)).toEqual(["A", "D"])
    expect(started.rounds[0]?.away.map((item) => item.userId)).toEqual(["B", "C"])

    const reporting = saved(apply(started, { type: "finish", userId: "A" }))
    const picked = saved(apply(reporting, { type: "pick", userId: "B", round: 0, side: "home" }))
    const result = apply(picked, { type: "save", userId: "A", ratings: new Map() })
    expect(result.kind).toBe("complete")
    if (result.kind !== "complete") return
    expect(result.game.format).toBe("match")
    expect(result.game.ratingChanges.map((change) => [change.userId, change.after])).toEqual([
      ["A", 1016],
      ["D", 1016],
      ["B", 984],
      ["C", 984],
    ])
  })
})

function match(): OpenGame {
  return {
    id: "game-1",
    teamId: "T1",
    channelId: "C1",
    createdBy: "Z",
    phase: "open",
    format: "match",
    players: [],
    teamA: [],
    teamB: [],
  }
}

function singles(): OpenGame {
  return {
    id: "game-1",
    teamId: "T1",
    channelId: "C1",
    createdBy: "Z",
    phase: "open",
    format: "singles",
    players: [],
  }
}
