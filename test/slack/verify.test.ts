import { describe, expect, it } from "vitest"
import { verifySlackRequest } from "../../src/slack/verify"

const secret = "8f742231b10e8888abcd99yyyzzz85a5"
const timestamp = "1531420618"
const rawBody = "token=xyzz0WbapA4vBCDEFasx0q6G&team_id=T1DC2JH3J&command=%2Ffoosball&text=begin"
const signature = "v0=f663e8453d504fff2fa70ad76cea405c4dceb38db962a0a7f5f72678ad06bd11"

describe("verifySlackRequest", () => {
  it("accepts a signature over the raw body", () => {
    expect(
      verifySlackRequest({
        signingSecret: secret,
        signature,
        timestamp,
        rawBody,
        nowMs: Number(timestamp) * 1000,
      }),
    ).toBe(true)
  })

  it("rejects a stale timestamp and a mismatched body", () => {
    expect(
      verifySlackRequest({
        signingSecret: secret,
        signature,
        timestamp,
        rawBody,
        nowMs: Number(timestamp) * 1000 + 6 * 60 * 1000,
      }),
    ).toBe(false)
    expect(
      verifySlackRequest({
        signingSecret: secret,
        signature,
        timestamp,
        rawBody: `${rawBody}&x=1`,
        nowMs: Number(timestamp) * 1000,
      }),
    ).toBe(false)
  })
})
