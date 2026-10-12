import { describe, expect, it } from "vitest"
import { loadConfig } from "../src/config"

describe("loadConfig", () => {
  it("requires the Slack and table settings", () => {
    expect(() => loadConfig({})).toThrow(/FOOSBALL_API_KEY/)
    expect(
      loadConfig({
        FOOSBALL_API_KEY: "key",
        SLACK_SIGNING_SECRET: "secret",
        SLACK_BOT_TOKEN: "xoxb-test",
        GAMES_TABLE: "games",
        PLAYERS_TABLE: "players",
      }),
    ).toEqual({
      apiKey: "key",
      signingSecret: "secret",
      botToken: "xoxb-test",
      gamesTable: "games",
      playersTable: "players",
    })
  })
})
