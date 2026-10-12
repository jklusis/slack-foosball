import { assertNever } from "../assert-never"
import { rateSession } from "./elo"
import { matchRound, pairings, singlesMatch } from "./pairings"
import { Reason, requireFour, requireTwo } from "./types"
import type {
  ActiveGame,
  CancelledGame,
  CompletedGame,
  DecidedRound,
  DecidedRoundOf,
  Format,
  RoundOf,
  Game,
  OpenGame,
  Player,
  PlayerStanding,
  Rating,
  RejectReason,
  ReportingGame,
  Round,
  Side,
  Team,
  ThreeDecided,
  ThreeRounds,
} from "./types"

export type GameCommand =
  | { type: "join"; player: Player; team?: Team }
  | { type: "leave"; userId: string }
  | { type: "cancel"; player: Player }
  | { type: "start"; userId: string }
  | { type: "finish"; userId: string }
  | { type: "pick"; userId: string; round: 0 | 1 | 2; side: Side }
  | { type: "save"; userId: string; ratings: ReadonlyMap<string, Rating> }

export type ApplyResult =
  | { kind: "reject"; reason: RejectReason }
  | { kind: "keep"; game: Game }
  | { kind: "save"; game: Exclude<Game, CompletedGame> }
  | { kind: "complete"; game: CompletedGame; standings: PlayerStanding[] }

export function apply(game: Game, command: GameCommand): ApplyResult {
  switch (command.type) {
    case "join":
      return join(game, command.player, command.team)
    case "leave":
      return leave(game, command.userId)
    case "cancel":
      return cancel(game, command.player)
    case "start":
      return start(game, command.userId)
    case "finish":
      return finish(game, command.userId)
    case "pick":
      return pick(game, command.userId, command.round, command.side)
    case "save":
      return save(game, command.userId, command.ratings)
    default:
      return assertNever(command)
  }
}

function capacity(format: "singles" | "doubles"): number {
  return format === "doubles" ? 4 : 2
}

function join(game: Game, player: Player, team?: Team): ApplyResult {
  if (game.phase !== "open") return reject(Reason.wrongPhase)
  if (game.format === "match") return joinMatch(game, player, team)
  const existing = game.players.find((item) => item.userId === player.userId)
  if (existing) {
    if (existing.displayName === player.displayName) return keep(game)
    return saveGame({
      ...game,
      players: game.players.map((item) => (item.userId === player.userId ? player : item)),
    })
  }
  if (game.players.length >= capacity(game.format)) return reject(Reason.gameFull)
  return saveGame({ ...game, players: [...game.players, player] })
}

function joinMatch(
  game: Extract<OpenGame, { format: "match" }>,
  player: Player,
  team?: Team,
): ApplyResult {
  if (!team) return reject(Reason.wrongPhase)
  const side = team === "A" ? game.teamA : game.teamB
  const other = team === "A" ? game.teamB : game.teamA
  const already = side.find((item) => item.userId === player.userId)
  if (already) {
    if (already.displayName === player.displayName) return keep(game)
    return saveMatch(game, replacePlayer(side, player), other, team)
  }
  if (side.length >= 2) return reject(Reason.teamFull)
  return saveMatch(game, [...side, player], other.filter((item) => item.userId !== player.userId), team)
}

function saveMatch(
  game: Extract<OpenGame, { format: "match" }>,
  side: Player[],
  other: Player[],
  team: Team,
): ApplyResult {
  const teamA = team === "A" ? side : other
  const teamB = team === "B" ? side : other
  return saveGame({ ...game, teamA, teamB, players: [...teamA, ...teamB] })
}

function replacePlayer(players: readonly Player[], player: Player): Player[] {
  return players.map((item) => (item.userId === player.userId ? player : item))
}

function leave(game: Game, userId: string): ApplyResult {
  if (game.phase !== "open") return reject(Reason.wrongPhase)
  if (game.format === "match") {
    if (!hasPlayer(game.players, userId)) return reject(Reason.notInGame)
    const teamA = game.teamA.filter((player) => player.userId !== userId)
    const teamB = game.teamB.filter((player) => player.userId !== userId)
    return saveGame({ ...game, teamA, teamB, players: [...teamA, ...teamB] })
  }
  if (!hasPlayer(game.players, userId)) return reject(Reason.notInGame)
  return saveGame({
    ...game,
    players: game.players.filter((player) => player.userId !== userId),
  })
}

function cancel(game: Game, player: Player): ApplyResult {
  if (game.phase === "cancelled") return keep(game)
  if (game.phase === "open") return saveGame(cancelled(game, player))
  if (game.phase === "active") {
    if (!hasPlayer(game.players, player.userId)) return reject(Reason.notAPlayer)
    return saveGame(cancelled(game, player))
  }
  return reject(Reason.wrongPhase)
}

function start(game: Game, userId: string): ApplyResult {
  if (game.phase === "active") {
    if (!hasPlayer(game.players, userId)) return reject(Reason.notAPlayer)
    return keep(game)
  }
  if (game.phase !== "open") return reject(Reason.wrongPhase)
  if (game.format === "match") return startMatch(game, userId)
  if (game.players.length !== capacity(game.format)) {
    return reject(game.format === "singles" ? Reason.needTwo : Reason.needFour)
  }
  if (!hasPlayer(game.players, userId)) return reject(Reason.notAPlayer)
  if (game.format === "singles") {
    const players = requireTwo(game.players)
    const active: ActiveGame = {
      id: game.id,
      teamId: game.teamId,
      channelId: game.channelId,
      createdBy: game.createdBy,
      phase: "active",
      format: "singles",
      players,
      rounds: singlesMatch(players),
    }
    return saveGame(active)
  }
  const players = requireFour(game.players)
  const active: ActiveGame = {
    id: game.id,
    teamId: game.teamId,
    channelId: game.channelId,
    createdBy: game.createdBy,
    phase: "active",
    format: "doubles",
    players,
    rounds: pairings(players),
  }
  return saveGame(active)
}

function startMatch(game: Extract<OpenGame, { format: "match" }>, userId: string): ApplyResult {
  if (game.teamA.length !== 2 || game.teamB.length !== 2) return reject(Reason.needTeams)
  if (!hasPlayer(game.players, userId)) return reject(Reason.notAPlayer)
  const home = requireTwo(game.teamA)
  const away = requireTwo(game.teamB)
  const active: ActiveGame = {
    id: game.id,
    teamId: game.teamId,
    channelId: game.channelId,
    createdBy: game.createdBy,
    phase: "active",
    format: "match",
    players: requireFour([...home, ...away]),
    rounds: matchRound(home, away),
  }
  return saveGame(active)
}

function finish(game: Game, userId: string): ApplyResult {
  if (game.phase === "reporting") {
    if (!hasPlayer(game.players, userId)) return reject(Reason.notAPlayer)
    return keep(game)
  }
  if (game.phase !== "active") return reject(Reason.wrongPhase)
  if (!hasPlayer(game.players, userId)) return reject(Reason.notAPlayer)
  const reporting: ReportingGame = { ...game, phase: "reporting" }
  return saveGame(reporting)
}

function pick(game: Game, userId: string, roundIndex: 0 | 1 | 2, side: Side): ApplyResult {
  if (game.phase !== "reporting") return reject(Reason.wrongPhase)
  if (!hasPlayer(game.players, userId)) return reject(Reason.notAPlayer)
  if (game.format === "singles" || game.format === "match") {
    if (roundIndex !== 0) return reject(Reason.wrongPhase)
    return pickOnlyRound(game, side)
  }
  const current = game.rounds[roundIndex]
  if (!current) throw new Error("Missing round")
  if (current.winner === side) return keep(game)
  const rounds = game.rounds.map((item, index) =>
    index === roundIndex ? { ...item, winner: side } : item,
  )
  return saveGame({ ...game, rounds: asThree(rounds) })
}

function save(game: Game, userId: string, ratings: ReadonlyMap<string, Rating>): ApplyResult {
  if (game.phase === "completed") return keep(game)
  if (game.phase !== "reporting") return reject(Reason.wrongPhase)
  if (!hasPlayer(game.players, userId)) return reject(Reason.notAPlayer)
  if (game.format === "singles") return saveSingles(game, ratings)
  if (game.format === "match") return saveMatchResult(game, ratings)
  return saveDoubles(game, ratings)
}

function pickOnlyRound(
  game: Extract<ReportingGame, { format: "singles" | "match" }>,
  side: Side,
): ApplyResult {
  if (game.format === "singles") {
    const current = game.rounds[0]
    if (!current) throw new Error("Missing round")
    if (current.winner === side) return keep(game)
    return saveGame({ ...game, rounds: [{ ...current, winner: side }] })
  }
  const current = game.rounds[0]
  if (!current) throw new Error("Missing round")
  if (current.winner === side) return keep(game)
  return saveGame({ ...game, rounds: [{ ...current, winner: side }] })
}

function saveSingles(
  game: Extract<ReportingGame, { format: "singles" }>,
  ratings: ReadonlyMap<string, Rating>,
): ApplyResult {
  const round = decidedSingle(game.rounds[0])
  if (!round) return reject(Reason.resultsIncomplete)
  const rated = rateSession(game.players, [round], ratings)
  const completed: CompletedGame = {
    id: game.id,
    teamId: game.teamId,
    channelId: game.channelId,
    createdBy: game.createdBy,
    phase: "completed",
    format: "singles",
    players: game.players,
    rounds: [round],
    ratingChanges: requireTwo(rated.changes),
  }
  return { kind: "complete", game: completed, standings: rated.standings }
}

function saveMatchResult(
  game: Extract<ReportingGame, { format: "match" }>,
  ratings: ReadonlyMap<string, Rating>,
): ApplyResult {
  const round = decidedPair(game.rounds[0])
  if (!round) return reject(Reason.resultsIncomplete)
  const rated = rateSession(game.players, [round], ratings)
  const completed: CompletedGame = {
    id: game.id,
    teamId: game.teamId,
    channelId: game.channelId,
    createdBy: game.createdBy,
    phase: "completed",
    format: "match",
    players: game.players,
    rounds: [round],
    ratingChanges: requireFour(rated.changes),
  }
  return { kind: "complete", game: completed, standings: rated.standings }
}

function saveDoubles(
  game: Extract<ReportingGame, { format: "doubles" }>,
  ratings: ReadonlyMap<string, Rating>,
): ApplyResult {
  const rounds = decided(game.rounds)
  if (!rounds) return reject(Reason.resultsIncomplete)
  const rated = rateSession(game.players, rounds, ratings)
  const completed: CompletedGame = {
    id: game.id,
    teamId: game.teamId,
    channelId: game.channelId,
    createdBy: game.createdBy,
    phase: "completed",
    format: "doubles",
    players: game.players,
    rounds,
    ratingChanges: requireFour(rated.changes),
  }
  return { kind: "complete", game: completed, standings: rated.standings }
}

function decidedSingle(
  round: RoundOf<"singles"> | undefined,
): DecidedRoundOf<"singles"> | undefined {
  if (!round || round.winner === null) return undefined
  return { home: round.home, away: round.away, winner: round.winner }
}

function decidedPair(round: RoundOf<"match"> | undefined): DecidedRoundOf<"match"> | undefined {
  if (!round || round.winner === null) return undefined
  return { home: round.home, away: round.away, winner: round.winner }
}

function decided(rounds: ThreeRounds): ThreeDecided | undefined {
  const converted = rounds.map((round): DecidedRound | undefined => {
    if (round.winner === null) return undefined
    return { home: round.home, away: round.away, winner: round.winner }
  })
  const [first, second, third] = converted
  if (!first || !second || !third) return undefined
  return [first, second, third]
}

function asThree(rounds: Round[]): ThreeRounds {
  const [first, second, third] = rounds
  if (!first || !second || !third || rounds.length !== 3) {
    throw new Error("Expected three rounds")
  }
  return [first, second, third]
}

function cancelled(
  game: {
    id: string
    teamId: string
    channelId: string
    createdBy: string
    format: Format
    players: Player[]
  },
  player: Player,
): CancelledGame {
  return {
    id: game.id,
    teamId: game.teamId,
    channelId: game.channelId,
    createdBy: game.createdBy,
    phase: "cancelled",
    format: game.format,
    players: game.players,
    cancelledBy: player,
  }
}

function hasPlayer(players: readonly Player[], userId: string): boolean {
  return players.some((player) => player.userId === userId)
}

function reject(reason: RejectReason): ApplyResult {
  return { kind: "reject", reason }
}

function keep(game: Game): ApplyResult {
  return { kind: "keep", game }
}

function saveGame(game: Exclude<Game, CompletedGame>): ApplyResult {
  return { kind: "save", game }
}
