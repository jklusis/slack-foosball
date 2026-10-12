# Agent guide

`README.md` is the product and architecture spec. Follow it. If a change would add draws, another Slack Web API method, a second service, or CI, stop and ask.

## Commands

Once `package.json` exists:

```bash
npm test          # required before considering work done
npm run typecheck
npm run deploy    # or make deploy, or make update. Needs AWS credentials, SLACK_SIGNING_SECRET, and SLACK_BOT_TOKEN. Bootstraps, then reconciles the stack.
npm run destroy   # or make destroy. Deletes the stack and both tables. Needs the same Slack env vars, because synth reads them.
```

`npm test` must pass with no AWS account and no Slack app. Do not add a Docker or LocalStack dependency for unit tests.

## How to build

Work in vertical slices. For each slice, write the failing test first, then the code.

1. `src/domain/elo.ts` — the even-game case in the README (1000 → 1016 / 984) and a favorite who gains fewer points.
2. `src/domain/pairings.ts` — join order becomes the three 2v2 games, each person partners with each other person once, or the single 1v1.
3. `src/domain/game.ts` — phase transitions, including rejected actions.
4. `src/slack/render.ts` — blocks for each phase. Assert action ids and who is listed, not a full JSON snapshot.
5. `src/storage` — in-memory repository with conditional writes. Fifth player, double join, and double save are the cases that matter.
6. `src/handler.ts` — fixture payloads in, repository state and reply kind out.
7. DynamoDB adapter and the CDK stack, then `slack/manifest.yml` if the request URL contract changes.

Keep the domain free of Slack payloads and AWS types. Translate at `src/slack/parse.ts` and `src/storage/dynamo.ts`.

## Invariants

- Ratings start at 1000 in each format, K is 32, team rating is the average (a 1v1 side is one player), games in one session apply in order.
- A 2v2 result does not change a 1v1 rating, and the reverse. Save applies ratings once. A second save renders the completed game.
- Join order is the pairing order for a 2v2 long game. A 2v2 is Team A against Team B. The person who mentions `@Foosball 1v1`, `@Foosball 2v2`, or `@Foosball 2v2x3` is not on the roster until they join.
- Start exists only when the roster is full: two players for 1v1, four for 2v2. Join and Leave both exist for the whole open phase.
- After start, only those players can finish, cancel, pick, or save. Anyone can cancel while the game is open.
- An inapplicable click sends an ephemeral reply and does not change the message.
- Games and players are keyed by Slack `team_id`.
- Verify the API key and the Slack signature on the raw body before parsing. Mention replies go out with `chat.postMessage`. Button updates use `chat.update` on that message. A private note uses `chat.postEphemeral`. The HTTP response to a mention or a button click is 200, not the new message.

## Code shape

- One module, one reason to change. Add a helper when a second caller needs it.
- Model `Game` as a discriminated union on `phase` so an open game cannot carry results and a completed game cannot omit them.
- Expected user outcomes (`not-a-player`, `game-full`) are return values. Throw only when the process cannot continue (bad config, failed I/O, a broken invariant).
- Parse and validate at the handler boundary. The rest of the code accepts domain types.
- Name constants for the starting rating and K in the elo module.
- Prefer a short pure function over a class that only holds functions.
- Comments explain a non-obvious constraint (Slack's 3 second ack, raw-body signature). Do not comment the mechanics the code already shows.

## Tests

Test behavior a player would notice or a bug that would corrupt a rating or a roster.

- Cover the transition table: join, leave, start too early, start at four, non-player after start, cancel, pick, save, save again.
- Cover concurrent-style conditions on the repository: two joins of the same user, a fifth player, a third player on a 1v1, two saves, and a singles save that leaves the doubles rating in place.
- Handler tests use a fake repository and a fake Slack reply. Assert whether the reply replaces the message or is ephemeral.
- Skip tests that only check a mock was called, and skip snapshot files of Block Kit JSON.

## AWS and Slack

- One Lambda, Node.js 26, Function URL auth `NONE`, payload format 2.0. The handler rejects callers who lack the key.
- Read `FOOSBALL_API_KEY`, `SLACK_SIGNING_SECRET`, and `SLACK_BOT_TOKEN` from the environment. Fail startup if any is missing. The bot token is only for `chat.postMessage`.
- Generating a new API key on every deploy breaks the URL already pasted into Slack. Reuse `FOOSBALL_API_KEY` when it is set.
- Tables stay on-demand. Destroying the stack deletes them.
- Tag every stack resource `ManagedBy=foosball-aws-cdk`. Bootstrap uses the same tag.
- Do not commit `.env`, signing secrets, bot tokens, API keys, or a manifest that contains the real request URL.

## Done

A change is done when `npm test` passes, the new behavior is covered by a test that would fail if the behavior were removed, and `README.md` still matches the code. Update the README when a product rule changes.
