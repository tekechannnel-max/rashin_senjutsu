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
- Keeps X support available only when `--platforms=x` is explicitly used.
- Runs due daily posts with `run-scheduled-posts.js`.

`data/` is gitignored, so generated drafts and state are not committed.

Official Threads references:

- `https://developers.facebook.com/docs/threads/get-started/get-access-tokens-and-permissions/`
- `https://developers.facebook.com/docs/threads/create-posts/`
- `https://developers.facebook.com/docs/threads/get-started/long-lived-tokens/`

## Compliance note

Threads automation uses the official Threads API. Do not use browser automation to script the Threads website for posting.

X automation should use the official X API. Do not use browser automation to script the X website for posting.

For an automated X account, enable the automated account label and make the account bio clear about who operates it. Keep posts non-duplicative, avoid unsolicited mentions/replies/DMs, and keep the volume low.

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

## Write today's draft

```powershell
npm run social:write
```

## Post

```powershell
npm run social:threads:post
```

You can limit platforms:

```powershell
node scripts/social/daily-oracle-post.js --write --post --platforms=x
node scripts/social/daily-oracle-post.js --write --post --platforms=threads
```

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

X:

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
```

`SOCIAL_PAID_CTA_MODE` accepts `off`, `soft`, or `active`.
Keep it at `soft` until the BOOTH product page, order-number input, and verification flow are confirmed in production. `active` only produces stronger paid CTA copy when `SOCIAL_BOOTH_ENABLED=true` and `BOOTH_DEEP_READING_URL` or `BOOTH_PRODUCT_URL` is configured.

Draft validation blocks dependency-building or fear-based wording, keeps Threads text under 500 characters, keeps X text under 280 characters, and keeps posts to the single `#羅針占術` hashtag.

When X is explicitly enabled with `--platforms=x` or `SOCIAL_PLATFORMS=x`, the script uses `xText` fields instead of reusing the Threads copy. X posts are shorter and use `utm_source=x`.

The prerelease calendar from `2026-05-12` to `2026-05-29` is built into `daily-oracle-post.js`. Outside that range, concept posts fall back to the evergreen trust-building pool.

## Scheduling

Use GitHub Actions schedule, Windows Task Scheduler, or a small Render Cron Job.

GitHub Actions is the preferred no-cost option when exact-to-the-minute posting is not required. Add these repository secrets before enabling the workflow on `main`:

```text
THREADS_ACCESS_TOKEN
THREADS_USER_ID
```

The workflow file is `.github/workflows/threads-social.yml`.

GitHub schedule runs in UTC. The minutes are intentionally not `00` because GitHub scheduled workflows at the top of the hour can be delayed or dropped under load. The workflow runs four times per hour and the script decides whether a post is due; duplicate protection checks existing Threads posts before publishing:

- `3,18,33,48 * * * *`: checks for due posts at roughly `:03/:18/:33/:48` every hour
- Before 07:00 JST nothing is due.
- After 07:00 JST the oracle post is due unless an existing matching Threads post is found.
- After 20:00 JST the concept post is due unless an existing matching Threads post is found.

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
