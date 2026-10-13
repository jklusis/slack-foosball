import type {
  CancelledGame,
  CompletedGame,
  DecidedRound,
  DecidedRoundOf,
  GameFormat,
  LadderFormat,
  FourPlayers,
  Game,
  Ladder,
  Player,
  PlayerStanding,
  Rating,
  RatingChange,
  Round,
  RoundOf,
  Side,
  ThreeDecided,
  ThreeRounds,
  TwoPlayers,
} from "../domain/types"
import { ladderFormat, requireFour, requireTwo } from "../domain/types"
import type { StoredGame } from "./repository"

type Item = Record<string, unknown>

export type PlayerRecord = {
  userId: string
  displayName: string
  doubles?: Rating
  singles?: Rating
}

export function gameToItem(stored: StoredGame): Item {
  const { game } = stored
  const item: Item = {
    teamId: game.teamId,
    gameId: game.id,
    version: stored.version,
    phase: game.phase,
    format: game.format,
    channelId: game.channelId,
    createdBy: game.createdBy,
    players: game.players,
  }
  if (game.phase === "open" && game.format === "match") {
    item.teamA = game.teamA
    item.teamB = game.teamB
  }
  if (game.phase === "active" || game.phase === "reporting" || game.phase === "completed") {
    item.rounds = game.rounds.map((round) => ({
      home: round.home,
      away: round.away,
      winner: round.winner ?? "none",
    }))
  }
  if (game.phase === "completed") item.ratingChanges = game.ratingChanges
  if (game.phase === "cancelled") item.cancelledBy = game.cancelledBy
  return item
}

export function gameFromItem(item: Item): StoredGame {
  const teamId = readString(item.teamId)
  const gameId = readString(item.gameId)
  const version = readNumber(item.version)
  const phase = readString(item.phase)
  const channelId = readString(item.channelId)
  const createdBy = readString(item.createdBy)
  const players = readPlayers(item.players)
  const format = readFormat(item.format)
  if (!teamId || !gameId || version === undefined || !phase || !channelId || !createdBy || !players || !format) {
    throw new Error("Game item is missing required fields")
  }
  const base = { id: gameId, teamId, channelId, createdBy }
  const game = gameFromPhase(phase, format, base, players, item)
  return { version, game }
}

export function playerFromItem(item: Item): PlayerRecord {
  const userId = readString(item.userId)
  const displayName = readString(item.displayName)
  if (!userId || displayName === undefined) throw new Error("Player item is missing required fields")
  const doubles = readRating(item.doubles) ?? readRating(item)
  const singles = readRating(item.singles)
  return {
    userId,
    displayName,
    ...(doubles ? { doubles } : {}),
    ...(singles ? { singles } : {}),
  }
}

export function ladderFromPlayers(records: readonly PlayerRecord[]): Ladder {
  const doubles: PlayerStanding[] = []
  const singles: PlayerStanding[] = []
  for (const record of records) {
    if (record.doubles) doubles.push(standing(record, record.doubles))
    if (record.singles) singles.push(standing(record, record.singles))
  }
  return { doubles, singles }
}

export function standingOf(record: PlayerRecord, format: LadderFormat): PlayerStanding | undefined {
  const rating = record[format]
  if (!rating) return undefined
  return standing(record, rating)
}

export function playerUpdate(teamId: string, format: LadderFormat, standing: PlayerStanding) {
  return {
    Key: { teamId, userId: standing.userId },
    UpdateExpression: "SET displayName = :displayName, #format = :rating",
    ExpressionAttributeNames: { "#format": format },
    ExpressionAttributeValues: {
      ":displayName": standing.displayName,
      ":rating": { elo: standing.elo, wins: standing.wins, losses: standing.losses },
    },
  }
}

function standing(record: PlayerRecord, rating: Rating): PlayerStanding {
  return {
    userId: record.userId,
    displayName: record.displayName,
    elo: rating.elo,
    wins: rating.wins,
    losses: rating.losses,
  }
}

function gameFromPhase(
  phase: string,
  format: GameFormat,
  base: { id: string; teamId: string; channelId: string; createdBy: string },
  players: Player[],
  item: Item,
): Game {
  if (phase === "setup") {
    if (format !== "pending") throw new Error(`A setup game cannot have format ${format}`)
    return { ...base, phase, format, players: [] }
  }
  if (phase === "open") {
    if (format === "pending") throw new Error("An open game cannot have format pending")
    if (format === "match") {
      return {
        ...base,
        phase,
        format,
        players,
        teamA: readPlayers(item.teamA) ?? [],
        teamB: readPlayers(item.teamB) ?? [],
      }
    }
    return { ...base, phase, format, players }
  }
  if (phase === "cancelled") {
    const cancelledBy = readPlayer(item.cancelledBy)
    if (!cancelledBy) throw new Error("Cancelled game is missing cancelledBy")
    const cancelled: CancelledGame = { ...base, phase, format, players, cancelledBy }
    return cancelled
  }
  if (format === "random" || format === "pending") {
    throw new Error(`A ${phase} game cannot have format ${format}`)
  }
  if (format === "singles") return singlesFromPhase(phase, base, players, item)
  if (format === "match") return matchFromPhase(phase, base, players, item)
  return doublesFromPhase(phase, base, players, item)
}

function doublesFromPhase(
  phase: string,
  base: { id: string; teamId: string; channelId: string; createdBy: string },
  players: Player[],
  item: Item,
): Game {
  const rounds = readDoublesRounds(item.rounds)
  if (!rounds) throw new Error("Game is missing rounds")
  const four = asFourPlayers(players)
  if (phase === "active" || phase === "reporting") {
    return { ...base, phase, format: "doubles", players: four, rounds }
  }
  if (phase === "completed") {
    const decided = decidedRounds(rounds)
    const ratingChanges = readChanges(item.ratingChanges, 4)
    if (!decided || !ratingChanges) throw new Error("Completed game is missing results")
    const completed: CompletedGame = {
      ...base,
      phase,
      format: "doubles",
      players: four,
      rounds: decided,
      ratingChanges: requireFour(ratingChanges),
    }
    return completed
  }
  throw new Error(`Unknown game phase ${phase}`)
}

function matchFromPhase(
  phase: string,
  base: { id: string; teamId: string; channelId: string; createdBy: string },
  players: Player[],
  item: Item,
): Game {
  const rounds = readMatchRounds(item.rounds)
  if (!rounds) throw new Error("Game is missing rounds")
  const four = asFourPlayers(players)
  if (phase === "active" || phase === "reporting") {
    return { ...base, phase, format: "match", players: four, rounds }
  }
  if (phase === "completed") {
    const decided = decidedPair(rounds[0])
    const ratingChanges = readChanges(item.ratingChanges, 4)
    if (!decided || !ratingChanges) throw new Error("Completed game is missing results")
    const completed: CompletedGame = {
      ...base,
      phase,
      format: "match",
      players: four,
      rounds: [decided],
      ratingChanges: requireFour(ratingChanges),
    }
    return completed
  }
  throw new Error(`Unknown game phase ${phase}`)
}

function singlesFromPhase(
  phase: string,
  base: { id: string; teamId: string; channelId: string; createdBy: string },
  players: Player[],
  item: Item,
): Game {
  const rounds = readSinglesRounds(item.rounds)
  if (!rounds) throw new Error("Game is missing rounds")
  const two = asTwoPlayers(players)
  if (phase === "active" || phase === "reporting") {
    return { ...base, phase, format: "singles", players: two, rounds }
  }
  if (phase === "completed") {
    const decided = decidedSingle(rounds[0])
    const ratingChanges = readChanges(item.ratingChanges, 2)
    if (!decided || !ratingChanges) throw new Error("Completed game is missing results")
    const completed: CompletedGame = {
      ...base,
      phase,
      format: "singles",
      players: two,
      rounds: [decided],
      ratingChanges: requireTwo(ratingChanges),
    }
    return completed
  }
  throw new Error(`Unknown game phase ${phase}`)
}

function asFourPlayers(players: Player[]): FourPlayers {
  return requireFour(players)
}

function asTwoPlayers(players: Player[]): TwoPlayers {
  return requireTwo(players)
}

function decidedRounds(rounds: ThreeRounds): ThreeDecided | undefined {
  const converted = rounds.map((round): DecidedRound | undefined => {
    if (round.winner === null) return undefined
    return { home: round.home, away: round.away, winner: round.winner }
  })
  const [first, second, third] = converted
  if (!first || !second || !third) return undefined
  return [first, second, third]
}

function decidedSingle(round: RoundOf<"singles">): DecidedRoundOf<"singles"> | undefined {
  if (round.winner === null) return undefined
  return { home: round.home, away: round.away, winner: round.winner }
}

function readDoublesRounds(value: unknown): ThreeRounds | undefined {
  if (!Array.isArray(value) || value.length !== 3) return undefined
  const rounds = value.map(readRound)
  const [first, second, third] = rounds
  if (!first || !second || !third) return undefined
  return [first, second, third]
}

function readMatchRounds(value: unknown): [RoundOf<"match">] | undefined {
  if (!Array.isArray(value) || value.length !== 1) return undefined
  const round = readRound(value[0])
  if (!round) return undefined
  return [round]
}

function decidedPair(round: Round | undefined): DecidedRoundOf<"match"> | undefined {
  if (!round || round.winner === null) return undefined
  return { home: round.home, away: round.away, winner: round.winner }
}

function readSinglesRounds(value: unknown): [RoundOf<"singles">] | undefined {
  if (!Array.isArray(value) || value.length !== 1) return undefined
  const round = readSoloRound(value[0])
  if (!round) return undefined
  return [round]
}

function readRound(value: unknown): Round | undefined {
  if (!isRecord(value)) return undefined
  const home = readPair(value.home)
  const away = readPair(value.away)
  const winner = readWinner(value.winner)
  if (!home || !away || winner === undefined) return undefined
  return { home, away, winner }
}

function readSoloRound(value: unknown): RoundOf<"singles"> | undefined {
  if (!isRecord(value)) return undefined
  const home = readSolo(value.home)
  const away = readSolo(value.away)
  const winner = readWinner(value.winner)
  if (!home || !away || winner === undefined) return undefined
  return { home, away, winner }
}

function readPair(value: unknown): [Player, Player] | undefined {
  const players = readPlayers(value)
  if (!players || players.length !== 2) return undefined
  const [first, second] = players
  if (!first || !second) return undefined
  return [first, second]
}

function readSolo(value: unknown): [Player] | undefined {
  const players = readPlayers(value)
  if (!players || players.length !== 1) return undefined
  const [first] = players
  if (!first) return undefined
  return [first]
}

function readWinner(value: unknown): Side | null | undefined {
  if (value === "none" || value === null) return null
  if (value === "home" || value === "away") return value
  return undefined
}

function readChanges(value: unknown, size: 2 | 4): RatingChange[] | undefined {
  if (!Array.isArray(value) || value.length !== size) return undefined
  const changes = value.map(readChange)
  if (changes.some((change) => change === undefined)) return undefined
  return changes as RatingChange[]
}

function readChange(value: unknown): RatingChange | undefined {
  if (!isRecord(value)) return undefined
  const userId = readString(value.userId)
  const displayName = readString(value.displayName)
  const before = readNumber(value.before)
  const after = readNumber(value.after)
  const wins = readNumber(value.wins)
  const losses = readNumber(value.losses)
  if (!userId || displayName === undefined || before === undefined || after === undefined || wins === undefined || losses === undefined) {
    return undefined
  }
  return { userId, displayName, before, after, wins, losses }
}

function readFormat(value: unknown): GameFormat | undefined {
  if (value === undefined) return "doubles"
  if (value === "doubles" || value === "singles" || value === "match" || value === "random" || value === "pending") {
    return value
  }
  return undefined
}

function readRating(value: unknown): Rating | undefined {
  if (!isRecord(value)) return undefined
  const elo = readNumber(value.elo)
  const wins = readNumber(value.wins)
  const losses = readNumber(value.losses)
  if (elo === undefined || wins === undefined || losses === undefined) return undefined
  return { elo, wins, losses }
}

function readPlayers(value: unknown): Player[] | undefined {
  if (!Array.isArray(value)) return undefined
  const players: Player[] = []
  for (const item of value) {
    const player = readPlayer(item)
    if (!player) return undefined
    players.push(player)
  }
  return players
}

function readPlayer(value: unknown): Player | undefined {
  if (!isRecord(value)) return undefined
  const userId = readString(value.userId)
  const displayName = readString(value.displayName)
  if (!userId || displayName === undefined) return undefined
  return { userId, displayName }
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
