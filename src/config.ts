export const defaultInactiveDays = 30

export type Config = {
  apiKey: string
  signingSecret: string
  botToken: string
  gamesTable: string
  playersTable: string
  inactiveDays: number
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
  const inactiveDays = readInactiveDays(env.FOOSBALL_INACTIVE_DAYS)
  return { apiKey, signingSecret, botToken, gamesTable, playersTable, inactiveDays }
}

export function readInactiveDays(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return defaultInactiveDays
  const days = Number(value.trim())
  if (!/^\d+$/.test(value.trim()) || days < 1) {
    throw new Error("FOOSBALL_INACTIVE_DAYS must be a whole number of days, at least 1")
  }
  return days
}
