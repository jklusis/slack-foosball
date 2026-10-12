import { handle } from "./handler"
import { loadConfig } from "./config"
import { slackChannelPoster } from "./slack/chat"
import { fetchPoster } from "./slack/reply"
import { DynamoRepository } from "./storage/dynamo"

const config = loadConfig(process.env)
const repo = new DynamoRepository(config.gamesTable, config.playersTable)

export async function handler(event: unknown) {
  return handle(event, {
    config,
    repo,
    poster: fetchPoster,
    channel: slackChannelPoster(config.botToken),
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
  })
}
