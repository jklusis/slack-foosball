import { describe, expect, it } from "vitest"
import { apply } from "../../src/domain/game"
import { pairings } from "../../src/domain/pairings"
import type {
  ActiveGame,
  CancelledGame,
  CompletedGame,
  OpenGame,
  ReportingGame,
  Setup2v2Game,
  ThreeDecided,
  ThreeRounds,
} from "../../src/domain/types"
import { requireFour } from "../../src/domain/types"
import { gameFromItem, gameToItem, playerFromItem } from "../../src/storage/codec"
import { player } from "../helpers"

const players = requireFour([player("A", "Ada"), player("B", "Ben"), player("C", "Cia"), player("D", "Dan")])

describe("game codec", () => {
  it("round-trips every phase", () => {
    const open: OpenGame = {
      id: "game-1",
      teamId: "T1",
      channelId: "C1",
      createdBy: "Z",
      phase: "open",
      format: "doubles",
      players: [players[0], players[1]],
    }
    const active: Extract<ActiveGame, { format: "doubles" }> = {
      id: "game-1",
      teamId: "T1",
      channelId: "C1",
      createdBy: "Z",
      phase: "active",
      format: "doubles",
      players,
      rounds: pairings(players),
    }
    const started = apply(active, { type: "finish", userId: "A" })
    if (started.kind !== "save" || started.game.phase !== "reporting" || started.game.format !== "doubles") {
      throw new Error("expected reporting")
    }
    const reporting: Extract<ReportingGame, { format: "doubles" }> = {
      ...started.game,
      rounds: [
        { ...started.game.rounds[0], winner: "home" as const },
        started.game.rounds[1],
        started.game.rounds[2],
      ] as ThreeRounds,
    }
    const completedResult = apply(
      {
        ...reporting,
        rounds: reporting.rounds.map((round) => ({ ...round, winner: round.winner ?? "away" })) as ThreeRounds,
      },
      { type: "save", userId: "A", ratings: new Map() },
    )
    if (completedResult.kind !== "complete") throw new Error("expected complete")
    const cancelled: CancelledGame = {
      id: "game-1",
      teamId: "T1",
      channelId: "C1",
      createdBy: "Z",
      phase: "cancelled",
      format: "doubles",
      players: [players[0]],
      cancelledBy: player("E", "Eve"),
    }
    const match: OpenGame = {
      id: "game-1",
      teamId: "T1",
      channelId: "C1",
      createdBy: "Z",
      phase: "open",
      format: "match",
      players: [players[0], players[2]],
      teamA: [players[0]],
      teamB: [players[2]],
    }
    const setup: Setup2v2Game = {
      id: "game-1",
      teamId: "T1",
      channelId: "C1",
      createdBy: "Z",
      phase: "setup",
      format: "2v2",
      players: [],
    }
    const random: OpenGame = { ...setup, phase: "open", format: "random", players: [players[3]] }
    const cancelledSetup: CancelledGame = { ...cancelled, format: "2v2", players: [] }
    const cancelledRandom: CancelledGame = { ...cancelled, format: "random" }
    for (const game of [setup, random, cancelledSetup, cancelledRandom, open, match, active, reporting, completedResult.game, cancelled]) {
      expect(gameFromItem(gameToItem({ version: 4, game }))).toEqual({ version: 4, game })
    }
  })

  it("rejects a completed game with no rating snapshot", () => {
    const game: CompletedGame = {
      id: "game-1",
      teamId: "T1",
      channelId: "C1",
      createdBy: "Z",
      phase: "completed",
      format: "doubles",
      players,
      rounds: pairings(players).map((round) => ({
        ...round,
        winner: "home" as const,
      })) as ThreeDecided,
      ratingChanges: [
        { userId: "A", displayName: "Ada", before: 1000, after: 1016, wins: 1, losses: 0 },
        { userId: "B", displayName: "Ben", before: 1000, after: 1016, wins: 1, losses: 0 },
        { userId: "C", displayName: "Cia", before: 1000, after: 984, wins: 0, losses: 1 },
        { userId: "D", displayName: "Dan", before: 1000, after: 984, wins: 0, losses: 1 },
      ],
    }
    const item = gameToItem({ version: 1, game })
    delete item.ratingChanges
    expect(() => gameFromItem(item)).toThrow(/results/)
  })

  it("rejects a stored game whose format cannot be in its phase", () => {
    const setup = { teamId: "T1", gameId: "game-1", version: 1, channelId: "C1", createdBy: "Z", players: [] }
    expect(() => gameFromItem({ ...setup, phase: "setup", format: "doubles" })).toThrow(/format/)
    expect(() => gameFromItem({ ...setup, phase: "open", format: "2v2" })).toThrow(/format/)
    expect(() => gameFromItem({ ...setup, phase: "active", format: "random", rounds: [] })).toThrow(/format/)
  })

  it("reads a game saved before formats existed as doubles", () => {
    const open: OpenGame = {
      id: "game-1",
      teamId: "T1",
      channelId: "C1",
      createdBy: "Z",
      phase: "open",
      format: "doubles",
      players: [],
    }
    const item = gameToItem({ version: 1, game: open })
    delete item.format
    expect(gameFromItem(item).game).toEqual(open)
  })

  it("reads a legacy player item as a doubles rating", () => {
    expect(
      playerFromItem({
        teamId: "T1",
        userId: "A",
        displayName: "Ada",
        elo: 1048,
        wins: 3,
        losses: 0,
      }),
    ).toEqual({
      userId: "A",
      displayName: "Ada",
      doubles: { elo: 1048, wins: 3, losses: 0 },
    })
  })
})
