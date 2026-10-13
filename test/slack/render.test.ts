import { describe, expect, it } from "vitest"
import { pairings } from "../../src/domain/pairings"
import type { ActiveGame, FourPlayers, RatingChange, ReportingGame } from "../../src/domain/types"
import { requireFour } from "../../src/domain/types"
import type { Block } from "../../src/slack/render"
import { renderGame, renderLadder } from "../../src/slack/render"
import { player } from "../helpers"

const roster = [player("A", "Ada"), player("B", "Ben"), player("C", "Cia"), player("D", "Dan")]

function actionIds(blocks: Block[]): string[] {
  return blocks.flatMap((block) =>
    block.type === "actions" ? block.elements.map((element) => element.action_id) : [],
  )
}

function flatRatings(players: FourPlayers): [RatingChange, RatingChange, RatingChange, RatingChange] {
  return players.map((person) => ({
    userId: person.userId,
    displayName: person.displayName,
    before: 1000,
    after: 1000,
    wins: 0,
    losses: 0,
  })) as [RatingChange, RatingChange, RatingChange, RatingChange]
}

function buttonLabels(blocks: Block[]): string[] {
  return blocks.flatMap((block) =>
    block.type === "actions" ? block.elements.map((element) => element.text.text) : [],
  )
}

function textOf(blocks: Block[]): string {
  return blocks
    .filter((block) => block.type === "section")
    .map((block) => block.text.text)
    .join("\n")
}

describe("renderGame", () => {
  it("offers the three 2v2 modes and cancel before anyone can join", () => {
    const view = renderGame({
      id: "g1",
      teamId: "T1",
      channelId: "C1",
      createdBy: "Z",
      phase: "setup",
      format: "2v2",
      players: [],
    })
    expect(actionIds(view.blocks)).toEqual([
      "game_2v2_random",
      "game_2v2_teams",
      "game_2v2_long",
      "game_cancel",
    ])
    expect(buttonLabels(view.blocks)).toEqual([
      "Single 2v2 game, random assignments",
      "Single 2v2 game, manual team join",
      "Long 2v2 game, each plays with everyone",
      "Cancel",
    ])
    expect(textOf(view.blocks)).toContain("*New 2v2*")

    const cancelled = renderGame({
      id: "g1",
      teamId: "T1",
      channelId: "C1",
      createdBy: "Z",
      phase: "cancelled",
      format: "2v2",
      players: [],
      cancelledBy: player("E", "Eve"),
    })
    expect(textOf(cancelled.blocks)).toContain("*2v2 cancelled*")
    expect(actionIds(cancelled.blocks)).toEqual([])
  })

  it("fills a random-teams 2v2 to four and says teams are drawn at start", () => {
    const open = {
      id: "g1",
      teamId: "T1",
      channelId: "C1",
      createdBy: "Z",
      phase: "open" as const,
      format: "random" as const,
    }
    const waiting = renderGame({ ...open, players: roster.slice(0, 3) })
    expect(actionIds(waiting.blocks)).toEqual(["game_join", "game_leave", "game_cancel"])
    expect(textOf(waiting.blocks)).toContain("*New 2v2 game*")
    expect(textOf(waiting.blocks)).toContain("Teams are drawn at random when the game starts.")
    expect(textOf(waiting.blocks)).toContain("Join the game (3/4)")
    expect(textOf(waiting.blocks)).toContain("4. _waiting_")
    expect(actionIds(renderGame({ ...open, players: roster }).blocks)).toEqual([
      "game_start",
      "game_join",
      "game_leave",
      "game_cancel",
    ])
  })

  it("shows join and leave, and adds start only at four players", () => {
    const waiting = renderGame({
      id: "g1",
      teamId: "T1",
      channelId: "C1",
      createdBy: "Z",
      phase: "open",
      format: "doubles",
      players: roster.slice(0, 3),
    })
    expect(actionIds(waiting.blocks)).toEqual(["game_join", "game_leave", "game_cancel"])
    expect(waiting.blocks.filter((block) => block.type === "section").every((block) => block.expand)).toBe(true)
    expect(textOf(waiting.blocks)).toContain("*New 2v2 long game*")
    expect(textOf(waiting.blocks)).not.toContain("long game game")
    expect(textOf(waiting.blocks)).toContain("Join the game (3/4)")
    expect(textOf(waiting.blocks)).toContain("1. <@A>")
    expect(textOf(waiting.blocks)).toContain("4. _waiting_")
    expect(textOf(waiting.blocks)).not.toContain("Waiting for players")

    const full = renderGame({
      id: "g1",
      teamId: "T1",
      channelId: "C1",
      createdBy: "Z",
      phase: "open",
      format: "doubles",
      players: roster,
    })
    expect(actionIds(full.blocks)).toEqual([
      "game_start",
      "game_join",
      "game_leave",
      "game_cancel",
    ])
  })

  it("lets players join team A or team B in a 2v2", () => {
    const ada = roster[0]
    if (!ada) throw new Error("missing player")
    const view = renderGame({
      id: "g1",
      teamId: "T1",
      channelId: "C1",
      createdBy: "Z",
      phase: "open",
      format: "match",
      players: [ada],
      teamA: [ada],
      teamB: [],
    })
    expect(actionIds(view.blocks)).toEqual(["game_join_a", "game_join_b", "game_leave", "game_cancel"])
    expect(textOf(view.blocks)).toContain("*New 2v2 game*")
    expect(textOf(view.blocks)).toContain("*Team A (1/2)*")
    expect(textOf(view.blocks)).toContain("*Team B (0/2)*")
  })

  it("lists the three games while the match is active", () => {
    const players = requireFour(roster) satisfies FourPlayers
    const game: ActiveGame = {
      id: "g1",
      teamId: "T1",
      channelId: "C1",
      createdBy: "Z",
      phase: "active",
      format: "doubles",
      players,
      rounds: pairings(players),
    }
    const view = renderGame(game)
    expect(actionIds(view.blocks)).toEqual(["game_finish", "game_cancel"])
    expect(textOf(view.blocks)).toContain("*2v2 long game in progress*")
    expect(textOf(view.blocks)).toContain("<@A> + <@B> vs <@C> + <@D>")
    expect(textOf(view.blocks)).toContain("<@A> + <@D> vs <@B> + <@C>")
  })

  it("shows save only after every game has a winner", () => {
    const players = requireFour(roster)
    const rounds = pairings(players)
    const partial: ReportingGame = {
      id: "g1",
      teamId: "T1",
      channelId: "C1",
      createdBy: "Z",
      phase: "reporting",
      format: "doubles",
      players,
      rounds: [
        { ...rounds[0], winner: "home" },
        rounds[1],
        rounds[2],
      ],
    }
    expect(actionIds(renderGame(partial).blocks)).toEqual([
      "game_pick_home",
      "game_pick_away",
      "game_pick_home",
      "game_pick_away",
      "game_pick_home",
      "game_pick_away",
    ])

    const ready: ReportingGame = {
      ...partial,
      rounds: [
        { ...rounds[0], winner: "home" },
        { ...rounds[1], winner: "away" },
        { ...rounds[2], winner: "home" },
      ],
    }
    expect(actionIds(renderGame(ready).blocks)).toContain("game_save")
    expect(textOf(renderGame(ready).blocks)).toContain("*<@A> + <@B>*")
  })

  it("names who cancelled and removes the buttons", () => {
    const view = renderGame({
      id: "g1",
      teamId: "T1",
      channelId: "C1",
      createdBy: "Z",
      phase: "cancelled",
      format: "doubles",
      players: [],
      cancelledBy: player("E", "Eve"),
    })
    expect(actionIds(view.blocks)).toEqual([])
    expect(textOf(view.blocks)).toContain("Cancelled by <@E>")
  })

  it("starts a 1v1 at two players and shows one match", () => {
    const waiting = renderGame({
      id: "g1",
      teamId: "T1",
      channelId: "C1",
      createdBy: "Z",
      phase: "open",
      format: "singles",
      players: roster.slice(0, 1),
    })
    expect(actionIds(waiting.blocks)).toEqual(["game_join", "game_leave", "game_cancel"])
    expect(textOf(waiting.blocks)).toContain("Join the game (1/2)")
    expect(textOf(waiting.blocks)).toContain("New 1v1 game")
    expect(textOf(waiting.blocks)).toContain("2. _waiting_")

    const home = roster[0]
    const away = roster[1]
    if (!home || !away) throw new Error("missing players")
    const match = {
      id: "g1",
      teamId: "T1",
      channelId: "C1",
      createdBy: "Z",
      format: "singles" as const,
      players: [home, away] as [typeof home, typeof away],
    }
    const active = renderGame({
      ...match,
      phase: "active",
      rounds: [{ home: [home], away: [away], winner: null }],
    })
    expect(textOf(active.blocks)).toContain("<@A> vs <@B>")
    expect(textOf(active.blocks)).not.toContain("1. <@A>")
    expect(actionIds(active.blocks)).toEqual(["game_finish", "game_cancel"])

    const reporting = renderGame({
      ...match,
      phase: "reporting",
      rounds: [{ home: [home], away: [away], winner: "home" }],
    })
    expect(actionIds(reporting.blocks)).toEqual(["game_pick_home", "game_pick_away", "game_save"])
    expect(textOf(reporting.blocks)).toContain("*<@A>*")
    expect(textOf(reporting.blocks)).not.toContain("1. <@A>")

    const completed = renderGame({
      ...match,
      phase: "completed",
      rounds: [{ home: [home], away: [away], winner: "home" }],
      ratingChanges: [
        { userId: "A", displayName: "Ada", before: 1000, after: 1016, wins: 1, losses: 0 },
        { userId: "B", displayName: "Ben", before: 1000, after: 984, wins: 0, losses: 1 },
      ],
    })
    expect(textOf(completed.blocks)).toContain("*1v1 complete*")
    expect(textOf(completed.blocks)).toContain("<@A> beat <@B>")
    expect(textOf(completed.blocks)).not.toContain("1. <@A>")
  })

  it("numbers each game of a long session and leaves a single 2v2 unnumbered", () => {
    const players = requireFour(roster)
    const rounds = pairings(players).map((round) => ({ ...round, winner: "home" as const }))
    const long = renderGame({
      id: "g1",
      teamId: "T1",
      channelId: "C1",
      createdBy: "Z",
      phase: "completed",
      format: "doubles",
      players,
      rounds: [rounds[0]!, rounds[1]!, rounds[2]!],
      ratingChanges: flatRatings(players),
    })
    expect(textOf(long.blocks)).toContain("1. <@A> + <@B> beat <@C> + <@D>")
    expect(textOf(long.blocks)).toContain("3. <@A> + <@D> beat <@B> + <@C>")

    const short = renderGame({
      id: "g1",
      teamId: "T1",
      channelId: "C1",
      createdBy: "Z",
      phase: "completed",
      format: "match",
      players,
      rounds: [{ home: [players[0], players[1]], away: [players[2], players[3]], winner: "home" }],
      ratingChanges: flatRatings(players),
    })
    const text = textOf(short.blocks)
    expect(text).toContain("*2v2 complete*")
    expect(text).toContain("<@A> + <@B> beat <@C> + <@D>")
    expect(text).not.toContain("1. <@A>")
  })
})

describe("renderLadder", () => {
  it("explains an empty ladder and ranks each format on its own", () => {
    const empty = textOf(renderLadder({ doubles: [], singles: [] }).blocks)
    expect(empty).toContain("*2v2*\nNo rated players yet.")
    expect(empty).toContain("*1v1*\nNo rated players yet.")
    expect(empty).not.toContain("name, ELO, wins, losses")
    const view = renderLadder({
      doubles: [
        { userId: "B", displayName: "Ben", elo: 984, wins: 1, losses: 2 },
        { userId: "A", displayName: "Ada", elo: 1048, wins: 3, losses: 0 },
      ],
      singles: [{ userId: "C", displayName: "Cia", elo: 1016, wins: 1, losses: 0 }],
    })
    const text = textOf(view.blocks)
    expect(text.indexOf("*2v2*")).toBeLessThan(text.indexOf("name, ELO, wins, losses"))
    expect(text.indexOf("name, ELO, wins, losses")).toBeLessThan(text.indexOf("Ada"))
    expect(text).not.toContain("<@")
    const onlyDoubles = renderLadder({
      doubles: [{ userId: "A", displayName: "Ada", elo: 1048, wins: 3, losses: 0 }],
      singles: [],
    })
    expect(textOf(onlyDoubles.blocks)).toContain("*1v1*\nNo rated players yet.")
    expect(text.indexOf("Ada")).toBeLessThan(text.indexOf("Ben"))
    expect(text.indexOf("*1v1*")).toBeGreaterThan(text.indexOf("Ben"))
    expect(text.indexOf("Cia")).toBeGreaterThan(text.indexOf("*1v1*"))
    expect(text).toContain("1048 · 3W 0L")
  })
})
