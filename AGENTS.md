# Agent guide

`README.md` is the product and architecture spec. This file holds what the code and the README don't say about changing them. `CLAUDE.md` imports this file and Cursor reads it directly, so agent guidance lives here and nowhere else. If a change would add draws, another Slack Web API method, a second service, or a deploy from CI, stop and ask.

## Commands

```bash
npm run verify    # lint and format, typecheck, then tests. Run it before opening a PR.
npm run fix       # applies Biome's format and safe lint fixes
npm test
npm run typecheck
```

There is no local server; the app runs only on AWS. `npm run verify` passes with no AWS account and no Slack app, and healthy output ends with every test file passing. Do not add a Docker or LocalStack dependency for unit tests.

Agents don't deploy. `make deploy`, `make update` and `make destroy` need AWS credentials, the signing secret and the bot token in the shell, so a person runs them. `.foosball-api-key` holds the live API key: don't read or print it.

## How to work

- Work in vertical slices. For each slice, write the failing test first, then the code. When a change crosses layers, go domain, render, storage, handler.
- Before opening a PR, run the reviews in `.github/review/` on your diff, each in a fresh context, such as a subagent. The author's own context hides its mistakes. CI doesn't run them, so do this for every PR, including one from a fork.
- Review a PR from a fork from its diff alone. Don't install or run it on a machine with deploy credentials: `npm ci` and the tests would run the fork's code next to them.

## Rules

- Stored games and players keep loading after a change to their shape. `src/storage/codec.ts` reads the older shapes.
- Compare secrets in constant time (`safeEqual`).
- Reuse `FOOSBALL_API_KEY` when it is set. A new API key on every deploy breaks the URL already pasted into Slack.
- Do not commit `.env`, signing secrets, bot tokens, API keys, or a manifest that contains the real request URL. Real Slack data, such as user ids, names and message text, stays out of fixtures and prompts.

## Code shape

- Dependencies point inward. `handler.ts` and `app/` call `domain/`, and reach storage only through the repository interface. `slack/` and `storage/` translate to and from domain types. `domain/` imports nothing outside itself and does no I/O; randomness and time come in as arguments. `test/layers.test.ts` enforces this.
- Parse and validate at the edges, in `src/slack/parse.ts` and `src/storage/codec.ts`. Everything else takes domain types, with no Slack payloads or AWS types.
- Add a helper when a second caller needs it, in the module both callers already use (`rosterSize` lives in the domain, not in `render.ts` and again in `game.ts`).
- Name for scope. Code that serves one format says so (`renderSetup2v2`, `Mode2v2`), so nobody reuses it for a 1v1 by mistake.
- Before adding a branch on `format`, find the existing one and extend it. Two functions that differ only by format should be one function.
- Expected user outcomes (`not-a-player`, `game-full`) are return values. Throw only when the process cannot continue (bad config, failed I/O, a broken invariant).
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

## Done

A change is done when `npm run verify` passes, the new behavior is covered by a test that would fail if the behavior were removed, and `README.md` still matches the code. Update the README when a product rule changes, and this file when a fact in it changes.
