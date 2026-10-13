import type { Click, Player } from "../domain/types"
import { actionId, decodePick, isPick } from "./actions"

export type ParsedSlack =
  | { kind: "challenge"; challenge: string }
  | { kind: "ignore" }
  | { kind: "help"; channelId: string }
  | { kind: "unknown"; channelId: string }
  | { kind: "ping"; channelId: string }
  | {
      kind: "open"
      format: "singles" | "pending"
      teamId: string
      channelId: string
      userId: string
      displayName: string
    }
  | { kind: "top"; teamId: string; channelId: string }
  | {
      kind: "action"
      teamId: string
      gameId: string
      channelId: string
      messageTs: string
      responseUrl: string
      actor: Player
      action: Click
    }
  | { kind: "invalid-action"; responseUrl: string; channelId?: string; userId?: string }

export function parseSlackBody(rawBody: string): ParsedSlack | undefined {
  const trimmed = rawBody.trim()
  if (trimmed.startsWith("{")) return parseEvent(trimmed)
  const params = new URLSearchParams(rawBody)
  const payload = params.get("payload")
  if (payload !== null) return parsePayload(payload)
  return undefined
}

function parseEvent(raw: string): ParsedSlack | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (!isRecord(parsed)) return undefined
  if (parsed.type === "url_verification") {
    const challenge = readString(parsed.challenge)
    return challenge ? { kind: "challenge", challenge } : undefined
  }
  if (parsed.type !== "event_callback" || !isRecord(parsed.event)) return { kind: "ignore" }
  if (parsed.event.type !== "app_mention") return { kind: "ignore" }
  return parseMention(parsed.event, readString(parsed.team_id))
}

function parseMention(event: Record<string, unknown>, teamId: string | undefined): ParsedSlack | undefined {
  const channelId = readString(event.channel)
  if (!channelId) return undefined
  const command = mentionedCommand(readString(event.text) ?? "")
  if (command === "ping") return { kind: "ping", channelId }
  if (command === "info") return { kind: "help", channelId }
  if (command === "" || !isGameCommand(command)) return { kind: "unknown", channelId }
  const resolvedTeam = teamId ?? readString(event.team)
  if (!resolvedTeam) return undefined
  if (command === "top") return { kind: "top", teamId: resolvedTeam, channelId }
  const userId = readString(event.user)
  if (!userId) return undefined
  return {
    kind: "open",
    format: command === "1v1" ? "singles" : "pending",
    teamId: resolvedTeam,
    channelId,
    userId,
    displayName: userId,
  }
}

function isGameCommand(command: string): command is "1v1" | "2v2" | "top" {
  return command === "1v1" || command === "2v2" || command === "top"
}

function mentionedCommand(text: string): string {
  return text.replace(/^\s*<@[^>\s]+(?:\|[^>]+)?>\s*/, "").trim().toLowerCase()
}

function parsePayload(payload: string): ParsedSlack | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return undefined
  }
  if (!isRecord(parsed) || parsed.type !== "block_actions") return undefined
  const teamId = readString(isRecord(parsed.team) ? parsed.team.id : undefined)
  const responseUrl = readString(parsed.response_url)
  const actor = readActor(parsed.user)
  const channelId = readChannelId(parsed)
  const messageTs = readMessageTs(parsed)
  const action = Array.isArray(parsed.actions) ? parsed.actions[0] : undefined
  if (!teamId || !responseUrl || !actor || !isRecord(action)) return undefined

  const actionIdValue = readString(action.action_id)
  const value = readString(action.value) ?? ""
  const click = clickFrom(actionIdValue, value)
  if (!click) return { kind: "invalid-action", responseUrl, channelId, userId: actor.userId }
  if (!channelId || !messageTs) return undefined
  return {
    kind: "action",
    teamId,
    gameId: click.gameId,
    channelId,
    messageTs,
    responseUrl,
    actor,
    action: click.action,
  }
}

function readChannelId(payload: Record<string, unknown>): string | undefined {
  const channel = isRecord(payload.channel) ? readString(payload.channel.id) : undefined
  const container = isRecord(payload.container) ? readString(payload.container.channel_id) : undefined
  return channel ?? container
}

function readMessageTs(payload: Record<string, unknown>): string | undefined {
  const container = isRecord(payload.container) ? readString(payload.container.message_ts) : undefined
  const message = isRecord(payload.message) ? readString(payload.message.ts) : undefined
  return container ?? message
}

function clickFrom(
  id: string | undefined,
  value: string,
): { gameId: string; action: Click } | undefined {
  if (!id || !value) return undefined
  if (isPick(id)) {
    const picked = decodePick(value)
    if (!picked) return undefined
    return {
      gameId: picked.gameId,
      action: { type: "pick", round: picked.round, side: picked.side },
    }
  }
  switch (id) {
    case actionId.modeRandom:
      return { gameId: value, action: { type: "mode", mode: "random" } }
    case actionId.modeTeams:
      return { gameId: value, action: { type: "mode", mode: "teams" } }
    case actionId.modeLong:
      return { gameId: value, action: { type: "mode", mode: "long" } }
    case actionId.join:
      return { gameId: value, action: { type: "join" } }
    case actionId.joinA:
      return { gameId: value, action: { type: "join", team: "A" } }
    case actionId.joinB:
      return { gameId: value, action: { type: "join", team: "B" } }
    case actionId.leave:
      return { gameId: value, action: { type: "leave" } }
    case actionId.cancel:
      return { gameId: value, action: { type: "cancel" } }
    case actionId.start:
      return { gameId: value, action: { type: "start" } }
    case actionId.finish:
      return { gameId: value, action: { type: "finish" } }
    case actionId.save:
      return { gameId: value, action: { type: "save" } }
    default:
      return undefined
  }
}

function readActor(value: unknown): Player | undefined {
  if (!isRecord(value)) return undefined
  const userId = readString(value.id)
  if (!userId) return undefined
  const username = readString(value.username)
  const name = readString(value.name)
  return { userId, displayName: username || name || userId }
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
