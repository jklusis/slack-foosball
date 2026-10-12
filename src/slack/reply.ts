export type SlackPoster = {
  post(url: string, body: Record<string, unknown>): Promise<void>
}

export const fetchPoster: SlackPoster = {
  async post(url, body) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(2000),
    })
    if (!response.ok) {
      throw new Error(`Slack response_url returned ${response.status}`)
    }
  },
}
