import { rankStandings } from "../domain/ladder"
import type {
  ActiveGame,
  CancelledGame,
  CompletedGame,
  GameFormat,
  Game,
  Ladder,
  OpenGame,
  Player,
  PlayerStanding,
  ReportingGame,
  SetupGame,
  Side,
} from "../domain/types"
import { actionId, encodePick } from "./actions"
import { copy } from "./copy"

export type SlackText = { type: "mrkdwn"; text: string }

export type Button = {
  type: "button"
  action_id: string
  value: string
  style?: "primary" | "danger"
  text: { type: "plain_text"; text: string; emoji: true }
}

export type Block =
  | { type: "section"; text: SlackText; expand: true }
  | { type: "actions"; elements: Button[] }

export type SlackView = {
  text: string
  blocks: Block[]
}

export function renderGame(game: Game): SlackView {
  switch (game.phase) {
    case "setup":
      return renderSetup(game)
    case "open":
      return renderOpen(game)
    case "active":
      return renderActive(game)
    case "reporting":
      return renderReporting(game)
    case "completed":
      return renderCompleted(game)
    case "cancelled":
      return renderCancelled(game)
  }
}

export function renderLadder(ladder: Ladder): SlackView {
  const text = `${ladderSection("2v2", ladder.doubles)}\n\n${ladderSection("1v1", ladder.singles)}`
  return { text: "Foosball ratings", blocks: [section(text)] }
}

export function renderHelp(): SlackView {
  return { text: copy.info, blocks: [section(copy.info)] }
}

export function renderUnknown(): SlackView {
  return { text: copy.unknown, blocks: [section(copy.unknown)] }
}

export function renderPong(): SlackView {
  return { text: copy.pong, blocks: [section(copy.pong)] }
}

function renderSetup(game: SetupGame): SlackView {
  return {
    text: "New 2v2",
    blocks: [
      section("*New 2v2*\nChoose how to play."),
      actions([
        button(actionId.modeRandom, "Single 2v2 game, random assignments", game.id),
        button(actionId.modeTeams, "Single 2v2 game, manual team join", game.id),
        button(actionId.modeLong, "Long 2v2 game, each plays with everyone", game.id),
        button(actionId.cancel, "Cancel", game.id, "danger"),
      ]),
    ],
  }
}

function renderOpen(game: OpenGame): SlackView {
  if (game.format === "match") return renderOpenMatch(game)
  const size = rosterSize(game.format)
  const heading = openHeading(game.format)
  const roster = Array.from({ length: size }, (_, index) => {
    const player = game.players[index]
    return `${index + 1}. ${player ? mention(player) : "_waiting_"}`
  }).join("\n")
  const note = game.format === "random" ? "\nTeams are drawn at random when the game starts." : ""
  const text = `*${heading}*${note}\nJoin the game (${game.players.length}/${size})\n\n${roster}`
  const buttons: Button[] = []
  if (game.players.length === size) buttons.push(button(actionId.start, "Start", game.id, "primary"))
  buttons.push(
    button(actionId.join, "Join", game.id),
    button(actionId.leave, "Leave", game.id),
    button(actionId.cancel, "Cancel", game.id, "danger"),
  )
  return {
    text: `${heading} (${game.players.length}/${size})`,
    blocks: [section(text), actions(buttons)],
  }
}

function renderOpenMatch(game: Extract<OpenGame, { format: "match" }>): SlackView {
  const label = formatLabel(game.format)
  const text = `*New ${label} game*\n${teamLines("Team A", game.teamA)}\n${teamLines("Team B", game.teamB)}`
  const buttons: Button[] = []
  if (game.teamA.length === 2 && game.teamB.length === 2) {
    buttons.push(button(actionId.start, "Start", game.id, "primary"))
  }
  buttons.push(
    button(actionId.joinA, "Join A", game.id),
    button(actionId.joinB, "Join B", game.id),
    button(actionId.leave, "Leave", game.id),
    button(actionId.cancel, "Cancel", game.id, "danger"),
  )
  return {
    text: `New ${label} game`,
    blocks: [section(text), actions(buttons)],
  }
}

function teamLines(name: string, players: readonly Player[]): string {
  const roster = players.length === 0 ? "" : `\n${players.map((player) => mention(player)).join("\n")}`
  return `*${name} (${players.length}/2)*${roster}`
}

function renderActive(game: ActiveGame): SlackView {
  const label = formatLabel(game.format)
  const names = game.players.map(mention).join(", ")
  const lines = listLines(game.rounds.map((round) => matchup(round)))
  const text = `*${label} in progress*\n${names}\n\n${lines}`
  return {
    text: `${label} in progress`,
    blocks: [
      section(text),
      actions([
        button(actionId.finish, "Game finished", game.id, "primary"),
        button(actionId.cancel, "Cancel game", game.id, "danger"),
      ]),
    ],
  }
}

function renderReporting(game: ReportingGame): SlackView {
  const lines = listLines(game.rounds.map((round) => resultLine(round)))
  const blocks: Block[] = [section(`*Who won?*\n${lines}`)]
  game.rounds.forEach((round, index) => {
    const roundIndex = asRoundIndex(index)
    blocks.push(
      actions([
        sideButton(game.id, roundIndex, "home", round),
        sideButton(game.id, roundIndex, "away", round),
      ]),
    )
  })
  if (game.rounds.every((round) => round.winner !== null)) {
    blocks.push(actions([button(actionId.save, "Save results", game.id, "primary")]))
  }
  return { text: "Who won?", blocks }
}

function renderCompleted(game: CompletedGame): SlackView {
  const results = listLines(game.rounds.map((round) => beat(round)))
  const ratings = game.ratingChanges.map((change) => {
    const delta = change.after - change.before
    const signed = delta > 0 ? `+${delta}` : `${delta}`
    return `<@${change.userId}> ${change.before} → ${change.after} (${signed}) · ${change.wins}W ${change.losses}L`
  })
  const label = formatLabel(game.format)
  const text = `*${label} complete*\n${results}\n\n*Ratings*\n${ratings.join("\n")}`
  return { text: `${label} complete`, blocks: [section(text)] }
}

function renderCancelled(game: CancelledGame): SlackView {
  const label = formatLabel(game.format)
  const text = `*${label} cancelled*\nCancelled by ${mention(game.cancelledBy)}.`
  return { text: `${label} cancelled`, blocks: [section(text)] }
}

type ShownRound = {
  home: readonly Player[]
  away: readonly Player[]
  winner: Side | null
}

function sideButton(gameId: string, round: 0 | 1 | 2, side: Side, match: ShownRound): Button {
  const pair = side === "home" ? match.home : match.away
  const style = match.winner === side ? "primary" : undefined
  const id = side === "home" ? actionId.pickHome : actionId.pickAway
  return button(id, pairLabel(pair), encodePick(gameId, round, side), style)
}

function resultLine(round: ShownRound): string {
  const base = matchup(round)
  if (round.winner === null) return base
  const winner = round.winner === "home" ? round.home : round.away
  return `${base} — *${sideMentions(winner)}*`
}

function beat(round: { home: readonly Player[]; away: readonly Player[]; winner: Side }): string {
  const winner = round.winner === "home" ? round.home : round.away
  const loser = round.winner === "home" ? round.away : round.home
  return `${sideMentions(winner)} beat ${sideMentions(loser)}`
}

function matchup(round: ShownRound): string {
  return `${sideMentions(round.home)} vs ${sideMentions(round.away)}`
}

function sideMentions(players: readonly Player[]): string {
  return players.map(mention).join(" + ")
}

function pairLabel(players: readonly Player[]): string {
  return players.map((player) => player.displayName).join(" & ")
}

function ladderSection(title: string, standings: readonly PlayerStanding[]): string {
  const ranked = rankStandings(standings)
  if (ranked.length === 0) return `*${title}*\n${copy.emptyFormat}`
  const lines = ranked.map(
    (standing, index) =>
      `${index + 1}. ${standing.displayName} — ${standing.elo} · ${standing.wins}W ${standing.losses}L`,
  )
  return `*${title}*\nname, ELO, wins, losses\n${lines.join("\n")}`
}

function listLines(lines: string[]): string {
  if (lines.length === 1) return lines[0] ?? ""
  return lines.map((line, index) => `${index + 1}. ${line}`).join("\n")
}

function openHeading(format: "singles" | "doubles" | "random"): string {
  const label = formatLabel(format)
  return format === "doubles" ? `New ${label}` : `New ${label} game`
}

function formatLabel(format: GameFormat): string {
  if (format === "singles") return "1v1"
  if (format === "doubles") return "2v2 long game"
  return "2v2"
}

function rosterSize(format: "singles" | "doubles" | "random"): number {
  return format === "singles" ? 2 : 4
}

function asRoundIndex(index: number): 0 | 1 | 2 {
  if (index === 0 || index === 1 || index === 2) return index
  throw new Error("Unexpected round")
}

function mention(player: Player): string {
  return `<@${player.userId}>`
}

function section(text: string): Block {
  return { type: "section", text: { type: "mrkdwn", text }, expand: true }
}

function actions(elements: Button[]): Block {
  return { type: "actions", elements }
}

function button(
  id: string,
  label: string,
  value: string,
  style?: "primary" | "danger",
): Button {
  const element: Button = {
    type: "button",
    action_id: id,
    value,
    text: { type: "plain_text", text: clip(label), emoji: true },
  }
  if (style) element.style = style
  return element
}

function clip(label: string): string {
  const clean = label.replace(/\s+/g, " ").trim()
  if (clean.length <= 75) return clean
  return `${clean.slice(0, 74)}…`
}
