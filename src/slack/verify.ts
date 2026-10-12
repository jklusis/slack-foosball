import { createHmac, timingSafeEqual } from "node:crypto"

const MAX_SKEW_SECONDS = 5 * 60

export function verifySlackRequest(input: {
  signingSecret: string
  signature: string | undefined
  timestamp: string | undefined
  rawBody: string
  nowMs: number
}): boolean {
  const { signingSecret, signature, timestamp, rawBody, nowMs } = input
  if (!signature || !timestamp) return false
  const issuedAt = Number(timestamp)
  if (!Number.isFinite(issuedAt)) return false
  if (Math.abs(nowMs / 1000 - issuedAt) > MAX_SKEW_SECONDS) return false
  const expected = `v0=${createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest("hex")}`
  return safeEqual(expected, signature)
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
