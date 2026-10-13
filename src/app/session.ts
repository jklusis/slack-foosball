import { assertNever } from "../assert-never"
import { apply, type GameCommand } from "../domain/game"
import { FlowReason, ladderFormat, type Click, type Game, type Player, type Rating, type RejectReason } from "../domain/types"
import type { GameRepository } from "../storage/repository"

export type ActionOutcome =
  | { type: "replace"; game: Game }
  | { type: "ephemeral"; reason: RejectReason | FlowReason }

export async function handleAction(
  repo: GameRepository,
  input: { teamId: string; gameId: string; actor: Player; action: Click },
  random: () => number = Math.random,
): Promise<ActionOutcome> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const stored = await repo.get(input.teamId, input.gameId)
    if (!stored) return { type: "ephemeral", reason: FlowReason.missingGame }
    const result = apply(stored.game, await commandFor(repo, stored.game, input, random))
    if (result.kind === "reject") return { type: "ephemeral", reason: result.reason }
    if (result.kind === "keep") return { type: "replace", game: result.game }

    const write =
      result.kind === "complete"
        ? await repo.complete(stored.version, result.game, result.standings)
        : await repo.compareAndSwap(stored.version, result.game)
    if (write === "ok") return { type: "replace", game: result.game }
  }
  return { type: "ephemeral", reason: FlowReason.tryAgain }
}

async function commandFor(
  repo: GameRepository,
  game: Game,
  input: { teamId: string; actor: Player; action: Click },
  random: () => number,
): Promise<GameCommand> {
  const { action, actor } = input
  switch (action.type) {
    case "choose2v2":
      return { type: "choose2v2", mode: action.mode }
    case "join":
      return { type: "join", player: actor, team: action.team }
    case "cancel":
      return { type: "cancel", player: actor }
    case "start":
      return { type: "start", userId: actor.userId, random }
    case "leave":
    case "finish":
      return { type: action.type, userId: actor.userId }
    case "pick":
      return { type: "pick", userId: actor.userId, round: action.round, side: action.side }
    case "save":
      return { type: "save", userId: actor.userId, ratings: await loadRatings(repo, input.teamId, game) }
    default:
      return assertNever(action)
  }
}

async function loadRatings(
  repo: GameRepository,
  teamId: string,
  game: Game,
): Promise<Map<string, Rating>> {
  const standings = await repo.getStandings(
    teamId,
    game.players.map((player) => player.userId),
    ladderFormat(game.format),
  )
  return new Map(
    standings.map((standing) => [
      standing.userId,
      { elo: standing.elo, wins: standing.wins, losses: standing.losses },
    ]),
  )
}
