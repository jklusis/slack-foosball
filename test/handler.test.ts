import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"
import { apply } from "../src/domain/game"
import { pairings } from "../src/domain/pairings"
import { requireFour } from "../src/domain/types"
import { handle } from "../src/handler"
import { copy } from "../src/slack/copy"
import { MemoryRepository } from "../src/storage/memory"
import type { GameRepository } from "../src/storage/repository"

const signingSecret = "8f742231b10e8888abcd99yyyzzz85a5"
const apiKey = "test-api-key"
const timestamp = "1531420618"
const nowMs = Number(timestamp) * 1000

describe("handle", () => {
  it("rejects a missing key and a bad signature before touching storage", async () => {
    const repo = throwingRepo()
    const { deps } = harness(repo)
    const body = mention("2v2x3")
    expect((await handle(event(body, "wrong-key"), deps)).statusCode).toBe(401)
    expect((await handle(event(body, apiKey, "v0=deadbeef"), deps)).statusCode).toBe(401)
  })

  it("posts a new game without adding the caller", async () => {
    const { deps, repo, messages } = harness()
    const response = await handle(event(mention("2v2x3")), deps)
    expect(response).toEqual({ statusCode: 200, body: "" })
    expect(messages[0]?.channelId).toBe("C1")
    expect(messages[0]?.text).toContain("New 2v2 long game")
    const blocks = messages[0]?.blocks as Array<{ type: string; elements?: Array<{ action_id: string }> }>
    expect(blocks.flatMap((block) => block.elements?.map((element) => element.action_id) ?? [])).toContain("game_join")
    const stored = await repo.get("T1", "game-1")
    expect(stored?.game.phase === "open" && stored.game.players).toEqual([])
    expect(stored?.game.phase === "open" && stored.game.format).toBe("doubles")
    expect(stored?.game.createdBy).toBe("U1")
  })

  it("opens a 1v1 in the channel that mentioned the bot", async () => {
    const { deps, repo, messages } = harness()
    const response = await handle(event(mention("1v1", "C2")), deps)
    expect(response.body).toBe("")
    expect(messages[0]?.channelId).toBe("C2")
    expect(messages[0]?.text).toContain("New 1v1 game (0/2)")
    const stored = await repo.get("T1", "game-1")
    expect(stored?.game.phase === "open" && stored.game.format).toBe("singles")
    expect(stored?.game.channelId).toBe("C2")
    expect(stored?.game.phase === "open" && stored.game.players).toEqual([])
  })

  it("shows info in the channel without opening a game", async () => {
    const { deps, repo, messages } = harness()
    const response = await handle(event(mention("info")), deps)
    expect(response.body).toBe("")
    expect(messages[0]?.text).toContain("own ladder")
    expect(messages[0]?.text).toContain("@Foosball 1v1")
    expect(messages[0]?.text).toContain("everyone partners with everyone once")
    expect(await repo.get("T1", "game-1")).toBeUndefined()

    await handle(event(mention("")), deps)
    expect(messages[1]?.text).toBe("Unknown command, use `info` for available commands")
    await handle(event(mention("begin")), deps)
    expect(messages[2]?.text).toBe("Unknown command, use `info` for available commands")
    expect(await repo.get("T1", "game-1")).toBeUndefined()
  })

  it("answers ping with pong and does not read storage", async () => {
    const { deps, messages } = harness(throwingRepo())
    const response = await handle(event(mention("PiNg")), deps)
    expect(response).toEqual({ statusCode: 200, body: "" })
    expect(messages).toEqual([expect.objectContaining({ channelId: "C1", text: "pong!" })])
  })

  it("answers Slack's URL challenge and certificate check", async () => {
    const { deps, messages } = harness(throwingRepo())
    const challenge = JSON.stringify({ type: "url_verification", challenge: "abc" })
    const verified = await handle(event(challenge), deps)
    expect(JSON.parse(verified.body)).toEqual({ challenge: "abc" })

    const probe = await handle(
      {
        body: "ssl_check=1&token=ignored",
        isBase64Encoded: false,
        queryStringParameters: { key: apiKey },
        headers: {},
      },
      deps,
    )
    expect(probe).toEqual({ statusCode: 200, body: "" })
    expect(messages).toEqual([])
  })

  it("verifies a base64-encoded body and ignores other events", async () => {
    const { deps, repo, messages } = harness()
    const body = mention("2v2x3")
    const encoded = await handle(
      {
        ...event(body),
        body: Buffer.from(body).toString("base64"),
        isBase64Encoded: true,
      },
      deps,
    )
    expect(encoded.statusCode).toBe(200)
    const other = await handle(
      event(JSON.stringify({ type: "event_callback", team_id: "T1", event: { type: "message", channel: "C1", text: "1v1" } })),
      deps,
    )
    expect(other).toEqual({ statusCode: 200, body: "" })
    expect(messages).toHaveLength(1)
    expect(await repo.listLadders("T1")).toEqual({ doubles: [], singles: [] })
    const games = await repo.get("T1", "game-1")
    expect(games?.game.phase).toBe("open")
  })

  it("updates the message when a player joins and leaves it unchanged when the game is full", async () => {
    const { deps, repo, updates, notes } = harness()
    await repo.create({
      id: "game-1",
      teamId: "T1",
      channelId: "C1",
      createdBy: "U9",
      phase: "open",
      format: "doubles",
      players: [user("A"), user("B"), user("C"), user("D")],
    })
    const body = payload({ action_id: "game_join", value: "game-1", user: "E", username: "eve" })
    const response = await handle(event(body), deps)
    expect(response).toEqual({ statusCode: 200, body: "" })
    expect(notes[0]).toEqual({ channelId: "C1", userId: "E", text: copy.gameFull })
    expect(updates).toEqual([])
    expect((await repo.get("T1", "game-1"))?.game.phase === "open" && (await repo.get("T1", "game-1"))?.game.players).toHaveLength(4)

    await repo.create({
      id: "game-2",
      teamId: "T1",
      channelId: "C1",
      createdBy: "U9",
      phase: "open",
      format: "doubles",
      players: [],
    })
    const join = payload({ action_id: "game_join", value: "game-2", user: "U1", username: "ada" })
    await handle(event(join), deps)
    const posted = updates.at(-1)
    expect(posted?.messageTs).toBe("111.222")
    expect(JSON.stringify(posted?.blocks)).toContain("<@U1>")
    const stored = await repo.get("T1", "game-2")
    expect(stored?.game.phase === "open" && stored.game.players.map((player) => player.userId)).toEqual(["U1"])
  })

  it("posts the ladder in rating order", async () => {
    const { repo } = harness()
    await repo.create({
      id: "game-1",
      teamId: "T1",
      channelId: "C1",
      createdBy: "U9",
      phase: "open",
      format: "doubles",
      players: [],
    })
    const four = requireFour([user("A", "Ada"), user("B", "Ben"), user("C", "Cia"), user("D", "Dan")])
    const rounds = pairings(four)
    const [first, second, third] = rounds
    if (!first || !second || !third) throw new Error("missing rounds")
    await repo.compareAndSwap(1, {
      id: "game-1",
      teamId: "T1",
      channelId: "C1",
      createdBy: "U9",
      phase: "reporting",
      format: "doubles",
      players: four,
      rounds: [
        { ...first, winner: "home" },
        { ...second, winner: "home" },
        { ...third, winner: "home" },
      ],
    })
    const stored = await repo.get("T1", "game-1")
    if (!stored || stored.game.phase !== "reporting") throw new Error("expected reporting")
    const rated = apply(stored.game, { type: "save", userId: "A", ratings: new Map() })
    if (rated.kind !== "complete") throw new Error("expected complete")
    await repo.complete(stored.version, rated.game, rated.standings)

    const { deps: ladderDeps, messages } = harness(repo)
    const response = await handle(event(mention("top")), ladderDeps)
    expect(response.body).toBe("")
    const blocks = messages[0]?.blocks as Array<{ text?: { text: string } }>
    const text = blocks.map((block) => block.text?.text ?? "").join("\n")
    expect(text.indexOf("*2v2*")).toBeLessThan(text.indexOf("Ada"))
    expect(text.indexOf("Ada")).toBeLessThan(text.indexOf("Ben"))
    expect(text.indexOf("*1v1*")).toBeGreaterThan(text.indexOf("Ada"))
    expect(text).not.toContain("<@")
    expect(text).toContain("1048")
  })

  it("updates a finished game through the bot message, not the response url", async () => {
    const { deps, repo, updates, posts } = harness()
    const home = user("U1", "Ada")
    const away = user("U2", "Ben")
    await repo.create({
      id: "game-1",
      teamId: "T1",
      channelId: "C1",
      createdBy: "U1",
      phase: "open",
      format: "singles",
      players: [],
    })
    await repo.compareAndSwap(1, {
      id: "game-1",
      teamId: "T1",
      channelId: "C1",
      createdBy: "U1",
      phase: "active",
      format: "singles",
      players: [home, away],
      rounds: [{ home: [home], away: [away], winner: null }],
    })
    const response = await handle(
      event(payload({ action_id: "game_finish", value: "game-1", user: "U1", username: "ada" })),
      deps,
    )
    expect(response).toEqual({ statusCode: 200, body: "" })
    expect(posts).toEqual([])
    expect(updates[0]?.text).toContain("Who won?")
    expect((await repo.get("T1", "game-1"))?.game.phase).toBe("reporting")
  })

  it("still acknowledges the click when Slack rejects the message update", async () => {
    const { deps } = harness()
    deps.channel.ephemeral = async () => {
      throw new Error("slack down")
    }
    deps.poster = {
      async post() {
        throw new Error("slack down")
      },
    }
    const errors: unknown[] = []
    const original = console.error
    console.error = (...args: unknown[]) => {
      errors.push(args)
    }
    try {
      const response = await handle(
        event(payload({ action_id: "game_join", value: "missing", user: "U1", username: "ada" })),
        deps,
      )
      expect(response.statusCode).toBe(200)
      expect(response.body).toBe("")
      expect(errors.length).toBeGreaterThan(0)
    } finally {
      console.error = original
    }
  })
})

function harness(repo: GameRepository = new MemoryRepository()) {
  const posts: Array<{ url: string; body: Record<string, unknown> }> = []
  const messages: Array<{ channelId: string; text: string; blocks: unknown }> = []
  const updates: Array<{ channelId: string; messageTs: string; text: string; blocks: unknown }> = []
  const notes: Array<{ channelId: string; userId: string; text: string }> = []
  const deps = {
    config: { apiKey, signingSecret },
    repo,
    poster: {
      async post(url: string, body: Record<string, unknown>) {
        posts.push({ url, body })
      },
    },
    channel: {
      async post(channelId: string, view: { text: string; blocks: unknown }) {
        messages.push({ channelId, text: view.text, blocks: view.blocks })
      },
      async update(channelId: string, messageTs: string, view: { text: string; blocks: unknown }) {
        updates.push({ channelId, messageTs, text: view.text, blocks: view.blocks })
      },
      async ephemeral(channelId: string, userId: string, text: string) {
        notes.push({ channelId, userId, text })
      },
    },
    now: () => nowMs,
    newId: () => "game-1",
  }
  return { deps, repo, posts, messages, updates, notes }
}

function throwingRepo(): GameRepository {
  const fail = () => {
    throw new Error("storage should not be called")
  }
  return {
    create: fail,
    get: fail,
    compareAndSwap: fail,
    complete: fail,
    getStandings: fail,
    listLadders: fail,
  }
}

function event(body: string, key = apiKey, signatureOverride?: string) {
  return {
    body,
    isBase64Encoded: false,
    queryStringParameters: { key },
    headers: {
      "X-Slack-Signature": signatureOverride ?? sign(body),
      "X-Slack-Request-Timestamp": timestamp,
    },
  }
}

function sign(body: string): string {
  return `v0=${createHmac("sha256", signingSecret).update(`v0:${timestamp}:${body}`).digest("hex")}`
}

function mention(text: string, channel = "C1"): string {
  return JSON.stringify({
    type: "event_callback",
    team_id: "T1",
    event: {
      type: "app_mention",
      user: "U1",
      text: text.length === 0 ? "<@UBOT>" : `<@UBOT> ${text}`,
      channel,
    },
  })
}

function payload(input: { action_id: string; value: string; user: string; username: string }): string {
  return new URLSearchParams({
    payload: JSON.stringify({
      type: "block_actions",
      team: { id: "T1" },
      user: { id: input.user, username: input.username },
      channel: { id: "C1", name: "foosball" },
      message: { ts: "111.222" },
      response_url: "https://hooks.slack.com/actions/1",
      actions: [{ action_id: input.action_id, value: input.value }],
    }),
  }).toString()
}

function user(userId: string, displayName = userId) {
  return { userId, displayName }
}
