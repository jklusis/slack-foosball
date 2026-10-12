import { randomBytes } from "node:crypto"
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs"

const keyFile = ".foosball-api-key"

export function awsEnv(options: { createKey: boolean }): NodeJS.ProcessEnv {
  const signingSecret = process.env.SLACK_SIGNING_SECRET?.trim()
  const botToken = process.env.SLACK_BOT_TOKEN?.trim()
  if (!signingSecret) {
    console.error("SLACK_SIGNING_SECRET is required. Copy it from the Slack app Basic Information page.")
    process.exit(1)
  }
  if (!botToken) {
    console.error("SLACK_BOT_TOKEN is required. Copy the Bot User OAuth Token from OAuth & Permissions.")
    process.exit(1)
  }

  let apiKey = process.env.FOOSBALL_API_KEY?.trim()
  if (!apiKey && existsSync(keyFile)) apiKey = readFileSync(keyFile, "utf8").trim()
  if (!apiKey && options.createKey) {
    apiKey = randomBytes(32).toString("hex")
    writeFileSync(keyFile, `${apiKey}\n`, { mode: 0o600 })
    chmodSync(keyFile, 0o600)
    console.log(`Saved a new API key to ${keyFile}. Reuse it on later deploys.`)
  }
  if (!apiKey) {
    console.error(`Set FOOSBALL_API_KEY, or deploy once so ${keyFile} exists.`)
    process.exit(1)
  }

  return {
    ...process.env,
    FOOSBALL_API_KEY: apiKey,
    SLACK_SIGNING_SECRET: signingSecret,
    SLACK_BOT_TOKEN: botToken,
  }
}
