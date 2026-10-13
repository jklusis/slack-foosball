import { randomUUID } from "node:crypto"
import { handleAction } from "./app/session"
import { newGame } from "./domain/game"
import { Reason } from "./domain/types"
import { rejectionText } from "./slack/copy"
import { parseSlackBody, type ParsedSlack } from "./slack/parse"
import type { ChannelPoster } from "./slack/chat"
import { renderGame, renderHelp, renderLadder, renderPong, renderUnknown, type SlackView } from "./slack/render"
import type { SlackPoster } from "./slack/reply"
import { safeEqual, verifySlackRequest } from "./slack/verify"
import type { GameRepository } from "./storage/repository"

export type HandlerConfig = {
  apiKey: string
  signingSecret: string
}

export type Deps = {
  config: HandlerConfig
  repo: GameRepository
  poster: SlackPoster
  channel: ChannelPoster
  now: () => number
  newId?: () => string
  random?: () => number
}

type HttpResult = {
  statusCode: number
  headers?: Record<string, string>
  body: string
}

export async function handle(event: unknown, deps: Deps): Promise<HttpResult> {
  const incoming = readEvent(event)
  if (!incoming) return text(400, "")
  if (!safeEqual(incoming.query.key ?? "", deps.config.apiKey)) return text(401, "")

  // Slack signs the exact request bytes. Decode base64 first and verify that string.
  const rawBody = incoming.isBase64Encoded
    ? Buffer.from(incoming.body, "base64").toString("utf8")
    : incoming.body
  // Slack's certificate probe is unsigned. The query key still has to match.
  if (new URLSearchParams(rawBody).get("ssl_check") === "1") return text(200, "")

  const verified = verifySlackRequest({
    signingSecret: deps.config.signingSecret,
    signature: header(incoming.headers, "x-slack-signature"),
    timestamp: header(incoming.headers, "x-slack-request-timestamp"),
    rawBody,
    nowMs: deps.now(),
  })
  if (!verified) return text(401, "")

  const parsed = parseSlackBody(rawBody)
  if (!parsed) return text(400, "")
  return dispatch(parsed, deps)
}

async function dispatch(parsed: ParsedSlack, deps: Deps): Promise<HttpResult> {
  if (parsed.kind === "challenge") {
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challenge: parsed.challenge }),
    }
  }
  if (parsed.kind === "ignore") return text(200, "")
  if (parsed.kind === "ping") return say(deps.channel, parsed.channelId, renderPong())
  if (parsed.kind === "help") return say(deps.channel, parsed.channelId, renderHelp())
  if (parsed.kind === "unknown") return say(deps.channel, parsed.channelId, renderUnknown())
  if (parsed.kind === "invalid-action") {
    return note(deps, parsed, rejectionText(Reason.wrongPhase))
  }
  if (parsed.kind === "top") {
    const ladder = await deps.repo.listLadders(parsed.teamId)
    return say(deps.channel, parsed.channelId, renderLadder(ladder))
  }
  if (parsed.kind === "open") {
    const game = newGame(
      {
        id: (deps.newId ?? randomUUID)(),
        teamId: parsed.teamId,
        channelId: parsed.channelId,
        createdBy: parsed.userId,
      },
      parsed.format,
    )
    await deps.repo.create(game)
    return say(deps.channel, parsed.channelId, renderGame(game))
  }

  const outcome = await handleAction(deps.repo, parsed, deps.random)
  if (outcome.type === "ephemeral") return note(deps, parsed, rejectionText(outcome.reason))
  return revise(deps, parsed, renderGame(outcome.game))
}

async function revise(
  deps: Deps,
  parsed: { channelId: string; messageTs: string; responseUrl: string },
  view: SlackView,
): Promise<HttpResult> {
  try {
    // response_url expires after 30 minutes. chat.update keeps working on the bot's message.
    await deps.channel.update(parsed.channelId, parsed.messageTs, view)
  } catch (error) {
    console.error("Failed to update Slack message", error)
    return ack(deps.poster, parsed.responseUrl, {
      replace_original: true,
      text: view.text,
      blocks: view.blocks,
    })
  }
  return text(200, "")
}

async function note(
  deps: Deps,
  parsed: { responseUrl: string; channelId?: string; userId?: string; actor?: { userId: string } },
  textBody: string,
): Promise<HttpResult> {
  const userId = parsed.actor?.userId ?? parsed.userId
  try {
    if (parsed.channelId && userId) {
      await deps.channel.ephemeral(parsed.channelId, userId, textBody)
      return text(200, "")
    }
  } catch (error) {
    console.error("Failed to post Slack note", error)
  }
  return ack(deps.poster, parsed.responseUrl, {
    response_type: "ephemeral",
    replace_original: false,
    text: textBody,
  })
}

async function say(channel: ChannelPoster, channelId: string, view: SlackView): Promise<HttpResult> {
  try {
    // Ack only after the post. A non-200 makes Slack retry the mention.
    await channel.post(channelId, view)
  } catch (error) {
    console.error("Failed to post Slack message", error)
  }
  return text(200, "")
}

async function ack(
  poster: SlackPoster,
  url: string,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  try {
    // Ack only after the message update. Returning non-200 makes Slack retry the click.
    await poster.post(url, body)
  } catch (error) {
    console.error("Failed to update Slack message", error)
  }
  return text(200, "")
}

function text(statusCode: number, body: string): HttpResult {
  return { statusCode, body }
}

type Incoming = {
  body: string
  isBase64Encoded: boolean
  query: Record<string, string>
  headers: Record<string, string>
}

function readEvent(event: unknown): Incoming | undefined {
  if (!isRecord(event)) return undefined
  const body = event.body
  if (body !== undefined && body !== null && typeof body !== "string") return undefined
  const query = readStringMap(event.queryStringParameters)
  const headers = readStringMap(event.headers)
  if (!query || !headers) return undefined
  return {
    body: typeof body === "string" ? body : "",
    isBase64Encoded: event.isBase64Encoded === true,
    query,
    headers,
  }
}

function readStringMap(value: unknown): Record<string, string> | undefined {
  if (value === undefined || value === null) return {}
  if (!isRecord(value)) return undefined
  const entries: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") entries[key] = item
  }
  return entries
}

function header(headers: Record<string, string>, name: string): string | undefined {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name) return value
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
