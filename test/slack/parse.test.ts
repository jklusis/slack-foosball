import { describe, expect, it } from "vitest"
import { parseSlackBody } from "../../src/slack/parse"

describe("parseSlackBody", () => {
  it("reads mentions for 1v1, 2v2, top, info, and ping, and no longer opens a 2v2x3", () => {
    expect(parseSlackBody(mention("1V1"))).toMatchObject({
      kind: "open",
      format: "singles",
      channelId: "C1",
      userId: "U1",
      displayName: "U1",
    })
    expect(parseSlackBody(mention("<@UBOT|Foosball> 2v2", true))).toMatchObject({
      kind: "open",
      format: "2v2",
    })
    expect(parseSlackBody(mention("2v2x3"))).toEqual({ kind: "unknown", channelId: "C1" })
    expect(parseSlackBody(mention("top"))).toMatchObject({ kind: "top", teamId: "T1", channelId: "C1" })
    expect(parseSlackBody(mention("info"))).toMatchObject({ kind: "help", channelId: "C1" })
    expect(parseSlackBody(mention(""))).toMatchObject({ kind: "unknown", channelId: "C1" })
    expect(parseSlackBody(mention("begin"))).toMatchObject({ kind: "unknown", channelId: "C1" })
    expect(parseSlackBody(mention("help"))).toMatchObject({ kind: "unknown", channelId: "C1" })
    expect(parseSlackBody(mention("ping"))).toEqual({ kind: "ping", channelId: "C1" })
    expect(
      parseSlackBody(JSON.stringify({ type: "event_callback", event: { type: "message", text: "1v1" } })),
    ).toEqual({ kind: "ignore" })
  })

  it("reads a 2v2 mode button", () => {
    for (const mode of ["random", "teams", "long"] as const) {
      expect(parseSlackBody(click(`game_2v2_${mode}`, "game-1"))).toMatchObject({
        kind: "action",
        gameId: "game-1",
        action: { type: "choose2v2", mode },
      })
    }
    expect(parseSlackBody(click("game_2v2_other", "game-1"))).toMatchObject({ kind: "invalid-action" })
  })

  it("reads a pick button", () => {
    const body = new URLSearchParams({
      payload: JSON.stringify({
        type: "block_actions",
        team: { id: "T1" },
        user: { id: "U2", username: "ben" },
        channel: { id: "C1" },
        message: { ts: "111.222" },
        response_url: "https://hooks.slack.com/actions/1",
        actions: [{ action_id: "game_pick_away", value: "game-1:2:away" }],
      }),
    }).toString()
    expect(parseSlackBody(body)).toEqual({
      kind: "action",
      teamId: "T1",
      gameId: "game-1",
      channelId: "C1",
      messageTs: "111.222",
      responseUrl: "https://hooks.slack.com/actions/1",
      actor: { userId: "U2", displayName: "ben" },
      action: { type: "pick", round: 2, side: "away" },
    })
  })
})

function mention(text: string, raw = false): string {
  return JSON.stringify({
    type: "event_callback",
    team_id: "T1",
    event: {
      type: "app_mention",
      user: "U1",
      text: raw ? text : text.length === 0 ? "<@UBOT>" : `<@UBOT> ${text}`,
      channel: "C1",
    },
  })
}

function click(actionId: string, value: string): string {
  return new URLSearchParams({
    payload: JSON.stringify({
      type: "block_actions",
      team: { id: "T1" },
      user: { id: "U2", username: "ben" },
      channel: { id: "C1" },
      message: { ts: "111.222" },
      response_url: "https://hooks.slack.com/actions/1",
      actions: [{ action_id: actionId, value }],
    }),
  }).toString()
}
