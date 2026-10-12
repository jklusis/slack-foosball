import { describe, expect, it } from "vitest"
import { handleAction } from "../../src/app/session"
import { pairings } from "../../src/domain/pairings"
import { FlowReason, Reason, requireFour } from "../../src/domain/types"
import type { OpenGame, ReportingGame, ThreeRounds } from "../../src/domain/types"
import { MemoryRepository } from "../../src/storage/memory"
import type { GameRepository } from "../../src/storage/repository"
import { player } from "../helpers"

const ada = player("A", "Ada")
const ben = player("B", "Ben")
const cia = player("C", "Cia")
const dan = player("D", "Dan")
const eve = player("E", "Eve")

function openGame(): OpenGame {
  return {
    id: "game-1",
    teamId: "T1",
    channelId: "C1",
    createdBy: "Z",
    phase: "open",
    format: "doubles",
    players: [],
  }
}

describe("handleAction", () => {
  it("joins a player once and rejects the fifth", async () => {
    const repo = new MemoryRepository()
    await repo.create(openGame())
    await handleAction(repo, { teamId: "T1", gameId: "game-1", actor: ada, action: { type: "join" } })
    await handleAction(repo, { teamId: "T1", gameId: "game-1", actor: ada, action: { type: "join" } })
    for (const actor of [ben, cia, dan]) {
      await handleAction(repo, { teamId: "T1", gameId: "game-1", actor, action: { type: "join" } })
    }
    const full = await handleAction(repo, {
      teamId: "T1",
      gameId: "game-1",
      actor: eve,
      action: { type: "join" },
    })
    expect(full).toEqual({ type: "ephemeral", reason: Reason.gameFull })
    const stored = await repo.get("T1", "game-1")
    expect(stored?.game.phase === "open" && stored.game.players.map((item) => item.userId)).toEqual([
      "A",
      "B",
      "C",
      "D",
    ])
  })

  it("keeps join order after someone leaves", async () => {
    const repo = new MemoryRepository()
    await repo.create({ ...openGame(), players: [ada, ben, cia, dan] })
    await handleAction(repo, { teamId: "T1", gameId: "game-1", actor: ben, action: { type: "leave" } })
    await handleAction(repo, { teamId: "T1", gameId: "game-1", actor: eve, action: { type: "join" } })
    const started = await handleAction(repo, {
      teamId: "T1",
      gameId: "game-1",
      actor: ada,
      action: { type: "start" },
    })
    expect(started.type).toBe("replace")
    if (started.type !== "replace" || started.game.phase !== "active") return
    expect(started.game.rounds[0]?.home.map((item) => item.userId)).toEqual(["A", "C"])
    expect(started.game.rounds[0]?.away.map((item) => item.userId)).toEqual(["D", "E"])
  })

  it("applies ratings once when results are saved twice", async () => {
    const repo = new MemoryRepository()
    const players = requireFour([ada, ben, cia, dan])
    const reporting: ReportingGame = {
      id: "game-1",
      teamId: "T1",
      channelId: "C1",
      createdBy: "Z",
      phase: "reporting",
      format: "doubles",
      players,
      rounds: pairings(players).map((round) => ({ ...round, winner: "home" as const })) as ThreeRounds,
    }
    await repo.create(openGame())
    expect(await repo.compareAndSwap(1, reporting)).toBe("ok")

    const first = await handleAction(repo, {
      teamId: "T1",
      gameId: "game-1",
      actor: ada,
      action: { type: "save" },
    })
    const second = await handleAction(repo, {
      teamId: "T1",
      gameId: "game-1",
      actor: ben,
      action: { type: "save" },
    })
    expect(first.type).toBe("replace")
    expect(second.type).toBe("replace")
    const standings = await repo.listLadders("T1")
    expect(standings.doubles.find((standing) => standing.userId === "A")?.elo).toBe(1048)
    expect(standings.doubles.find((standing) => standing.userId === "B")?.elo).toBe(984)
    expect(standings.singles).toEqual([])
  })

  it("rates a 1v1 from 1000 even when the players already have a 2v2 rating", async () => {
    const repo = new MemoryRepository()
    const players = requireFour([ada, ben, cia, dan])
    const doubles: ReportingGame = {
      id: "doubles",
      teamId: "T1",
      channelId: "C1",
      createdBy: "Z",
      phase: "reporting",
      format: "doubles",
      players,
      rounds: pairings(players).map((round) => ({ ...round, winner: "home" as const })) as ThreeRounds,
    }
    await repo.create({ ...openGame(), id: "doubles" })
    expect(await repo.compareAndSwap(1, doubles)).toBe("ok")
    await handleAction(repo, { teamId: "T1", gameId: "doubles", actor: ada, action: { type: "save" } })

    const singles: ReportingGame = {
      id: "singles",
      teamId: "T1",
      channelId: "C1",
      createdBy: "Z",
      phase: "reporting",
      format: "singles",
      players: [ada, ben],
      rounds: [{ home: [ada], away: [ben], winner: "home" }],
    }
    await repo.create({ ...openGame(), id: "singles", format: "singles" })
    expect(await repo.compareAndSwap(1, singles)).toBe("ok")
    const saved = await handleAction(repo, {
      teamId: "T1",
      gameId: "singles",
      actor: ada,
      action: { type: "save" },
    })
    expect(saved.type).toBe("replace")
    const ladders = await repo.listLadders("T1")
    expect(ladders.doubles.find((standing) => standing.userId === "A")?.elo).toBe(1048)
    expect(ladders.singles.find((standing) => standing.userId === "A")).toMatchObject({
      elo: 1016,
      wins: 1,
      losses: 0,
    })
    expect(ladders.singles.find((standing) => standing.userId === "B")?.elo).toBe(984)
  })

  it("retries a conflicting write once", async () => {
    const inner = new MemoryRepository()
    await inner.create(openGame())
    let failed = false
    const repo: GameRepository = {
      create: (game) => inner.create(game),
      get: (teamId, gameId) => inner.get(teamId, gameId),
      compareAndSwap: async (version, game) => {
        if (!failed) {
          failed = true
          return "conflict"
        }
        return inner.compareAndSwap(version, game)
      },
      complete: (version, game, standings) => inner.complete(version, game, standings),
      getStandings: (teamId, userIds, format) => inner.getStandings(teamId, userIds, format),
      listLadders: (teamId) => inner.listLadders(teamId),
    }

    const outcome = await handleAction(repo, {
      teamId: "T1",
      gameId: "game-1",
      actor: ada,
      action: { type: "join" },
    })
    expect(outcome.type).toBe("replace")
    const stored = await inner.get("T1", "game-1")
    expect(stored?.game.phase === "open" && stored.game.players.map((item) => item.userId)).toEqual(["A"])
  })

  it("stops after two conflicts", async () => {
    const inner = new MemoryRepository()
    await inner.create(openGame())
    const repo: GameRepository = {
      create: (game) => inner.create(game),
      get: (teamId, gameId) => inner.get(teamId, gameId),
      compareAndSwap: async () => "conflict",
      complete: (version, game, standings) => inner.complete(version, game, standings),
      getStandings: (teamId, userIds, format) => inner.getStandings(teamId, userIds, format),
      listLadders: (teamId) => inner.listLadders(teamId),
    }
    const outcome = await handleAction(repo, {
      teamId: "T1",
      gameId: "game-1",
      actor: ada,
      action: { type: "join" },
    })
    expect(outcome).toEqual({ type: "ephemeral", reason: FlowReason.tryAgain })
    const stored = await inner.get("T1", "game-1")
    expect(stored?.game.phase === "open" && stored.game.players).toEqual([])
  })
})
