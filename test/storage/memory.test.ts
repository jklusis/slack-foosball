import { describe, expect, it } from "vitest"
import { apply } from "../../src/domain/game"
import { pairings } from "../../src/domain/pairings"
import type { OpenGame, ReportingGame } from "../../src/domain/types"
import { requireFour } from "../../src/domain/types"
import { MemoryRepository } from "../../src/storage/memory"
import { player } from "../helpers"

const roster = [player("A"), player("B"), player("C"), player("D")]

describe("MemoryRepository", () => {
  it("rejects a stale roster write", async () => {
    const repo = new MemoryRepository()
    const open: OpenGame = {
      id: "game-1",
      teamId: "T1",
      channelId: "C1",
      createdBy: "Z",
      phase: "open",
      format: "doubles",
      players: [],
    }
    const created = await repo.create(open)
    const write = await repo.compareAndSwap(created.version + 1, {
      ...open,
      players: [player("A")],
    })
    expect(write).toBe("conflict")
    expect((await repo.get("T1", "game-1"))?.game).toEqual(created.game)
  })

  it("does not apply ratings twice", async () => {
    const repo = new MemoryRepository()
    const players = requireFour(roster)
    const reporting: ReportingGame = {
      id: "game-1",
      teamId: "T1",
      channelId: "C1",
      createdBy: "Z",
      phase: "reporting",
      format: "doubles",
      players,
      rounds: [
        { ...pairings(players)[0], winner: "home" },
        { ...pairings(players)[1], winner: "home" },
        { ...pairings(players)[2], winner: "away" },
      ],
    }
    await repo.create({
      id: "game-1",
      teamId: "T1",
      channelId: "C1",
      createdBy: "Z",
      phase: "open",
      format: "doubles",
      players: [],
    })
    expect(await repo.compareAndSwap(1, reporting)).toBe("ok")
    const rated = apply(reporting, { type: "save", userId: "A", ratings: new Map() })
    if (rated.kind !== "complete") throw new Error("expected complete")
    expect(await repo.complete(2, rated.game, rated.standings)).toBe("ok")
    const rewritten = rated.standings.map((standing) => ({ ...standing, elo: 1 }))
    expect(await repo.complete(2, rated.game, rewritten)).toBe("conflict")
    const ladders = await repo.listLadders("T1")
    expect(ladders.doubles.find((standing) => standing.userId === "A")?.elo).toBe(1016)
    expect(ladders.singles).toEqual([])
  })

  it("writes a 2v2 onto the 2v2 ladder", async () => {
    const repo = new MemoryRepository()
    const players = requireFour(roster)
    const reporting: Extract<ReportingGame, { format: "match" }> = {
      id: "game-2",
      teamId: "T1",
      channelId: "C1",
      createdBy: "Z",
      phase: "reporting",
      format: "match",
      players,
      rounds: [{ home: [players[0], players[1]], away: [players[2], players[3]], winner: "home" }],
    }
    await repo.create({
      id: "game-2",
      teamId: "T1",
      channelId: "C1",
      createdBy: "Z",
      phase: "open",
      format: "match",
      players: [],
      teamA: [],
      teamB: [],
    })
    expect(await repo.compareAndSwap(1, reporting)).toBe("ok")
    const rated = apply(reporting, { type: "save", userId: "A", ratings: new Map() })
    if (rated.kind !== "complete") throw new Error("expected complete")
    expect(await repo.complete(2, rated.game, rated.standings)).toBe("ok")
    const ladders = await repo.listLadders("T1")
    expect(ladders.doubles.find((standing) => standing.userId === "A")?.elo).toBe(1016)
    expect(ladders.doubles.find((standing) => standing.userId === "C")?.elo).toBe(984)
    expect(ladders.singles).toEqual([])
  })
})
