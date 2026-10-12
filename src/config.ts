export type Config = {
  apiKey: string
  signingSecret: string
  botToken: string
  gamesTable: string
  playersTable: string
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const apiKey = env.FOOSBALL_API_KEY
  const signingSecret = env.SLACK_SIGNING_SECRET
  const botToken = env.SLACK_BOT_TOKEN
  const gamesTable = env.GAMES_TABLE
  const playersTable = env.PLAYERS_TABLE
  if (!apiKey || !signingSecret || !botToken || !gamesTable || !playersTable) {
    throw new Error(
      "FOOSBALL_API_KEY, SLACK_SIGNING_SECRET, SLACK_BOT_TOKEN, GAMES_TABLE, and PLAYERS_TABLE are required",
    )
  }
  return { apiKey, signingSecret, botToken, gamesTable, playersTable }
}
