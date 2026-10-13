import { FlowReason, Reason, type RejectReason } from "../domain/types"

export const copy = {
  notAPlayer: "Only players in this game can do that.",
  gameFull: "This game is full.",
  notInGame: "You are not in this game.",
  needFour: "Four players are needed to start.",
  needTwo: "Two players are needed to start.",
  needTeams: "Each team needs two players.",
  teamFull: "That team is full.",
  wrongPhase: "That action is no longer available.",
  resultsIncomplete: "Pick a winner for every game first.",
  missingGame: "This game is no longer available.",
  tryAgain: "Someone else updated the game. Try again.",
  pong: "pong!",
  info:
    "*Foosball*\nMention @Foosball in a channel where this app is invited. Players join the message, start when the roster is full, then record who won. Ratings start at 1000. 1v1 and 2v2 each have their own ladder, and every 2v2 mode uses the 2v2 ladder.\n\nA 2v2 starts with a choice of mode: one game with random teams, one game where players join Team A or Team B, or a long game of three games where everyone partners with everyone once. A 1v1 is one match.\n\n`@Foosball 1v1` — open a 1v1\n`@Foosball 2v2` — open a 2v2 and choose the mode\n`@Foosball top` — show both ladders\n`@Foosball info` — show this note\n`@Foosball ping` — check whether app is up",
  emptyFormat: "No rated players yet.",
  unknown: "Unknown command, use `info` for available commands",
} as const

export function rejectionText(reason: RejectReason | FlowReason): string {
  switch (reason) {
    case Reason.gameFull:
      return copy.gameFull
    case Reason.notInGame:
      return copy.notInGame
    case Reason.notAPlayer:
      return copy.notAPlayer
    case Reason.needFour:
      return copy.needFour
    case Reason.needTwo:
      return copy.needTwo
    case Reason.needTeams:
      return copy.needTeams
    case Reason.teamFull:
      return copy.teamFull
    case Reason.wrongPhase:
      return copy.wrongPhase
    case Reason.resultsIncomplete:
      return copy.resultsIncomplete
    case FlowReason.missingGame:
      return copy.missingGame
    case FlowReason.tryAgain:
      return copy.tryAgain
  }
}
