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
      inactiveDays: 30,
    })
  })

  it("reads the inactivity limit and rejects a value that is not a positive whole number", () => {
    const base = {
      FOOSBALL_API_KEY: "key",
      SLACK_SIGNING_SECRET: "secret",
      SLACK_BOT_TOKEN: "xoxb-test",
      GAMES_TABLE: "games",
      PLAYERS_TABLE: "players",
    }
    expect(loadConfig({ ...base, FOOSBALL_INACTIVE_DAYS: "14" }).inactiveDays).toBe(14)
    expect(loadConfig({ ...base, FOOSBALL_INACTIVE_DAYS: "" }).inactiveDays).toBe(30)
    for (const bad of ["0", "-3", "2.5", "1e2", "a week"]) {
      expect(() => loadConfig({ ...base, FOOSBALL_INACTIVE_DAYS: bad })).toThrow(/FOOSBALL_INACTIVE_DAYS/)
    }
  })
})
