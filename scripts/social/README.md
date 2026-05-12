# SNS daily posting

This folder contains the daily posting helper for the limited prerelease.

Target public accounts:

- Threads: `https://www.threads.com/@sensai_teke`
- X: `https://x.com/Teke_Sensai`

## What it does

- Picks one numerology oracle card from `1` to `33`.
- Creates the 7:00 daily oracle post text with the matching card image, image alt text, and the `あなたも今日の1枚を引かない？` free-entry CTA.
- Creates one lightweight concept post for the same day, focused on trust, self-understanding, and next-action framing.
- Writes a JSON draft under `data/social-posts/` when `--write` is used.
- Posts to Threads only when credentials are present and `--post` is used.
- Exports X manual-post drafts with text, image path, image alt text, schedule, and release phase.
- Runs due daily posts with `run-scheduled-posts.js`.

`data/` is gitignored, so generated drafts and state are not committed.

Official Threads references:

- `https://developers.facebook.com/docs/threads/get-started/get-access-tokens-and-permissions/`
- `https://developers.facebook.com/docs/threads/create-posts/`
- `https://developers.facebook.com/docs/threads/get-started/long-lived-tokens/`

## Compliance note

Threads automation uses the official Threads API. Do not use browser automation to script the Threads website for posting.

X automation should use the official X API. Do not use browser automation to script the X website for posting or draft saving.

This project does not use X API credentials. The supported X flow is: generate a checked draft artifact, attach the listed image, paste the text, add the alt text, then post manually in X.

## Release flow

The same phase schedule applies to Threads and X:

- Until `2026-05-15`: prelaunch promotion. No public URL, no "try it now" CTA, no purchase/price CTA.
- `2026-05-16` to `2026-05-29`: two-week prerelease. Free oracle/free reading links can appear. Paid CTA stays soft.
- `2026-05-30` to `2026-06-05`: fix/improvement period. Keep trust, feedback, and free-entry messaging dominant.
- From `2026-06-06`: full release. Monetization and deep-reading funnel can become clearer after BOOTH/order verification is confirmed.

## Threads first setup

Set these in `.env` on the machine that posts:

```env
PUBLIC_ORIGIN=https://rashin-senjutsu.onrender.com
THREADS_EXPECTED_USERNAME=sensai_teke
THREADS_APP_ID=
THREADS_APP_SECRET=
THREADS_REDIRECT_URI=https://rashin-senjutsu.onrender.com/auth/threads/callback
THREADS_SCOPES=threads_basic,threads_content_publish
SOCIAL_PLATFORMS=threads
```

Then run:

```powershell
npm run threads:connect
```

Open the printed URL in a browser and approve the `@sensai_teke` account. The callback page prints the exact exchange command.

If Meta blocks the OAuth redirect, use the User Token Generator on the same Threads API settings page and save that token locally:

```powershell
node scripts/social/threads-tool.js save-token --token="<token-from-user-token-generator>"
npm run threads:doctor
```

If only the callback URL is available, exchange it manually:

```powershell
node scripts/social/threads-tool.js exchange --url="<full-callback-url>"
```

After either path:

```powershell
npm run threads:doctor
```

The exchanged token is saved to `data/social-posts/threads-token.json`. That path is gitignored.

## Dry run

```powershell
npm run social:draft
npm run social:threads:draft
```

## Final review gate

Before posting, enabling a new calendar range, or reporting SNS automation as complete, run the mechanical audit, review the copy with `docs/sns-final-review-protocol.md`, and answer `docs/sns-auto-operation-agent-checklist.md`.

```powershell
npm run social:audit -- --from=2026-05-12 --to=2026-05-29 --platforms=threads,x
```

The audit blocks hard failures such as pre-release URLs, live-use CTAs before release, purchase/price wording before the BOOTH flow is ready, missing `#羅針占術`, excess hashtags, character-limit violations, and deterministic or fear-based fortune wording.

Hashtag policy:

- Threads: `#羅針占術` only.
- X: `#羅針占術 #AI占い` by default, up to two hashtags. Override with `SOCIAL_X_HASHTAGS` if needed.

The GitHub Actions workflow also audits the current JST date before publishing. A successful script check is not enough; pre-release posts must still be checked against the final review protocol for reader psychology, funnel fit, and whether the requested action is actually available that day.

## Write today's draft

```powershell
npm run social:write
```

## Post

```powershell
npm run social:threads:post
```

## X drafts, no API

Generate today's X drafts:

```powershell
npm run social:x:today
```

Generate a range:

```powershell
npm run social:x:drafts -- --from=2026-05-12 --to=2026-05-15 --kind=all
```

The output files are written under `data/social-posts/x-drafts/` by default. Each draft contains:

- X text under 280 characters.
- Image path and image URL.
- Alt text.
- Release phase.
- Manual posting notes.

Concept-image selection uses the available app assets:

- `images/ui/app-promo-vertical.png`: prelaunch, launch, and brand announcement posts.
- `images/ui/app-icon.png`: app/free-reading/how-to posts.
- `images/ui/app-hero-wide.png`: general concept/trust posts.

You can limit platforms:

```powershell
node scripts/social/daily-oracle-post.js --write --post --platforms=threads
```

X posting through `daily-oracle-post.js --post --platforms=x` is disabled unless `SOCIAL_X_API_POSTING_ENABLED=true` is explicitly set with official X API credentials. Do not use browser automation for X posting.

You can limit the post kind:

```powershell
node scripts/social/daily-oracle-post.js --write --post --kind=oracle
node scripts/social/daily-oracle-post.js --write --post --kind=concept
```

For one-off Threads image tests, pass alt text explicitly:

```powershell
node scripts/social/threads-tool.js post-image --file="post.txt" --image-url="https://rashin-senjutsu.onrender.com/images/cards/oracle/01.jpg" --alt-text="数秘オラクルカード No.1 The Guide。"
```

## Required environment variables for posting

X, official API only, not used in the current operation:

```env
X_API_KEY=
X_API_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_TOKEN_SECRET=
```

Threads:

```env
THREADS_EXPECTED_USERNAME=sensai_teke
THREADS_USER_ID=
THREADS_ACCESS_TOKEN=
THREADS_PUBLISH_WAIT_MS=30000
```

Shared:

```env
PUBLIC_ORIGIN=https://rashin-senjutsu.onrender.com
SOCIAL_AUTOMATED_POSTING_ENABLED=true
SOCIAL_PLATFORMS=threads
SOCIAL_ORACLE_TIME=07:00
SOCIAL_CONCEPT_TIME=20:00
SOCIAL_UTM_CAMPAIGN=202605_prerelease
SOCIAL_PAID_CTA_MODE=soft
SOCIAL_RELEASE_MODE=prelaunch
SOCIAL_BOOTH_ENABLED=false
SOCIAL_X_HASHTAGS=#羅針占術 #AI占い
```

`SOCIAL_PAID_CTA_MODE` accepts `off`, `soft`, or `active`.
Keep it at `soft` until the BOOTH product page, order-number input, and verification flow are confirmed in production. `active` only produces stronger paid CTA copy when `SOCIAL_BOOTH_ENABLED=true` and `BOOTH_DEEP_READING_URL` or `BOOTH_PRODUCT_URL` is configured.

Draft validation blocks dependency-building or fear-based wording, keeps Threads text under 500 characters, keeps X text under 280 characters, keeps Threads posts to the single `#羅針占術` hashtag, and keeps X posts to one or two hashtags.

When X is explicitly enabled with `--platforms=x` or `SOCIAL_PLATFORMS=x`, the script uses `xText` fields instead of reusing the Threads copy. X posts are shorter and use `utm_source=x`.

The prerelease calendar from `2026-05-12` to `2026-05-29` is built into `daily-oracle-post.js`. Outside that range, concept posts fall back to the evergreen trust-building pool.

## Scheduling

Use GitHub Actions schedule as the primary automation. Windows Task Scheduler and `npm run social:daemon` are backup only because they depend on a local PC being awake. A small Render Cron Job is an alternative if GitHub schedules are not acceptable.

GitHub Actions is the preferred no-cost option when exact-to-the-minute posting is not required. Add these repository secrets before enabling the workflow on `main`:

```text
THREADS_ACCESS_TOKEN
THREADS_USER_ID
```

The workflow file is `.github/workflows/threads-social.yml`.

X draft artifacts are generated by `.github/workflows/x-social-drafts.yml`. This workflow has no X credentials and does not post. It exports the checked manual-post draft package as a GitHub Actions artifact. A scheduled X draft run must produce artifact files or fail; do not treat a no-file run as successful X operation.

GitHub schedule runs in UTC. The minutes are intentionally not `00` because GitHub scheduled workflows at the top of the hour can be delayed or dropped under load. The workflow runs four times per hour and the script decides whether a post is due; duplicate protection checks existing Threads posts before publishing:

- `7,22,37,52 * * * *`: checks for due posts at roughly `:07/:22/:37/:52` every hour
- Before 07:00 JST nothing is due.
- After 07:00 JST the oracle post is due unless an existing matching Threads post is found.
- After 20:00 JST the concept post is due unless an existing matching Threads post is found.
- `8,23,38,53 22,11 * * *`: checks X draft generation at roughly `07:08/07:23/07:38/07:53` and `20:08/20:23/20:38/20:53` JST.

Manual dispatch can still force `oracle` or `concept` for emergency retries.

Threads posts are not treated as successful only because the publish API returned an ID. The client verifies the published post by ID after publishing. Image posts also wait for the media container to become ready before publishing; if image publication cannot be verified, the GitHub workflow falls back to a text-only Threads post instead of silently reporting success.

Pre-release posts before `2026-05-16` are teaser posts only. They must not include public URLs or UTM links in the visible post text; links start on the release date.

Recommended split:

- `07:00 Asia/Tokyo`: oracle image post
- `20:00 Asia/Tokyo`: concept post

Run a dry check:

```powershell
node scripts/social/run-scheduled-posts.js --dry-run
```

Run once and post anything due today:

```powershell
npm run social:run-due
```

Run only one scheduled lane while keeping the duplicate-post state guard:

```powershell
node scripts/social/run-scheduled-posts.js --once --only-kind=oracle
node scripts/social/run-scheduled-posts.js --once --only-kind=concept
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/social/run-scheduled-post.ps1 -Kind oracle
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/social/run-scheduled-post.ps1 -Kind concept
```

Run as a long-lived local process:

```powershell
npm run social:daemon
```

Force a post manually:

```powershell
node scripts/social/run-scheduled-posts.js --force-kind=oracle
node scripts/social/run-scheduled-posts.js --force-kind=concept
```

The scheduler writes `data/social-posts/scheduled-post-state.json` and will not post the same kind twice on the same JST date after a successful post.
