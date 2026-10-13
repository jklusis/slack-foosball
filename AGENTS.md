# Agent guide

`README.md` is the product and architecture spec. This file is how to change the code. Both apply to every coding agent: `CLAUDE.md` imports this file and Cursor reads it directly, so agent guidance lives here and nowhere else. If a change would add draws, another Slack Web API method, a second service, or CI, stop and ask.

## Commands

```bash
npm run verify    # typecheck, then tests. Run it before calling work done.
npm test
npm run typecheck
npm run deploy    # or make deploy, or make update. Needs AWS credentials, SLACK_SIGNING_SECRET, and SLACK_BOT_TOKEN. Bootstraps, then reconciles the stack.
npm run destroy   # or make destroy. Deletes the stack and both tables. Needs the same Slack env vars, because synth reads them.
```

Node.js is pinned in `.nvmrc`. `npm run verify` must pass with no AWS account and no Slack app. Do not add a Docker or LocalStack dependency for unit tests.

## How to work

- Work in vertical slices. For each slice, write the failing test first, then the code. When a change crosses layers, go domain, render, storage, handler.
- Keep the domain free of Slack payloads and AWS types. Translate at `src/slack/parse.ts` and `src/storage/codec.ts`.
- Before opening a PR, have an agent in a fresh context review the diff against this file and the README. The author's own context hides its mistakes.

## Invariants

- Ratings start at 1000 in each format, K is 32, team rating is the average (a 1v1 side is one player), games in one session apply in order.
- A 2v2 result does not change a 1v1 rating, and the reverse. Save applies ratings once. A second save renders the completed game.
- `@Foosball 2v2` opens a setup step. Choosing a mode turns it into a 2v2 with random teams, a 2v2 with chosen teams, or a 2v2 long game. All three use the 2v2 ladder.
- Join order is the pairing order for a 2v2 long game. A random-teams 2v2 draws its teams at Start. The person who mentions `@Foosball 1v1` or `@Foosball 2v2` is not on the roster until they join.
- Start exists only when the roster is full: two players for 1v1, four for 2v2. Join and Leave both exist for the whole open phase.
- After start, only those players can finish, cancel, pick, or save. Anyone can choose a mode, and anyone can cancel while the game is in setup or open.
- An inapplicable click sends an ephemeral reply and does not change the message.
- Games and players are keyed by Slack `team_id`. Games already stored keep loading after a change to the game shape.
- Verify the API key and the Slack signature on the raw body before parsing. Compare secrets in constant time. Mention replies go out with `chat.postMessage`. Button updates use `chat.update` on that message, and `response_url` is only the fallback because it expires after 30 minutes. A private note uses `chat.postEphemeral`. The HTTP response to a mention or a button click is 200, not the new message.
- Roster and phase writes are conditional. A failed condition becomes an ephemeral reply or an idempotent re-render, never a second rating update.

## Code shape

Keep it lean: clear names, the simplest design that works, and each fact in one place.

- Dependencies point inward. `handler.ts` and `app/` call `domain/`, and reach storage only through the repository interface. `slack/` and `storage/` translate to and from domain types. `domain/` imports nothing outside itself and does no I/O; randomness and time come in as arguments.
- One module, one reason to change. Add a helper when a second caller needs it, in the module both callers already use (`rosterSize` lives in the domain, not in `render.ts` and again in `game.ts`).
- Name for scope. Code that serves one format says so (`renderSetup2v2`, `Mode2v2`), so nobody reuses it for a 1v1 by mistake.
- Before adding a branch on `format`, find the existing one and extend it. Two functions that differ only by format should be one function.
- Model `Game` as a discriminated union on `phase` and `format` so an open game cannot carry results and a completed game cannot omit them.
- Expected user outcomes (`not-a-player`, `game-full`) are return values. Throw only when the process cannot continue (bad config, failed I/O, a broken invariant).
- Strict TypeScript. No `any`, and no non-null assertion to paper over a missing check.
- Parse and validate at the handler boundary. The rest of the code accepts domain types.
- Prefer a short pure function over a class that only holds functions.
- Comments explain a non-obvious constraint (Slack's 3 second ack, raw-body signature). Do not comment the mechanics the code already shows.

```typescript
// Bad: blocks in the HTTP response to a click.
return { statusCode: 200, body: JSON.stringify({ replace_original: true, blocks }) }
// Good: acknowledge, then update the bot's message. response_url expires after 30 minutes.
await deps.channel.update(channelId, messageTs, view)
return { statusCode: 200, body: "" }

// Bad: a throw for something a player did.
if (!hasPlayer(game.players, userId)) throw new Error("not a player")
// Good: a value the edge turns into an ephemeral note.
if (!hasPlayer(game.players, userId)) return reject(Reason.notAPlayer)
```

## Tests

Use Vitest, with no AWS account and no network. Test behavior a player would notice or a bug that would corrupt a rating or a roster.

- Cover the transition table: choose a mode, join, leave, start too early, start at four, non-player after start, cancel, pick, save, save again.
- Cover concurrent-style conditions on the repository: two joins of the same user, a fifth player, a third player on a 1v1, two saves, and a singles save that leaves the doubles rating in place.
- Handler tests use a fake repository and a fake Slack reply. Assert whether the reply replaces the message or is ephemeral.
- Assert action ids and who is listed, not a full Block Kit JSON snapshot: `expect(actionIds(view.blocks)).toContain("game_start")`. Skip tests that only check a mock was called.

## AWS and Slack

- One Lambda, Node.js 26, Function URL auth `NONE`, payload format 2.0. The handler rejects callers who lack the key.
- Read `FOOSBALL_API_KEY`, `SLACK_SIGNING_SECRET`, and `SLACK_BOT_TOKEN` from the environment. Fail startup if any is missing. The bot token is only for `chat.postMessage`, `chat.update`, and `chat.postEphemeral`.
- Generating a new API key on every deploy breaks the URL already pasted into Slack. Reuse `FOOSBALL_API_KEY` when it is set.
- Tables stay on-demand. Destroying the stack deletes them.
- Tag every stack resource `ManagedBy=foosball-aws-cdk`. Bootstrap uses the same tag.
- Do not commit `.env`, signing secrets, bot tokens, API keys, or a manifest that contains the real request URL.

## Done

A change is done when `npm run verify` passes, the new behavior is covered by a test that would fail if the behavior were removed, and `README.md` still matches the code. Update the README when a product rule changes, and this file when a fact in it changes.
