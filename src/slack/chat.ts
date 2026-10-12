import type { SlackView } from "./render"

export type ChannelPoster = {
  post(channelId: string, view: SlackView): Promise<void>
  update(channelId: string, messageTs: string, view: SlackView): Promise<void>
  ephemeral(channelId: string, userId: string, text: string): Promise<void>
}

export function slackChannelPoster(token: string): ChannelPoster {
  return {
    post(channelId, view) {
      return slackApi(token, "chat.postMessage", {
        channel: channelId,
        text: view.text,
        blocks: view.blocks,
      })
    },
    update(channelId, messageTs, view) {
      return slackApi(token, "chat.update", {
        channel: channelId,
        ts: messageTs,
        text: view.text,
        blocks: view.blocks,
      })
    },
    ephemeral(channelId, userId, text) {
      return slackApi(token, "chat.postEphemeral", {
        channel: channelId,
        user: userId,
        text,
      })
    },
  }
}

async function slackApi(token: string, method: string, body: Record<string, unknown>): Promise<void> {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(2500),
  })
  const payload = (await response.json()) as { ok?: boolean; error?: string }
  if (!response.ok || payload.ok !== true) {
    throw new Error(`Slack ${method} failed${payload.error ? `: ${payload.error}` : ""}`)
  }
}
