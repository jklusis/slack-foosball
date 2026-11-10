import { afterEach, describe, expect, it, vi } from "vitest"
import { slackChannelPoster } from "../../src/slack/chat"

const view = { text: "Ready <@A>?", blocks: [] }

function stubSlack(): Array<Record<string, unknown>> {
  const bodies: Array<Record<string, unknown>> = []
  vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
    bodies.push(JSON.parse(init.body) as Record<string, unknown>)
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  })
  return bodies
}

describe("slackChannelPoster", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("posts into the game's thread when given a thread ts, and to the channel otherwise", async () => {
    const bodies = stubSlack()
    const poster = slackChannelPoster("xoxb-test")
    await poster.post("C1", view, "111.222")
    await poster.post("C1", view)
    expect(bodies[0]).toMatchObject({ channel: "C1", thread_ts: "111.222" })
    expect(bodies[1]).toMatchObject({ channel: "C1" })
    expect(bodies[1]).not.toHaveProperty("thread_ts")
  })
})
